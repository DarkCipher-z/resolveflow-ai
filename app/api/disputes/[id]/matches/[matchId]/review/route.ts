import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/supabase/admin';
import { getOrCreateDemoOrganization, DEMO_USER_ID } from '@/server/supabase/seed-demo';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id, matchId } = await params;
    const body = await req.json();
    const action = body.action; // 'CONFIRM' | 'REJECT'

    if (!['CONFIRM', 'REJECT'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be CONFIRM or REJECT.' },
        { status: 400 }
      );
    }

    const orgId = await getOrCreateDemoOrganization();

    // 1. Fetch existing match
    const { data: match, error: matchFetchError } = await supabaseAdmin
      .from('evidence_matches')
      .select('*, evidence_requirements (*)')
      .eq('id', matchId)
      .single();

    if (matchFetchError || !match) {
      return NextResponse.json({ success: false, error: 'Match record not found' }, { status: 404 });
    }

    const newReviewStatus = action === 'CONFIRM' ? 'HUMAN_VERIFIED' : 'REJECTED';
    const now = new Date().toISOString();

    // 2. Update evidence_matches row
    const { error: updateMatchError } = await supabaseAdmin
      .from('evidence_matches')
      .update({
        review_status: newReviewStatus,
        reviewed_by: DEMO_USER_ID,
        reviewed_at: now,
      })
      .eq('id', matchId);

    if (updateMatchError) {
      return NextResponse.json(
        { success: false, error: `Failed to update match: ${updateMatchError.message}` },
        { status: 500 }
      );
    }

    // 3. Update requirement status
    const reqId = match.requirement_id;
    if (action === 'CONFIRM') {
      // Confirmed by human -> requirement becomes HUMAN_VERIFIED
      await supabaseAdmin
        .from('evidence_requirements')
        .update({ requirement_status: 'HUMAN_VERIFIED', updated_at: now })
        .eq('id', reqId);
    } else {
      // Rejected -> check if other matches exist for this requirement
      const { data: otherMatches } = await supabaseAdmin
        .from('evidence_matches')
        .select('id, review_status')
        .eq('requirement_id', reqId)
        .neq('id', matchId);

      const hasVerified = (otherMatches || []).some((m) => m.review_status === 'HUMAN_VERIFIED');
      const hasCandidate = (otherMatches || []).some((m) => m.review_status === 'AI_SUGGESTED');

      const nextReqStatus = hasVerified
        ? 'HUMAN_VERIFIED'
        : hasCandidate
        ? 'CANDIDATE_FOUND'
        : 'MISSING';

      await supabaseAdmin
        .from('evidence_requirements')
        .update({ requirement_status: nextReqStatus, updated_at: now })
        .eq('id', reqId);
    }

    // 4. Record audit log
    await supabaseAdmin.from('audit_logs').insert({
      organization_id: match.organization_id,
      actor_user_id: DEMO_USER_ID,
      actor_type: 'USER',
      action_type: action === 'CONFIRM' ? 'EVIDENCE_MATCH_CONFIRMED' : 'EVIDENCE_MATCH_REJECTED',
      entity_type: 'evidence_matches',
      entity_id: matchId,
      old_value: {
        review_status: match.review_status,
      },
      new_value: {
        review_status: newReviewStatus,
        reviewed_by: DEMO_USER_ID,
        reviewed_at: now,
        action,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        matchId,
        review_status: newReviewStatus,
        reviewed_at: now,
      },
    });
  } catch (err: any) {
    console.error('Review match error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to review evidence match' },
      { status: 500 }
    );
  }
}
