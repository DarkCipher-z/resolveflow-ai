/**
 * POST /api/disputes/[id]/evidence-packet/submit
 *
 * Submits evidence to PayPal Sandbox after human confirmation.
 * SAFETY: Always re-fetches dispute state before submitting.
 * Records submission in evidence_submissions table and audit_logs.
 *
 * Request body:
 *   { paypalDisputeId, notes, documentIds: string[] }
 *
 * RULE: Never call escalate, accept_claim, make_offer, or send_message.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/server/supabase/admin';
import { buildEvidencePreview, submitEvidence } from '@/server/paypal/evidence';
import { fetchDisputeDetail, deriveAllowedActions } from '@/server/paypal/disputes';
import { syncSingleDispute } from '@/server/sync/disputes';

const BodySchema = z.object({
  disputeId: z.string().uuid(),
  paypalDisputeId: z.string().min(1),
  notes: z.string().min(1).max(2000),
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

    // Step 1: Fresh re-fetch of dispute state from PayPal (spec rule 4)
    let freshDispute;
    try {
      freshDispute = await fetchDisputeDetail(paypalDisputeId);
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: `Failed to re-fetch dispute from PayPal: ${err.message}` },
        { status: 502 }
      );
    }

    // Step 2: Verify provide_evidence action is still available
    const actions = deriveAllowedActions(freshDispute);
    const canProvideEvidence = actions.some((a) => a.id === 'PROVIDE_EVIDENCE');
    if (!canProvideEvidence) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot provide evidence: the dispute no longer allows this action. ` +
            `Status: ${freshDispute.status}, Stage: ${freshDispute.dispute_life_cycle_stage}`,
        },
        { status: 409 }
      );
    }

    // Step 3: Get the organization_id and reviewer user_id
    const { data: disputeRow } = await supabaseAdmin
      .from('disputes')
      .select('organization_id')
      .eq('id', disputeId)
      .single();

    if (!disputeRow) {
      return NextResponse.json({ success: false, error: 'Dispute not found in DB' }, { status: 404 });
    }

    const { data: ownerRow } = await supabaseAdmin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', disputeRow.organization_id)
      .eq('role', 'OWNER')
      .single();

    const approverUserId = ownerRow?.user_id ?? null;

    // Step 4: Gather HUMAN_VERIFIED matches and build the evidence packet
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
        { success: false, error: 'No HUMAN_VERIFIED matches found. Review evidence first.' },
        { status: 400 }
      );
    }

    // Known PayPal carrier enum values
    const KNOWN_CARRIERS: Record<string, string> = {
      'FEDEX': 'FEDEX', 'FEDEX_GROUND': 'FEDEX', 'FEDEX_EXPRESS': 'FEDEX',
      'UPS': 'UPS', 'UPS_GROUND': 'UPS', 'UPS_EXPRESS': 'UPS',
      'USPS': 'USPS', 'DHL': 'DHL', 'DPD': 'DPD', 'TNT': 'TNT',
      'ROYAL_MAIL': 'ROYAL_MAIL', 'CANADA_POST': 'CANADA_POST',
      'AUSTRALIA_POST': 'AUSTRALIA_POST', 'ARAMEX': 'ARAMEX',
    };

    type TrackingEntry = {
      carrier_name: string;
      carrier_name_other?: string;
      tracking_number: string;
    };

    type EvidenceAccum = {
      evidence_type: string;
      tracking_info: TrackingEntry[];
      notes: string;
      document_ids: string[];
    };

    const byType = new Map<string, EvidenceAccum>();
    for (const m of matches) {
      const evidenceType: string = (m as any).evidence_requirements?.paypal_evidence_type ?? 'OTHER';
      if (!byType.has(evidenceType)) {
        byType.set(evidenceType, { evidence_type: evidenceType, tracking_info: [], notes, document_ids: [] });
      }
      const entry = byType.get(evidenceType)!;
      entry.document_ids.push((m as any).document_id);

      const aiOutput = (m as any).ai_runs?.output;
      const carrier = aiOutput?.extracted_fields?.carrier;
      const tracking = aiOutput?.extracted_fields?.tracking_number;
      if (carrier && tracking) {
        const carrierKey = carrier.toUpperCase().replace(/\s+/g, '_');
        const mappedCarrier = KNOWN_CARRIERS[carrierKey];
        const te: TrackingEntry = { carrier_name: mappedCarrier ?? 'OTHER', tracking_number: tracking };
        if (!mappedCarrier) te.carrier_name_other = carrier;
        entry.tracking_info.push(te);
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

    // Step 5: Create evidence_submissions record as PENDING
    const referenceKey = `submit-${paypalDisputeId}-${Date.now()}`;
    const { data: submission, error: insertError } = await supabaseAdmin
      .from('evidence_submissions')
      .insert({
        organization_id: disputeRow.organization_id,
        dispute_id: disputeId,
        approved_by: approverUserId,
        approved_at: new Date().toISOString(),
        submission_status: 'PENDING',
        evidence_payload: packet,
        reference_key: referenceKey,
      })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ success: false, error: `DB insert failed: ${insertError.message}` }, { status: 500 });
    }

    // Step 6: Actually submit to PayPal
    let paypalResult: { success: boolean; paypalResponse: any };
    try {
      paypalResult = await submitEvidence(packet);
    } catch (err: any) {
      // Mark as FAILED
      await supabaseAdmin
        .from('evidence_submissions')
        .update({ submission_status: 'FAILED', paypal_response: { error: err.message }, submitted_at: new Date().toISOString() })
        .eq('id', submission.id);

      // Write audit log
      await supabaseAdmin.from('audit_logs').insert({
        organization_id: disputeRow.organization_id,
        actor_type: 'USER',
        actor_user_id: approverUserId,
        action_type: 'EVIDENCE_SUBMISSION_FAILED',
        entity_type: 'evidence_submissions',
        entity_id: submission.id,
        new_value: { paypalDisputeId, error: err.message },
      });

      return NextResponse.json(
        { success: false, error: `PayPal submission failed: ${err.message}`, submissionId: submission.id },
        { status: 502 }
      );
    }

    // Step 7: Mark as SUBMITTED
    await supabaseAdmin
      .from('evidence_submissions')
      .update({
        submission_status: 'SUBMITTED',
        paypal_response: paypalResult.paypalResponse,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', submission.id);

    // Step 8: Write audit log
    await supabaseAdmin.from('audit_logs').insert({
      organization_id: disputeRow.organization_id,
      actor_type: 'USER',
      actor_user_id: approverUserId,
      action_type: 'EVIDENCE_SUBMITTED',
      entity_type: 'evidence_submissions',
      entity_id: submission.id,
      new_value: {
        paypalDisputeId,
        evidenceTypes: evidences.map((e) => e.evidence_type),
        documentCount: documentIds.length,
      },
    });

    // Step 9: Reconcile — re-sync dispute state from PayPal
    try {
      const updatedDispute = await fetchDisputeDetail(paypalDisputeId);
      await syncSingleDispute(disputeRow.organization_id, updatedDispute);
    } catch (err: any) {
      console.error('Post-submission reconcile failed (non-fatal):', err.message);
    }

    return NextResponse.json({
      success: true,
      data: {
        submissionId: submission.id,
        submissionStatus: 'SUBMITTED',
        paypalResponse: paypalResult.paypalResponse,
      },
    });
  } catch (err: any) {
    console.error('Evidence submission error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
