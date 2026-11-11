import { supabaseAdmin } from '../supabase/admin';
import { getOrCreateDemoOrganization } from '../supabase/seed-demo';
import { fetchDisputesList, fetchDisputeDetail, PayPalDisputeDetail } from '../paypal/disputes';

export interface SyncResult {
  syncedDisputesCount: number;
  disputeIds: string[];
  errors: Array<{ disputeId?: string; error: string }>;
}

/**
 * Syncs disputes from PayPal Sandbox into the local Supabase DB.
 * Upserts disputes, transactions, and evidence requirements.
 * Records audit log for synchronization.
 */
export async function syncDisputesFromPayPal(orgId?: string): Promise<SyncResult> {
  const targetOrgId = orgId ?? (await getOrCreateDemoOrganization());
  const result: SyncResult = {
    syncedDisputesCount: 0,
    disputeIds: [],
    errors: [],
  };

  try {
    const listRes = await fetchDisputesList({ pageSize: 50 });
    const items = listRes.items ?? [];

    for (const item of items) {
      try {
        const detail = await fetchDisputeDetail(item.dispute_id);
        await syncSingleDispute(targetOrgId, detail);
        result.syncedDisputesCount++;
        result.disputeIds.push(item.dispute_id);
      } catch (err: any) {
        result.errors.push({
          disputeId: item.dispute_id,
          error: err.message || String(err),
        });
      }
    }

    // Write audit log
    await supabaseAdmin.from('audit_logs').insert({
      organization_id: targetOrgId,
      actor_type: 'SYSTEM',
      action_type: 'PAYPAL_SYNC',
      entity_type: 'disputes',
      entity_id: targetOrgId,
      new_value: {
        syncedCount: result.syncedDisputesCount,
        disputeIds: result.disputeIds,
        errorCount: result.errors.length,
      },
    });

  } catch (err: any) {
    result.errors.push({
      error: `Failed to fetch disputes list: ${err.message || String(err)}`,
    });
  }

  return result;
}

/**
 * Upserts a single dispute detail into the database.
 */
export async function syncSingleDispute(orgId: string, detail: PayPalDisputeDetail) {
  const now = new Date().toISOString();

  // 1. Upsert dispute
  const disputeData = {
    organization_id: orgId,
    paypal_dispute_id: detail.dispute_id,
    reason: detail.reason ?? 'UNKNOWN',
    status: detail.status ?? 'UNKNOWN',
    lifecycle_stage: detail.dispute_life_cycle_stage ?? 'UNKNOWN',
    amount: detail.dispute_amount?.value ? parseFloat(detail.dispute_amount.value) : null,
    currency_code: detail.dispute_amount?.currency_code ?? 'USD',
    seller_response_due_at: detail.seller_response_due_date ? new Date(detail.seller_response_due_date).toISOString() : null,
    allowed_response_options: detail.allowed_response_options ?? {},
    paypal_links: detail.links ?? [],
    paypal_snapshot: detail,
    source_type: 'PAYPAL' as const,
    last_synced_at: now,
  };

  const { data: disputeRow, error: disputeError } = await supabaseAdmin
    .from('disputes')
    .upsert(disputeData, {
      onConflict: 'organization_id,paypal_dispute_id',
    })
    .select('id')
    .single();

  if (disputeError || !disputeRow) {
    throw new Error(`Failed to upsert dispute ${detail.dispute_id}: ${disputeError?.message}`);
  }

  const disputeInternalId = disputeRow.id;

  // 2. Upsert disputed transactions if present
  if (detail.disputed_transactions && detail.disputed_transactions.length > 0) {
    for (const tx of detail.disputed_transactions) {
      const txRef = tx.seller_transaction_id || tx.buyer_transaction_id || tx.reference_id || 'UNKNOWN';
      await supabaseAdmin.from('transactions').insert({
        organization_id: orgId,
        dispute_id: disputeInternalId,
        paypal_transaction_reference: txRef,
        amount: tx.gross_amount?.value ? parseFloat(tx.gross_amount.value) : null,
        currency_code: tx.gross_amount?.currency_code ?? 'USD',
        transaction_at: tx.create_time ? new Date(tx.create_time).toISOString() : null,
        source_type: 'PAYPAL',
        source_payload: tx,
      });
    }
  }

  // 3. Extract and upsert evidence requirements
  // Identify requested evidence types from:
  // a) evidences items with source='REQUESTED_FROM_SELLER'
  // b) default reason mapping if none explicitly marked
  const requestedTypes = new Set<string>();

  if (detail.evidences && Array.isArray(detail.evidences)) {
    for (const ev of detail.evidences) {
      if (ev.source === 'REQUESTED_FROM_SELLER') {
        requestedTypes.add(ev.evidence_type);
      }
    }
  }

  // If no explicit REQUESTED_FROM_SELLER found, map from dispute reason
  if (requestedTypes.size === 0) {
    if (detail.reason === 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED') {
      requestedTypes.add('PROOF_OF_FULFILLMENT');
    }
  }

  for (const evidenceType of requestedTypes) {
    // Only insert if not already present
    await supabaseAdmin
      .from('evidence_requirements')
      .upsert({
        organization_id: orgId,
        dispute_id: disputeInternalId,
        paypal_evidence_type: evidenceType,
        evidence_source: 'PAYPAL_API',
        is_required: true,
        requirement_status: 'MISSING',
      }, {
        onConflict: 'dispute_id,paypal_evidence_type',
        ignoreDuplicates: true, // Preserve status if already reviewed
      });
  }
}
