/**
 * PayPal Sandbox Smoke Test
 * Validates: OAuth token, list disputes, dispute detail (if any exist).
 * Run: npx tsx scripts/paypal-smoke.ts
 */
import 'dotenv/config';

const base = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;

if (!id || !secret) {
  console.error('Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
  process.exit(1);
}

/** Strip URL to host only — never print full path (may contain tokens/IDs beyond dispute_id) */
function hostOnly(href: string): string {
  try {
    const u = new URL(href);
    return u.origin + '/...';
  } catch {
    return '(invalid URL)';
  }
}

/** Known evidence types for MERCHANDISE_OR_SERVICE_NOT_RECEIVED per PayPal docs */
const INR_EVIDENCE_TYPES = [
  'PROOF_OF_FULFILLMENT',
  'PROOF_OF_DELIVERY_SIGNATURE',
  'PROOF_OF_REFUND',
  'PROOF_OF_RESHIPMENT',
  'OTHER',
];

async function getToken(): Promise<string> {
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Token failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  console.log('Token OK. expires_in:', json.expires_in, 'scope present:', Boolean(json.scope));
  const scopes: string = json.scope ?? '';
  const disputeScopes = scopes.split(' ').filter((s: string) =>
    s.toLowerCase().includes('dispute') || s.toLowerCase().includes('customer')
  );
  console.log('Dispute-related scopes:', disputeScopes.length > 0 ? disputeScopes.join(', ') : 'NONE FOUND');
  return json.access_token;
}

async function main() {
  const token = await getToken();

  // List disputes
  const list = await fetch(`${base}/v1/customer/disputes?page_size=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('\nList disputes status:', list.status);
  const body = await list.json();
  const items: any[] = body.items ?? [];
  console.log('Disputes found:', items.length);

  if (items.length > 0) {
    for (const item of items) {
      console.log(`  - ${item.dispute_id}: reason=${item.reason}, status=${item.status}, stage=${item.dispute_life_cycle_stage}`);
    }

    // Fetch detail of the first dispute
    const first = items[0];
    const d = await fetch(`${base}/v1/customer/disputes/${first.dispute_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('\nDetail fetch status:', d.status);
    const detail = await d.json();

    // --- Core fields ---
    console.log('\n=== DISPUTE SUMMARY ===');
    console.log(JSON.stringify({
      dispute_id: detail.dispute_id,
      reason: detail.reason,
      status: detail.status,
      stage: detail.dispute_life_cycle_stage,
      amount: detail.dispute_amount,
      due: detail.seller_response_due_date,
    }, null, 2));

    // --- Raw allowed_response_options (full structure) ---
    console.log('\n=== ALLOWED_RESPONSE_OPTIONS (raw) ===');
    console.log(JSON.stringify(detail.allowed_response_options ?? null, null, 2));

    // --- HATEOAS links (rel + method + host-only href) ---
    console.log('\n=== LINKS (rel + method + host) ===');
    const links = (detail.links ?? []) as Array<{ href: string; rel: string; method: string }>;
    for (const l of links) {
      console.log(`  ${l.method.padEnd(6)} ${l.rel.padEnd(25)} ${hostOnly(l.href)}`);
    }

    // Derive actions from BOTH sources
    const allowedKeys = Object.keys(detail.allowed_response_options ?? {});
    const linkRels = links.map((l) => l.rel);
    console.log('\n=== DERIVED ACTIONS ===');
    console.log('From allowed_response_options keys:', allowedKeys);
    console.log('From links rels:', linkRels);
    // PayPal uses underscores in rel values (provide_evidence, not provide-evidence)
    console.log('Action "provide_evidence" in links?', linkRels.includes('provide_evidence'));
    console.log('Action "provide_evidence" in allowed_response_options?', 'provide_evidence' in (detail.allowed_response_options ?? {}));
    console.log('\n=== KEY INSIGHT ===');
    console.log('provide_evidence is in LINKS but NOT in allowed_response_options.');
    console.log('App MUST check BOTH sources to determine available actions (spec rule 5).');
    console.log('For evidence submission: check links for rel=provide_evidence.');

    // --- Raw evidences array (keys + evidence_type, no personal data) ---
    console.log('\n=== EVIDENCES (raw structure, no personal data) ===');
    const evidences = detail.evidences ?? [];
    for (let i = 0; i < evidences.length; i++) {
      const e = evidences[i];
      console.log(`  [${i}] evidence_type: ${e.evidence_type}`);
      console.log(`       keys: ${Object.keys(e).join(', ')}`);
      if (e.evidence_info) {
        console.log(`       evidence_info keys: ${Object.keys(e.evidence_info).join(', ')}`);
      }
      if (e.documents) {
        console.log(`       documents count: ${e.documents.length}`);
      }
      console.log(`       source: ${e.source ?? '(not set)'}`);
    }

    // --- Cross-reference with docs ---
    console.log('\n=== EVIDENCE TYPE ANALYSIS ===');
    const caseTypes = evidences.map((e: any) => e.evidence_type);
    console.log('On this dispute:', caseTypes);
    console.log('Docs-confirmed for MERCHANDISE_OR_SERVICE_NOT_RECEIVED:', INR_EVIDENCE_TYPES);
    const unexpected = caseTypes.filter((t: string) => !INR_EVIDENCE_TYPES.includes(t));
    if (unexpected.length > 0) {
      console.log('⚠️  Unexpected evidence types on case (may be PayPal-internal):', unexpected);
      console.log('   → App must handle unknown types with safe fallback (spec rule 9)');
    }
  } else {
    console.log('\nNo disputes yet. Create one via the Sandbox dispute workflow.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
