import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/supabase/admin';
import { getOrCreateDemoOrganization } from '@/server/supabase/seed-demo';
import { runDocumentAnalysisPipeline } from '@/server/ai/pipeline';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const orgId = await getOrCreateDemoOrganization();

    // Resolve dispute ID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let query = supabaseAdmin
      .from('disputes')
      .select('id, organization_id')
      .eq('organization_id', orgId);

    if (isUuid) {
      query = query.eq('id', id);
    } else {
      query = query.eq('paypal_dispute_id', id);
    }

    const { data: dispute, error: disputeError } = await query.single();
    if (disputeError || !dispute) {
      return NextResponse.json({ success: false, error: 'Dispute not found' }, { status: 404 });
    }

    const result = await runDocumentAnalysisPipeline(docId, dispute.id);

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (err: any) {
    console.error('Analyze route error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to analyze document' },
      { status: 500 }
    );
  }
}
