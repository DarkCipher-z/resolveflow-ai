import 'dotenv/config';
import { supabaseAdmin } from '../server/supabase/admin';

async function main() {
  const { data: matches } = await supabaseAdmin
    .from('evidence_matches')
    .select('id, review_status, document_id')
    .eq('dispute_id', '3f7695d6-e685-4ce4-afe9-2254d3e43c9e');
  console.log('Matches in DB:', matches);

  const { data: submissions } = await supabaseAdmin
    .from('evidence_submissions')
    .select('id, submission_status, submitted_at, paypal_response, evidence_payload')
    .eq('dispute_id', '3f7695d6-e685-4ce4-afe9-2254d3e43c9e');
  console.log('Submissions in DB:', JSON.stringify(submissions, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
