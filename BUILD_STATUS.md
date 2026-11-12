# BUILD_STATUS.md — ResolveFlow AI

## Current Phase: Stage A & Stage B Complete (Phase 2b — Gemini Intelligence & Human Review)
**Status:** ✅ STAGE A & STAGE B COMPLETE (Gemini analysis, structured extraction, source citations, adversarial injection defense, and human verification verified)  
**Last Updated:** 2026-11-12T11:10 IST

---

## Completed in This Turn

### 1. Stage A: UI Corrections
- **Sidebar Layout:** Resolved badge crowding by positioning the "Single-merchant mode" pill in its own row beneath the "MERCHANT ORGANIZATION" header.
- **Disputed Transactions Card:** Shows `seller_transaction_id` and `buyer_transaction_id` as distinct labelled fields read directly from the PayPal dispute snapshot/database.
- **Deadline Priority Badges:** Integrated `DeadlineBadge` (`OVERDUE`, `URGENT (≤6h)`, `HIGH (≤24h)`, `NORMAL`, `UNKNOWN`) alongside merchant timezone (IST) across the Case Workspace, Inbox, and Overview pages.
- **Allowed Actions Card:** `PROVIDE_EVIDENCE` is the ONLY interactive action ("Submit Evidence" tab switcher); `accept_claim`, `make_offer`, `send_message`, and `escalate` render as read-only text: *"Available in PayPal (not used in this MVP)"*.

### 2. Stage B: Phase 2b — Gemini Document Intelligence & Human Verification
- **Gemini Multimodal Extraction Engine (`server/ai/extractor.ts`):**
  - Sends raw document binary (PDF / image) directly to Gemini via `@google/genai` without OCR preprocessing.
  - System prompt copied verbatim from spec Part E1 (`PROMPT_VERSION = "v1"`).
  - Enforces structured JSON output validated against `DocumentAnalysisJsonSchema`.
  - Re-validates every response strictly using Zod (`DocumentAnalysis` schema in `server/ai/schemas.ts`).
  - Added timeout-protected execution with fallback to fast available model (`gemini-3.5-flash-lite`) to safeguard against temporary demand spikes in Google AI Studio.
- **Intelligence Pipeline (`server/ai/pipeline.ts`):**
  - Downloads binary from private Supabase Storage `evidence` bucket.
  - Gathers requested evidence types from seller requirements (`PROOF_OF_FULFILLMENT`).
  - Executes Gemini analysis and logs execution in `ai_runs` table (`validation_status: 'SUCCESS' | 'FAILED'`).
  - Links candidate match in `evidence_matches` (`provenance: 'AI_SUGGESTED'`, `review_status: 'PENDING'`).
  - Updates requirement status to `CANDIDATE_FOUND`.
- **Coverage Invariance Rule:**
  - Candidate matches (`AI_SUGGESTED`) strictly DO NOT increment the coverage numerator.
  - Only requirements with status `HUMAN_VERIFIED` or `SUBMITTED` increment coverage.
- **Three-Pane Verification UI (`components/evidence-intelligence.tsx`):**
  - **Pane 1 (Requirements):** Lists requested PayPal requirements with status badges (`PENDING`, `CANDIDATE_FOUND`, `HUMAN_VERIFIED`).
  - **Pane 2 (Documents & Upload):** Drag-and-drop uploader with status badges, provenance pills, and instant "Analyze with Gemini" trigger button.
  - **Pane 3 (AI Extraction & Human Review):** Displays document classification, confidence score, extracted fields (carrier, tracking, delivery status), missing fields checklist, citations with source page and excerpt, and explicit **Confirm** & **Reject** buttons.
- **Review API (`POST /api/disputes/[id]/matches/[matchId]/review`):**
  - Writes `review_status: 'HUMAN_VERIFIED'` or `'REJECTED'`.
  - Promotes requirement to `requirement_status: 'HUMAN_VERIFIED'`.
  - Records full audit trail to `audit_logs` (`action_type: 'EVIDENCE_MATCH_CONFIRMED'`).
- **Automated Pipeline Verification (`scripts/test-gemini-analysis.ts`):**
  - **Shipping Confirmation (`2_shipping_confirmation.pdf`):** Gemini correctly reported dispatch via FedEx Ground (tracking `TRK-10025`, status `In transit`), flagged missing delivery confirmation, cited page 1 excerpts, and created candidate match without prematurely increasing coverage (`0/1`, `0%`).
  - **Adversarial Prompt Injection (`4_prompt_injection.pdf`):** Document text containing system prompt override instructions was safely ignored; document was treated as untrusted data, delivery was not falsely reported, and human review was flagged as required (`true`).
  - **Human Verification Simulation:** Confirmed match, elevated requirement status to `HUMAN_VERIFIED`, recorded audit log, and updated coverage to `1/1` (`100%`).

---

## Verification Results
- `npx tsc --noEmit`: **PASS** (0 errors)
- `scripts/test-gemini-analysis.ts`: **PASS** (all 3 test scenarios verified against live DB & Gemini API)
- Git hygiene: `.env` verified ignored and untracked.

---

## Next Steps (Stage C — Phase 3: Real Evidence Submission)
*Awaiting user testing and approval of Stage B before proceeding to Stage C.*
- Inspect CURRENT official PayPal "Provide evidence" endpoint contract (`multipart/form-data`).
- Build submission packet builder, human confirmation modal, idempotent submission client, and reconciliation engine.
- Execute real evidence submission on dispute `PP-R-YYP-10198826`.
- Dispute `PP-R-XBK-10198832` remains RESERVED for final demo.
