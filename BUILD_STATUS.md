# BUILD_STATUS.md — ResolveFlow AI

## Current Phase: Stage C Steps 1–3 Complete (Evidence Packet & Request Preview)
**Status:** ✅ REVIEW ROUTE FIXED + STAGE C STEPS 1–3 IMPLEMENTED (Exact PayPal contract documented, evidence packet builder & preview live, zero mutating calls made)  
**Last Updated:** 2026-11-12T16:50 IST

---

## Non-Negotiable Test Script Rules (Added to GEMINI.md & BUILD_STATUS.md)
1. **No Simulated Reviews in Real DB:** Test scripts MUST NEVER write `review_status = 'HUMAN_VERIFIED'` or `'REJECTED'`, or insert `EVIDENCE_MATCH_CONFIRMED` / `EVIDENCE_MATCH_REJECTED` audit rows, into the real database. Those actions are browser-only, performed by a human via the UI.
2. **No Direct Document Inserts:** Test scripts MUST NEVER insert documents directly into the `documents` table or upload directly to the `evidence` storage bucket. Documents must go through `POST /api/disputes/[id]/documents`. When a script needs test fixtures it must label them with `DEMO_FIXTURE` and delete them on completion.
3. **Actor Type Discipline:** The actor_type `USER` and `actor_user_id` in `audit_logs` must only be set by real API routes triggered from the browser. Scripts use `actor_type: 'SYSTEM'` for any administrative cleanup.

---

## Review Route Fixes Applied
- `POST /api/disputes/[id]/matches/[matchId]/review`:
  - Queries the seeded demo owner's `user_id` from `organization_members` for the dispute's organization (`role = 'OWNER'`).
  - Sets `evidence_matches.reviewed_by = reviewerUserId` and `reviewed_at = now`.
  - Sets `audit_logs.actor_user_id = reviewerUserId` and `actor_type = 'USER'`.

---

## Stage C Step 1: Official PayPal "Provide Evidence" Request Contract
From official PayPal Disputes API (v1) documentation:

- **Endpoint:** `POST https://api-m.sandbox.paypal.com/v1/customer/disputes/{dispute_id}/provide-evidence`
- **Method:** `POST`
- **Headers:**
  - `Authorization: Bearer <ACCESS_TOKEN>`
  - `Content-Type: multipart/form-data; boundary=<BOUNDARY>` (generated automatically by HTTP client)
- **Multipart Form Parts:**
  1. **`input` (Application/JSON part):**
     ```json
     {
       "evidences": [
         {
           "evidence_type": "PROOF_OF_FULFILLMENT",
           "evidence_info": {
             "tracking_info": [
               {
                 "carrier_name": "FEDEX",
                 "tracking_number": "TRK-10025",
                 "tracking_url": "https://..."
               }
             ]
           },
           "notes": "Order ORD-1024 shipped via FedEx Ground with tracking TRK-10025. Shipment status: In transit."
         }
       ]
     }
     ```
     - `evidence_type`: `PROOF_OF_FULFILLMENT` | `PROOF_OF_REFUND` | `PROOF_OF_SHIPMENT` | `OTHER`
     - `tracking_info`: array of tracking objects (required/supported for `PROOF_OF_FULFILLMENT`):
       - `carrier_name`: Required enum (`FEDEX`, `UPS`, `USPS`, `DHL`, `OTHER`, etc., length 1–255)
       - `carrier_name_other`: String (1–2000 chars, mandatory if `carrier_name` is `OTHER`)
       - `tracking_number`: String (1–255 chars)
       - `tracking_url`: Optional valid URL
     - `notes`: String (1–2000 chars). **Rule: Must NOT claim delivery or guarantee outcomes.**
  2. **`file1`, `file2`, ... (Binary file parts):**
     - Parameter name: `file1`, `file2`, etc.
     - Content-Type: Mime type of the file (`application/pdf`, `image/jpeg`, `image/png`, `image/gif`)
     - Filename: Original filename
     - Content: Binary file bytes
- **Payload Constraints:**
  - File types: `.pdf`, `.jpg`, `.jpeg`, `.gif`, `.png`
  - Per-file limit: Less than 10 MB per file
  - Total payload limit: Up to 50 MB per API call

---

## Stage C Steps 2 & 3: Implementation

### 1. PayPal Evidence Module (`server/paypal/evidence.ts`)
- `buildEvidencePreview(packet)`: Validates packet against Zod schema, checks that every document has `review_status = 'HUMAN_VERIFIED'`, checks file sizes (<10 MB each, ≤50 MB total), validates notes against delivery claim language patterns, and constructs the exact request structure without calling PayPal.
- `submitEvidence(packet)`: Re-validates packet, downloads files from private Supabase bucket `evidence`, builds `multipart/form-data` with `input` JSON part and binary `fileN` parts, and issues POST request to PayPal Sandbox. *(NOT called until explicit human confirmation)*.
- **Safety Guardrails:** Rejects any document that is not `HUMAN_VERIFIED`; warns if notes contain words claiming delivery.

### 2. Evidence Submission API Routes
- `GET /api/disputes/[id]/evidence-packet`: Returns all `HUMAN_VERIFIED` matches with document metadata, source citations, carrier/tracking facts from `ai_runs.output`.
- `POST /api/disputes/[id]/evidence-packet/preview`: Builds and returns the exact preview object without executing the PayPal API call.

### 3. Evidence Packet UI Component (`components/evidence-packet.tsx`)
- Displays only `HUMAN_VERIFIED` documents (AI suggestions alone are ineligible).
- Notes pre-filled **only from verified facts** (carrier, tracking, transit status) with explicit guardrails against claiming delivery.
- Character counter (max 2,000 chars).
- **"Preview Request (no submission)"** button displays:
  - Exact HTTP method & endpoint URL (`POST https://api-m.sandbox.paypal.com/v1/customer/disputes/{id}/provide-evidence`)
  - Formatted `input` JSON payload
  - Attached files list with field names (`file1`), mime types, sizes, and verified status
  - Validation warnings (if any)
- Clearly labeled as "Request Preview — NOT SENT".

### 4. Workspace Integration (`app/disputes/[id]/page.tsx`)
- Added **"Evidence Packet"** tab with `Preview` badge.
- Zero mutating calls (`escalate`, `accept_claim`, `make_offer`, `send_message`) are ever made.

---

## Verification Results
- `npx tsc --noEmit`: **PASS** (0 errors)
- Git hygiene: `.env` verified ignored and untracked.
- DB integrity: Uses the 14 verified tables from migration 0001; no unapplied migrations.
- PayPal safety: No mutating calls made.

---

## Next Steps (Stage C Step 4 — Awaiting Confirmation)
- Human confirms the preview in the UI for dispute `PP-R-YYP-10198826`.
- Execute the real PayPal Sandbox submission and reconcile dispute state.
- Dispute `PP-R-XBK-10198832` remains strictly RESERVED for final demo.
