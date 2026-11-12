/**
 * GET /api/disputes/[id]/evidence-packet
 * Returns all HUMAN_VERIFIED evidence matches for this dispute,
 * including extracted fields needed to build the submission packet.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/supabase/admin';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: disputeId } = await params;

    // Fetch all HUMAN_VERIFIED matches with their document info and requirement type
    const { data: matches, error } = await supabaseAdmin
      .from('evidence_matches')
      .select(`
        id,
        document_id,
        requirement_id,
        review_status,
        match_confidence,
        ai_explanation,
        supporting_excerpt,
        page_number,
        ai_runs (
          output
        ),
        documents (
          id,
          original_filename,
          mime_type,
          size_bytes,
          source_type
        ),
        evidence_requirements (
          paypal_evidence_type
        )
      `)
      .eq('dispute_id', disputeId)
      .eq('review_status', 'HUMAN_VERIFIED');

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const verifiedMatches = (matches || []).map((m: any) => {
      const output = m.ai_runs?.output || {};
      const fields = output.extracted_fields || {};
      return {
        matchId: m.id,
        documentId: m.document_id,
        documentFilename: m.documents?.original_filename ?? 'Unknown',
        documentMimeType: m.documents?.mime_type ?? 'application/octet-stream',
        documentSizeBytes: m.documents?.size_bytes ?? 0,
        documentProvenance: m.documents?.source_type ?? 'MERCHANT_UPLOAD',
        requirementType: m.evidence_requirements?.paypal_evidence_type ?? 'OTHER',
        confidence: m.match_confidence ?? output.confidence ?? 0,
        carrier: fields.carrier ?? null,
        trackingNumber: fields.tracking_number ?? null,
        deliveryStatus: fields.delivery_status ?? null,
        recommendation: output.recommendation || m.ai_explanation || '',
        missingFields: output.missing_fields ?? [],
        sourceReferences: output.source_references ?? (m.supporting_excerpt ? [{ page: m.page_number || 1, excerpt: m.supporting_excerpt }] : []),
      };
    });

    return NextResponse.json({ success: true, data: { verifiedMatches } });
  } catch (err: any) {
    console.error('Evidence packet fetch error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
