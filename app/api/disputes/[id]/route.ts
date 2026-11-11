import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/supabase/admin';
import { getOrCreateDemoOrganization } from '@/server/supabase/seed-demo';
import { deriveAllowedActions } from '@/server/paypal/disputes';
import { evidenceCoverage, deadlinePriority } from '@/lib/dispute-helpers';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orgId = await getOrCreateDemoOrganization();

    // Fetch dispute either by internal UUID or paypal_dispute_id
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query = supabaseAdmin
      .from('disputes')
      .select(`
        *,
        evidence_requirements (*),
        transactions (*),
        documents (*),
        evidence_matches (*)
      `)
      .eq('organization_id', orgId);

    if (isUuid) {
      query = query.eq('id', id);
    } else {
      query = query.eq('paypal_dispute_id', id);
    }

    const { data: dispute, error } = await query.single();

    if (error || !dispute) {
      return NextResponse.json({ success: false, error: 'Dispute not found' }, { status: 404 });
    }

    // Derive actions from both allowed_response_options and links stored in snapshot
    const snapshot = dispute.paypal_snapshot || {};
    const allowedActions = deriveAllowedActions(snapshot);
    const coverage = evidenceCoverage(dispute.evidence_requirements || []);
    const priority = deadlinePriority(dispute.seller_response_due_at);

    return NextResponse.json({
      success: true,
      data: {
        ...dispute,
        allowedActions,
        coverage,
        priority,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to get dispute' },
      { status: 500 }
    );
  }
}
