import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/server/supabase/admin';
import { getOrCreateDemoOrganization, DEMO_USER_ID } from '@/server/supabase/seed-demo';
import {
  detectMagicBytes,
  computeSha256,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_BATCH_SIZE_BYTES,
} from '@/lib/document-validation';

const STORAGE_BUCKET = 'evidence';
const SIGNED_URL_EXPIRES_IN = 3600; // 1 hour

/**
 * Helper to resolve dispute by UUID or paypal_dispute_id
 */
async function resolveDispute(id: string, orgId: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  let query = supabaseAdmin
    .from('disputes')
    .select('id, organization_id, paypal_dispute_id')
    .eq('organization_id', orgId);

  if (isUuid) {
    query = query.eq('id', id);
  } else {
    query = query.eq('paypal_dispute_id', id);
  }

  const { data: dispute, error } = await query.single();
  if (error || !dispute) return null;
  return dispute;
}

/**
 * GET /api/disputes/[id]/documents
 * Lists all documents uploaded for this dispute with temporary signed download URLs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orgId = await getOrCreateDemoOrganization();
    const dispute = await resolveDispute(id, orgId);

    if (!dispute) {
      return NextResponse.json({ success: false, error: 'Dispute not found' }, { status: 404 });
    }

    const { data: docs, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('dispute_id', dispute.id)
      .order('uploaded_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Generate short-lived signed URLs for each document
    const docsWithUrls = await Promise.all(
      (docs || []).map(async (doc) => {
        let signedUrl: string | null = null;
        try {
          const { data: urlData } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(doc.storage_path, SIGNED_URL_EXPIRES_IN);
          signedUrl = urlData?.signedUrl ?? null;
        } catch {
          signedUrl = null;
        }
        return {
          ...doc,
          signedUrl,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: docsWithUrls,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to list documents' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/disputes/[id]/documents
 * Accepts multipart/form-data upload, validates file type via magic bytes,
 * computes SHA-256, rejects duplicates, stores in private bucket, and logs audit.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orgId = await getOrCreateDemoOrganization();
    const dispute = await resolveDispute(id, orgId);

    if (!dispute) {
      return NextResponse.json({ success: false, error: 'Dispute not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      // Fallback check for single 'file' field
      const singleFile = formData.get('file') as File | null;
      if (singleFile) files.push(singleFile);
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided for upload' },
        { status: 400 }
      );
    }

    // Check total batch size
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > MAX_TOTAL_BATCH_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `Total batch size exceeds maximum limit of 50 MB (received ${(totalSize / (1024 * 1024)).toFixed(1)} MB)`,
        },
        { status: 400 }
      );
    }

    const uploadedDocuments = [];

    for (const file of files) {
      // Check individual file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `File "${file.name}" exceeds the 10 MB per-file limit (size: ${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
          },
          { status: 400 }
        );
      }

      if (file.size === 0) {
        return NextResponse.json(
          { success: false, error: `File "${file.name}" is empty (0 bytes)` },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Verify magic bytes (reject disguised executables, txt, etc.)
      const detected = detectMagicBytes(buffer);
      if (!detected) {
        return NextResponse.json(
          {
            success: false,
            error: `File "${file.name}" has an unsupported format or corrupted header. Only PDF, JPG, PNG, and GIF files are accepted.`,
          },
          { status: 400 }
        );
      }

      // Compute SHA-256 checksum
      const sha256 = computeSha256(buffer);

      // Check for duplicate document per dispute
      const { data: existingDoc } = await supabaseAdmin
        .from('documents')
        .select('id, original_filename, uploaded_at')
        .eq('dispute_id', dispute.id)
        .eq('sha256_hash', sha256)
        .single();

      if (existingDoc) {
        return NextResponse.json(
          {
            success: false,
            error: `Duplicate document detected: "${file.name}" matches existing file "${existingDoc.original_filename}" (identical SHA-256 checksum: ${sha256.substring(0, 12)}...)`,
          },
          { status: 409 }
        );
      }

      // Generate random storage path inside dispute folder
      const randomId = crypto.randomUUID();
      const storagePath = `${dispute.id}/${randomId}.${detected.extension}`;

      // Upload to private Supabase Storage bucket
      const { error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: detected.mimeType,
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return NextResponse.json(
          {
            success: false,
            error: `Failed to upload file to storage: ${uploadError.message}`,
          },
          { status: 500 }
        );
      }

      // Insert row in documents table
      const { data: docRow, error: insertError } = await supabaseAdmin
        .from('documents')
        .insert({
          organization_id: dispute.organization_id,
          dispute_id: dispute.id,
          original_filename: file.name,
          storage_path: storagePath,
          mime_type: detected.mimeType,
          size_bytes: buffer.length,
          sha256_hash: sha256,
          source_type: 'MERCHANT_UPLOAD',
          processing_status: 'PENDING',
          uploaded_by: DEMO_USER_ID,
        })
        .select()
        .single();

      if (insertError || !docRow) {
        console.error('Database insert error:', insertError);
        return NextResponse.json(
          {
            success: false,
            error: `Failed to record document in database: ${insertError?.message}`,
          },
          { status: 500 }
        );
      }

      // Log audit record
      await supabaseAdmin.from('audit_logs').insert({
        organization_id: dispute.organization_id,
        actor_user_id: DEMO_USER_ID,
        actor_type: 'USER',
        action_type: 'DOCUMENT_UPLOAD',
        entity_type: 'documents',
        entity_id: docRow.id,
        new_value: {
          original_filename: file.name,
          storage_path: storagePath,
          mime_type: detected.mimeType,
          size_bytes: buffer.length,
          sha256_hash: sha256,
          source_type: 'MERCHANT_UPLOAD',
        },
      });

      // Generate signed URL
      const { data: signedData } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN);

      uploadedDocuments.push({
        ...docRow,
        signedUrl: signedData?.signedUrl ?? null,
      });
    }

    return NextResponse.json({
      success: true,
      data: uploadedDocuments,
    });
  } catch (err: any) {
    console.error('Document upload error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'An unexpected error occurred during upload' },
      { status: 500 }
    );
  }
}
