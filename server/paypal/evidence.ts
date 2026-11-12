/**
 * PayPal Evidence Submission Client
 *
 * Implements POST /v1/customer/disputes/{id}/provide-evidence.
 *
 * REQUEST CONTRACT (from official PayPal Disputes API reference):
 * ---------------------------------------------------------------
 * Endpoint:     POST https://api-m.sandbox.paypal.com/v1/customer/disputes/{dispute_id}/provide-evidence
 * Content-Type: multipart/form-data (browser-generated boundary)
 *
 * Form parts:
 *   - Part name:         "input"
 *     Content-Type:      application/json
 *     Body (JSON):
 *       {
 *         "evidences": [
 *           {
 *             "evidence_type":  "PROOF_OF_FULFILLMENT",   // | "PROOF_OF_REFUND" | "PROOF_OF_SHIPMENT" | "OTHER"
 *             "evidence_info": {
 *               "tracking_info": [                        // optional; for fulfillment disputes
 *                 {
 *                   "carrier_name":        string,         // enum, e.g. "FEDEX" | "UPS" | "USPS" | "DHL" | "OTHER"
 *                   "carrier_name_other":  string?,        // required if carrier_name === "OTHER"; max 2000 chars
 *                   "tracking_number":     string,         // 1–255 chars
 *                   "tracking_url":        string?         // optional convenience link
 *                 }
 *               ]
 *             },
 *             "notes": string    // 1–2000 chars. Must NOT claim delivery or guarantee outcomes.
 *           }
 *         ]
 *       }
 *
 *   - Part name(s):  "file1", "file2", ...  (one per attached document)
 *     Content-Type:  mime type of the file (application/pdf | image/jpeg | image/png | image/gif)
 *     Body:          binary file bytes
 *
 * File constraints:
 *   - Supported types: .pdf, .jpg, .jpeg, .png, .gif
 *   - Per-file limit:  < 10 MB
 *   - Total payload:   <= 50 MB per API call
 *
 * RULE: Never claim delivery in notes. Never call escalate, accept_claim, make_offer, or send_message.
 */

import { supabaseAdmin } from '../supabase/admin';
import { getPayPalAccessToken } from './auth';
import { PayPalAPIError } from './errors';
import z from 'zod';

const PAYPAL_BASE = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
const STORAGE_BUCKET = 'evidence';

/** Validated structure for one evidence item in the submission packet */
export const EvidenceItemSchema = z.object({
  evidence_type: z.enum(['PROOF_OF_FULFILLMENT', 'PROOF_OF_REFUND', 'PROOF_OF_SHIPMENT', 'OTHER']),
  tracking_info: z
    .array(
      z.object({
        carrier_name: z.string().min(1).max(255),
        carrier_name_other: z.string().max(2000).optional(),
        tracking_number: z.string().min(1).max(255),
        tracking_url: z.string().url().optional(),
      })
    )
    .optional(),
  notes: z.string().min(1).max(2000),
  document_ids: z.array(z.string().uuid()), // internal Supabase document IDs to attach as files
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const EvidencePacketSchema = z.object({
  dispute_id: z.string(),         // internal Supabase dispute UUID
  paypal_dispute_id: z.string(),  // e.g. PP-R-YYP-10198826
  evidences: z.array(EvidenceItemSchema).min(1),
});

export type EvidencePacket = z.infer<typeof EvidencePacketSchema>;

/** Human-readable preview of the request that will be sent — does NOT call PayPal */
export interface EvidencePreview {
  endpoint: string;
  method: 'POST';
  inputJson: object;        // the "input" JSON part that will be sent
  attachedFiles: Array<{
    fieldName: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    documentId: string;
    provenance: string;
    reviewStatus: string;
  }>;
  estimatedTotalBytes: number;
  warnings: string[];
}

/**
 * Builds a preview of the evidence submission request WITHOUT sending it.
 * Only includes documents with review_status = 'HUMAN_VERIFIED'.
 */
export async function buildEvidencePreview(packet: EvidencePacket): Promise<EvidencePreview> {
  const warnings: string[] = [];

  // Gather all document_ids from all evidences
  const allDocIds = packet.evidences.flatMap((e) => e.document_ids);

  // Fetch documents from DB — only HUMAN_VERIFIED documents may be included
  const { data: docs, error } = await supabaseAdmin
    .from('documents')
    .select('id, original_filename, mime_type, size_bytes, storage_path, source_type, processing_status')
    .in('id', allDocIds);

  if (error) throw new Error(`Failed to fetch documents: ${error.message}`);

  // Also check for any HUMAN_VERIFIED evidence_matches
  const { data: matchRows } = await supabaseAdmin
    .from('evidence_matches')
    .select('document_id, review_status')
    .in('document_id', allDocIds);

  const verifiedDocIds = new Set(
    (matchRows || [])
      .filter((m) => m.review_status === 'HUMAN_VERIFIED')
      .map((m) => m.document_id)
  );

  // Build input JSON
  const inputJsonEvidences = packet.evidences.map((ev) => {
    const item: any = {
      evidence_type: ev.evidence_type,
      notes: ev.notes,
    };
    if (ev.tracking_info && ev.tracking_info.length > 0) {
      item.evidence_info = { tracking_info: ev.tracking_info };
    }
    return item;
  });

  // Validate notes — warn if anything could be interpreted as a delivery claim
  const deliveryClaimPatterns = [/deliver(ed|y)/i, /proof of delivery/i, /confirmed delivery/i, /received by/i];
  for (const ev of packet.evidences) {
    for (const pattern of deliveryClaimPatterns) {
      if (pattern.test(ev.notes)) {
        warnings.push(
          `Warning: Notes for ${ev.evidence_type} may contain delivery claim language ("${pattern.source}"). ` +
          'AI must not claim delivery — a tracking number does not prove delivery.'
        );
      }
    }
  }

  // Build attached files list (only HUMAN_VERIFIED docs)
  let fileIndex = 1;
  const attachedFiles: EvidencePreview['attachedFiles'] = [];
  let totalBytes = 0;

  for (const ev of packet.evidences) {
    for (const docId of ev.document_ids) {
      const doc = (docs || []).find((d) => d.id === docId);
      if (!doc) {
        warnings.push(`Document ${docId} not found in database — it will be skipped.`);
        continue;
      }

      if (!verifiedDocIds.has(docId)) {
        warnings.push(
          `Document "${doc.original_filename}" (${docId.slice(0, 8)}…) has NOT been HUMAN_VERIFIED. ` +
          'It will NOT be included in the submission. Confirm the AI match in the Evidence Checklist first.'
        );
        continue;
      }

      if (doc.size_bytes >= 10 * 1024 * 1024) {
        warnings.push(`Document "${doc.original_filename}" is >= 10 MB and will be rejected by PayPal.`);
      }

      attachedFiles.push({
        fieldName: `file${fileIndex}`,
        originalFilename: doc.original_filename,
        mimeType: doc.mime_type,
        sizeBytes: doc.size_bytes,
        documentId: doc.id,
        provenance: doc.source_type,
        reviewStatus: matchRows?.find((m) => m.document_id === doc.id)?.review_status ?? 'NO_MATCH',
      });
      totalBytes += doc.size_bytes;
      fileIndex++;
    }
  }

  if (totalBytes > 50 * 1024 * 1024) {
    warnings.push(`Total file size (${(totalBytes / 1024 / 1024).toFixed(1)} MB) exceeds 50 MB PayPal limit.`);
  }

  if (attachedFiles.length === 0) {
    warnings.push('No HUMAN_VERIFIED documents will be attached. At least one is required.');
  }

  return {
    endpoint: `${PAYPAL_BASE}/v1/customer/disputes/${packet.paypal_dispute_id}/provide-evidence`,
    method: 'POST',
    inputJson: { evidences: inputJsonEvidences },
    attachedFiles,
    estimatedTotalBytes: totalBytes,
    warnings,
  };
}

/**
 * Submits evidence to PayPal Sandbox.
 * MUST only be called after a human has reviewed the preview and explicitly confirmed.
 * Always re-fetches the dispute state before submitting.
 */
export async function submitEvidence(
  packet: EvidencePacket
): Promise<{ success: boolean; paypalResponse: any }> {
  // 1. Build preview to get verified document list (this also validates)
  const preview = await buildEvidencePreview(packet);

  if (preview.attachedFiles.length === 0) {
    throw new Error('No HUMAN_VERIFIED documents to submit. Confirm evidence matches in the UI first.');
  }

  // 2. Get access token
  const token = await getPayPalAccessToken();

  // 3. Build multipart/form-data
  const formData = new FormData();

  // 3a. JSON "input" part
  const inputJson = JSON.stringify(preview.inputJson);
  const inputBlob = new Blob([inputJson], { type: 'application/json' });
  formData.append('input', inputBlob);

  // 3b. File parts — download from Supabase storage and attach
  for (const fileEntry of preview.attachedFiles) {
    const doc = await supabaseAdmin
      .from('documents')
      .select('storage_path, mime_type')
      .eq('id', fileEntry.documentId)
      .single();

    if (doc.error || !doc.data) {
      throw new Error(`Cannot retrieve storage path for document ${fileEntry.documentId}`);
    }

    const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .download(doc.data.storage_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file for submission: ${downloadError?.message}`);
    }

    formData.append(fileEntry.fieldName, fileBlob, fileEntry.originalFilename);
  }

  // 4. POST to PayPal Sandbox
  const url = `${PAYPAL_BASE}/v1/customer/disputes/${packet.paypal_dispute_id}/provide-evidence`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // NOTE: Do NOT set Content-Type here — fetch will set multipart/form-data with boundary automatically
    },
    body: formData,
  });

  if (res.ok) {
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    return { success: true, paypalResponse: body };
  }

  const errorBody = await res.json().catch(() => ({}));
  throw new PayPalAPIError(
    `PayPal provide-evidence failed (${res.status}): ${errorBody.message || JSON.stringify(errorBody)}`,
    res.status,
    errorBody
  );
}
