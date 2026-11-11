# BUILD_STATUS.md — ResolveFlow AI

## Current Phase: 1 — Core App + DB + Sync
**Status:** 🟡 IN PROGRESS (Scaffold complete, awaiting SQL migration execution)  
**Last Updated:** 2026-11-11T15:25 IST

---

## Smoke Test & PayPal Validation Findings

### 1. Allowed Response Options vs Links
- **`allowed_response_options` (raw):**
  ```json
  {
    "accept_claim": {
      "accept_claim_types": ["PARTIAL_REFUND", "REFUND"]
    },
    "make_offer": {
      "offer_types": ["REFUND"]
    }
  }
  ```
- **HATEOAS `links`:**
  - `GET self`
  - `POST accept_claim`
  - `POST provide_evidence` (rel: `provide_evidence` with underscore)
  - `POST send_message`
  - `POST escalate`
  - `POST make_offer`
- **Key finding:** `provide_evidence` is present in `links` but NOT in `allowed_response_options`. The application now derives allowed actions from BOTH sources dynamically (rule 5).

### 2. Evidence Array Analysis
- `[0] evidence_type: CREATE`: `source: SUBMITTED_BY_BUYER` (buyer's initial filing metadata)
- `[1] evidence_type: PROOF_OF_FULFILLMENT`: `source: REQUESTED_FROM_SELLER` (the actual requested evidence from the merchant)
- **Docs-confirmed INR types:** `PROOF_OF_FULFILLMENT`, `PROOF_OF_DELIVERY_SIGNATURE`, `PROOF_OF_REFUND`, `PROOF_OF_RESHIPMENT`, `OTHER`
- The sync service extracts seller requirements specifically matching `source: REQUESTED_FROM_SELLER` and maps INR defaults, discarding internal buyer tags like `CREATE`.

---

## Phase 1 Progress

| Component | Status | Verification |
|---|---|---|
| Next.js App Router + TypeScript + Tailwind | ✅ Complete | `npx next build` passes (all 7 routes compiled) |
| Design Tokens (spec Part H) | ✅ Complete | bg `#F7F9FC`, sidebar `#111C35`, primary `#2563EB` |
| Supabase Migration `0001_init.sql` | ✅ Created | `supabase/migrations/0001_init.sql` |
| Supabase verification script | ✅ Created | `scripts/verify-supabase.ts` |
| Supabase client (Admin service role) | ✅ Created | `server/supabase/admin.ts` |
| Single-merchant demo mode helper | ✅ Created | `server/supabase/seed-demo.ts` (`Northstar Goods`) |
| PayPal API client & token cache | ✅ Created | `server/paypal/{auth,client,disputes,errors}.ts` |
| Action derivation logic | ✅ Created | `deriveAllowedActions` in `server/paypal/disputes.ts` |
| PayPal dispute sync engine | ✅ Created | `server/sync/disputes.ts` & `POST /api/disputes/sync` |
| Dispute Inbox Page | ✅ Created | `app/disputes/page.tsx` |
| Dispute Workspace Page | ✅ Created | `app/disputes/[id]/page.tsx` |
| Operations Overview Dashboard | ✅ Created | `app/page.tsx` (4 KPIs + queue) |
| Git cleanliness | ✅ Verified | No `.env` tracked; git working tree clean |

---

## Immediate Next Step
1. **User Action:** Copy `supabase/migrations/0001_init.sql` and run it in the Supabase Dashboard SQL Editor.
2. Run `scripts/verify-supabase.ts` to confirm 14 tables created.
3. Run `POST /api/disputes/sync` to pull `PP-R-YYP-10198826` and `PP-R-XBK-10198832`.
4. Launch local server and open Browser agent to capture verification screenshots.
