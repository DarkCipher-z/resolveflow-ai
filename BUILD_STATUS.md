# BUILD_STATUS.md — ResolveFlow AI

## Current Phase: 2a — Secure Document Upload
**Status:** ✅ PHASE 2a COMPLETE (Upload, magic-byte check, SHA-256 dedupe, storage, signed URLs verified)  
**Last Updated:** 2026-11-12T01:28 IST

---

## Completed in This Turn

### 1. UI Fixes
- Renamed bottom-left "PayPal Sandbox Live" &rarr; **"PayPal Sandbox"**
- Changed top badge &rarr; **"App: ResolveFlow AI US"**
- Renamed DEMO badge &rarr; **"Single-merchant mode"**
- Disputed transactions card &rarr; Explicitly displays `seller_transaction_id` and `buyer_transaction_id` as distinct labelled fields read directly from the PayPal API snapshot
- Allowed actions card &rarr; Replaced "Action enabled" with **"Available in PayPal (not used in this MVP)"** for `accept_claim`, `make_offer`, `send_message`, `escalate` (no clickable buttons). Preserved `Submit Evidence (Phase 3)`
- Timezone support &rarr; Displays merchant timezone (**IST**) on all deadlines, transaction timestamps, and sync times

### 2. Phase 2a: Secure Document Upload
- **Validation Engine (`lib/document-validation.ts`):**
  - Binary header (magic bytes) validation: PDF (`%PDF-`), JPG (`FF D8 FF`), PNG (`89 50 4E 47`), GIF (`GIF87a`/`GIF89a`)
  - File size limits: strictly enforces < 10 MB per file, ≤ 50 MB batch limit
  - Cryptographic checksum: computes SHA-256 hash for every file
  - Duplicate detection: rejects files matching existing dispute documents with identical SHA-256 (HTTP 409 Conflict)
- **Upload Route (`POST /api/disputes/[id]/documents`):**
  - Stores binary in private Supabase bucket `evidence` under randomized path: `{dispute_id}/{uuid}.{ext}`
  - Inserts row in `documents` table (`source_type: 'MERCHANT_UPLOAD'`, `processing_status: 'PENDING'`)
  - Writes audit trail row to `audit_logs` (`action_type: 'DOCUMENT_UPLOAD'`)
  - Generates short-lived signed URL (1 hour)
- **Documents List Route (`GET /api/disputes/[id]/documents`):**
  - Returns uploaded documents with fresh short-lived signed URLs for preview/download
- **Frontend Component (`components/document-upload.tsx`):**
  - Drag-and-drop file upload zone with client-side type and size validation
  - Real-time uploading state and progress indicators
  - Uploaded documents table with filename, human-readable size, IST timestamp, status pill, and signed URL link
  - Provenance badge `MERCHANT DATA`
- **End-to-End Verification:**
  - `npx tsc --noEmit` passes with 0 errors
  - Uploaded real test PDF (`order_ORD1024_fulfillment.pdf`, 498 bytes) to dispute `PP-R-YYP-10198826`
  - Re-upload with same checksum verified rejected with HTTP 409
  - Storage object verified in private `evidence` bucket with signed URL
  - Audit log verified written
