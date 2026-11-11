import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/supabase/admin';
import { getOrCreateDemoOrganization } from '@/server/supabase/seed-demo';
import { evidenceCoverage, deadlinePriority } from '@/lib/dispute-helpers';

export async function GET(req: Request) {
  try {
    const orgId = await getOrCreateDemoOrganization();
    const url = new URL(req.url);
    const search = url.searchParams.get('search');
    const statusFilter = url.searchParams.get('status');

    let query = supabaseAdmin
      .from('disputes')
      .select(`
        *,
        evidence_requirements (*)
      `)
      .eq('organization_id', orgId)
      .order('seller_response_due_at', { ascending: true, nullsFirst: false });

    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'ACTION_REQUIRED') {
        query = query.eq('status', 'WAITING_FOR_SELLER_RESPONSE');
      } else if (statusFilter === 'WAITING_FOR_BUYER') {
        query = query.eq('status', 'WAITING_FOR_BUYER_RESPONSE');
      } else if (statusFilter === 'UNDER_REVIEW') {
        query = query.eq('status', 'UNDER_REVIEW');
      } else if (statusFilter === 'RESOLVED') {
        query = query.eq('status', 'RESOLVED');
      }
    }

    if (search) {
      query = query.ilike('paypal_dispute_id', `%${search.trim()}%`);
    }

    const { data: disputes, error } = await query;

    if (error) {
      console.error('Error fetching disputes:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Enhance with computed metrics
    const enriched = (disputes || []).map((d) => {
      const coverage = evidenceCoverage(d.evidence_requirements || []);
      const priority = deadlinePriority(d.seller_response_due_at);
      return {
        ...d,
        coverage,
        priority,
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to get disputes' },
      { status: 500 }
    );
  }
}
