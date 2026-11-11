import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase URL or Service Role Key');
  process.exit(1);
}

const REQUIRED_TABLES = [
  'organizations',
  'organization_members',
  'paypal_connections',
  'disputes',
  'transactions',
  'evidence_requirements',
  'documents',
  'ai_runs',
  'evidence_matches',
  'evidence_submissions',
  'webhook_events',
  'audit_logs',
  'case_assignments',
  'notifications',
];

async function verify() {
  console.log('Connecting to Supabase REST schema...');
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!res.ok) {
    console.error(`Failed to fetch schema: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const schema = await res.json();
  const tables = Object.keys(schema.definitions || {});
  console.log(`Found ${tables.length} tables in public schema.`);

  let allOk = true;
  for (const req of REQUIRED_TABLES) {
    if (tables.includes(req)) {
      console.log(`  ✅ ${req}`);
    } else {
      console.log(`  ❌ ${req} (MISSING)`);
      allOk = false;
    }
  }

  if (allOk) {
    console.log('\nAll required tables are present in Supabase!');
  } else {
    console.log('\nSome tables are missing. Please apply supabase/migrations/0001_init.sql in the Supabase SQL Editor.');
  }

  return allOk;
}

verify().then((ok) => {
  if (!ok) process.exit(1);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
