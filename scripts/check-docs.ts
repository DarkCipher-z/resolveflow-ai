import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await sb
    .from('documents')
    .select('id, original_filename, size_bytes, sha256_hash, storage_path, dispute_id')
    .order('uploaded_at');

  if (error) { console.error('ERROR:', error.message); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));

  // Also check evidence_matches
  const { data: matches } = await sb
    .from('evidence_matches')
    .select('id, document_id, review_status, match_confidence')
  console.log('\n--- MATCHES ---');
  console.log(JSON.stringify(matches, null, 2));
  process.exit(0);
}
main();
