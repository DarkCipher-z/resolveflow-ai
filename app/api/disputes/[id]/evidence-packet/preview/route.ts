/**
 * POST /api/disputes/[id]/evidence-packet/preview
 *
 * Builds and returns the exact evidence submission request structure
 * WITHOUT calling any PayPal API endpoint.
 *
 * Request body:
 *   { disputeId, paypalDisputeId, notes, documentIds: string[] }
 *
 * Returns the preview object with endpoint, inputJson, attachedFiles, and warnings.
 * No mutating PayPal action is taken.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/server/supabase/admin';
import { buildEvidencePreview } from '@/server/paypal/evidence';

const BodySchema = z.object({
  disputeId: z.string().uuid(),
  paypalDisputeId: z.string().min(1),
  notes: z.string().max(2000),
  documentIds: z.array(z.string().uuid()).min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: disputeId } = await params;
    const body = await req.json();
    const parsed = BodySchema.safeParse({ ...body, disputeId });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors.map((e) => e.message).join('; ') },
        { status: 400 }
      );
    }

    const { paypalDisputeId, notes, documentIds } = parsed.data;

    // Gather HUMAN_VERIFIED matches for these documents to build evidences array
    const { data: matches, error: matchError } = await supabaseAdmin
      .from('evidence_matches')
      .select('document_id, requirement_id, ai_runs(output), evidence_requirements(paypal_evidence_type)')
      .eq('dispute_id', disputeId)
      .eq('review_status', 'HUMAN_VERIFIED')
      .in('document_id', documentIds);

    if (matchError) {
      return NextResponse.json({ success: false, error: matchError.message }, { status: 500 });
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No HUMAN_VERIFIED matches found for these documents. Confirm evidence in the Evidence Checklist first.',
        },
        { status: 400 }
      );
    }

    // Build evidences array — group by evidence type
    type EvidenceAccum = {
      evidence_type: string;
      tracking_info: Array<{ carrier_name: string; tracking_number: string }>;
      notes: string;
      document_ids: string[];
    };

    const byType = new Map<string, EvidenceAccum>();

    for (const m of matches) {
      const evidenceType: string = (m as any).evidence_requirements?.paypal_evidence_type ?? 'OTHER';
      if (!byType.has(evidenceType)) {
        byType.set(evidenceType, {
          evidence_type: evidenceType,
          tracking_info: [],
          notes,
          document_ids: [],
        });
      }
      const entry = byType.get(evidenceType)!;
      entry.document_ids.push((m as any).document_id);

      // Attach tracking if available from AI output
      const aiOutput = (m as any).ai_runs?.output;
      const carrier = aiOutput?.extracted_fields?.carrier;
      const tracking = aiOutput?.extracted_fields?.tracking_number;
      if (carrier && tracking) {
        const carrierEnum = carrier.toUpperCase().replace(/\s+/g, '_');
        entry.tracking_info.push({
          carrier_name: ['FEDEX', 'UPS', 'USPS', 'DHL', 'DPD', 'TNT', 'OTHER'].includes(carrierEnum)
            ? carrierEnum
            : 'OTHER',
          tracking_number: tracking,
        });
      }
    }

    const evidences = Array.from(byType.values()).map((e) => ({
      evidence_type: e.evidence_type as any,
      tracking_info: e.tracking_info.length > 0 ? e.tracking_info : undefined,
      notes: e.notes,
      document_ids: e.document_ids,
    }));

    const packet = {
      dispute_id: disputeId,
      paypal_dispute_id: paypalDisputeId,
      evidences,
    };

    const preview = await buildEvidencePreview(packet);

    return NextResponse.json({ success: true, data: preview });
  } catch (err: any) {
    console.error('Evidence preview error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
