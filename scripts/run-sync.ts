import 'dotenv/config';
import { syncDisputesFromPayPal } from '../server/sync/disputes';
import { supabaseAdmin } from '../server/supabase/admin';

async function main() {
  console.log('Running initial PayPal dispute sync...');
  const result = await syncDisputesFromPayPal();
  console.log('Sync result:');
  console.log('  Synced count:', result.syncedDisputesCount);
  console.log('  Dispute IDs:', result.disputeIds);
  if (result.errors.length > 0) {
    console.error('  Errors:', result.errors);
  }

  // Count rows in database tables
  console.log('\nDatabase row counts post-sync:');
  const tables = [
    'organizations',
    'organization_members',
    'disputes',
    'transactions',
    'evidence_requirements',
    'documents',
    'ai_runs',
    'evidence_matches',
    'evidence_submissions',
    'webhook_events',
    'audit_logs',
  ];

  for (const table of tables) {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`  ${table}: error (${error.message})`);
    } else {
      console.log(`  ${table}: ${count} rows`);
    }
  }

  // Also query disputes summary (no personal data)
  const { data: disputes } = await supabaseAdmin
    .from('disputes')
    .select('paypal_dispute_id, reason, status, lifecycle_stage, amount, currency_code, seller_response_due_at');

  console.log('\nSynced Disputes Summary:');
  for (const d of disputes || []) {
    console.log(`  - ${d.paypal_dispute_id}: ${d.reason} | ${d.status} | ${d.lifecycle_stage} | ${d.currency_code} ${d.amount} | Due: ${d.seller_response_due_at}`);
  }
}

main().catch((e) => {
  console.error('Sync script failed:', e);
  process.exit(1);
});
