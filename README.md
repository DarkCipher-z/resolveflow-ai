# ResolveFlow AI

> AI-assisted PayPal dispute resolution workspace for small merchants.  
> Built for the PayPal Disputes Hackathon — November 2026.

## What It Does

ResolveFlow AI pulls **real disputes from PayPal Sandbox**, shows the evidence PayPal is requesting, lets the merchant upload documents, uses **Google Gemini** to classify, extract, and match documents to evidence requirements with source references, requires **human review** of every AI suggestion, then submits a human-approved evidence packet to PayPal Sandbox and reconciles the dispute state.

### Key Principles

- **AI assists; it never adjudicates.** A tracking number does not prove delivery.
- **Three data origins are always distinct:** `PAYPAL` (authoritative), `MERCHANT` (uploaded), `AI` (unverified suggestion).
- **Human-in-the-loop.** No evidence is submitted without explicit human confirmation and a fresh re-fetch of the dispute.
- **No live money.** PayPal Sandbox only.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js (App Router) — TypeScript — Tailwind/shadcn    │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Inbox    │  │  Workspace   │  │  Evidence Packet │  │
│  │  (list)   │  │  (detail +   │  │  (preview +      │  │
│  │           │  │   upload +   │  │   submit)        │  │
│  │           │  │   AI match)  │  │                  │  │
│  └──────────┘  └──────────────┘  └──────────────────┘  │
└──────┬──────────────┬────────────────────┬──────────────┘
       │              │                    │
  ┌────▼────┐   ┌─────▼─────┐      ┌──────▼──────┐
  │ PayPal  │   │ Supabase  │      │ Gemini API  │
  │ Sandbox │   │ (Postgres │      │ (multimodal │
  │ API     │   │ + Storage)│      │  analysis)  │
  └─────────┘   └───────────┘      └─────────────┘
```

**Stack:** Next.js 15 (App Router) · TypeScript · Supabase (Postgres + Auth + Storage) · Zod · Tailwind CSS · shadcn/ui · Google Gemini (`@google/genai`) · Recharts · Cytoscape.js

## Features

### 1. PayPal Sandbox Integration
- OAuth2 client credentials flow
- Dispute list sync with full detail fetch
- Derives allowed actions from **both** `allowed_response_options` and HATEOAS `links` (never hardcoded)
- Evidence submission via `multipart/form-data` with JSON `input` part and binary file parts

### 2. Case Workspace
- Dispute overview with transaction IDs, amounts, reason, status, lifecycle stage
- Deadline badges (Overdue / Urgent / High / Normal) with IST timezone
- Allowed actions display (read-only for non-evidence actions)
- Raw PayPal snapshot viewer

### 3. Secure Document Upload
- Drag-and-drop upload with client-side validation (PDF, JPG, PNG, GIF; <10 MB per file)
- Server-side magic bytes verification (not just extension)
- SHA-256 deduplication per dispute
- Private Supabase Storage bucket with signed URL preview/download
- Provenance badge: `MERCHANT_UPLOAD`

### 4. Gemini AI Analysis Pipeline
- Sends raw PDF/image bytes to Gemini via `@google/genai` (native multimodal input)
- Structured JSON output with `responseMimeType: 'application/json'` + response schema
- Temperature 0 for deterministic classification
- Zod re-validation of every Gemini response
- Extracts: document type, carrier, tracking number, shipment status, order ID, dates
- Source citations: page numbers and text excerpts
- Fallback chain: primary model → `gemini-3.5-flash-lite` on timeout/unavailability

### 5. Human Review (Mandatory)
- 3-pane verification UI: document preview, AI analysis, evidence requirement
- Confirm or reject each AI match individually
- `reviewed_by` tracks which user confirmed each match
- Only `HUMAN_VERIFIED` documents are eligible for submission

### 6. Evidence Packet & Submission
- Preview shows the exact `multipart/form-data` request: endpoint, JSON payload, files with real sizes and SHA-256 hashes
- Notes pre-filled from verified facts only — never claims delivery
- Smart carrier mapping (FedEx Ground → `FEDEX`, unknown → `OTHER` + `carrier_name_other`)
- Confirmation modal with safety reminders
- Fresh re-fetch of dispute state before every submission
- Records in `evidence_submissions` table with full audit trail
- Post-submission reconciliation (re-sync dispute state)

## Database Schema (14 tables)

| Table | Purpose |
|-------|---------|
| `organizations` | Merchant organizations |
| `organization_members` | User membership and roles |
| `disputes` | Synced disputes with raw PayPal snapshot |
| `disputed_transactions` | Transaction details per dispute |
| `evidence_requirements` | PayPal-requested evidence types per dispute |
| `documents` | Uploaded files with SHA-256, mime type, storage path |
| `ai_runs` | Gemini analysis results (model, tokens, output) |
| `evidence_matches` | AI-suggested + human-reviewed doc↔requirement matches |
| `evidence_submissions` | Submission records with PayPal response |
| `audit_logs` | Full audit trail (actor, action, entity, values) |
| `case_assignments` | Case assignment tracking |
| `notifications` | In-app notification queue |
| `webhook_events` | PayPal webhook event deduplication |

All tables use Row Level Security (RLS) scoped to the merchant's `organization_id`.

## Safety Guardrails

1. **No live money.** All API calls target `api-m.sandbox.paypal.com`.
2. **AI never adjudicates.** Cannot call anyone fraudulent, guarantee outcomes, or decide liability.
3. **No delivery claims.** Notes are validated against delivery-claim language patterns.
4. **No autonomous actions.** `escalate`, `accept_claim`, `make_offer`, `send_message` are never called programmatically.
5. **Human confirmation required.** Every evidence submission requires a UI confirmation step.
6. **Fresh re-fetch.** Dispute state is re-fetched from PayPal before every submission.
7. **Reconciliation.** Dispute state is re-synced after every submission.
8. **Secrets server-side only.** PayPal secret, Gemini key, Supabase service role never in client bundles.
9. **Uploaded documents are untrusted data,** never treated as instructions.

## Getting Started

### Prerequisites
- Node.js 20+
- Supabase project (with a private storage bucket named `evidence`)
- PayPal Developer account with Sandbox app (Customer Disputes feature enabled)
- Google Gemini API key

### Setup

```powershell
# Clone
git clone https://github.com/DarkCipher-z/resolveflow-ai.git
cd resolveflow-ai

# Install dependencies
npm install

# Create .env (never commit this file)
cp .env.example .env
# Fill in: PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_BASE_URL,
#          NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#          SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, GEMINI_MODEL

# Apply database migration
# Run supabase/migrations/0001_init.sql in your Supabase SQL Editor

# Start dev server
npx next dev
```

### Deployment on Render

ResolveFlow AI includes a [`render.yaml`](./render.yaml) Blueprint configuration for 1-click deployment on [Render](https://render.com):

1. Go to [Render Dashboard](https://dashboard.render.com) &rarr; **New +** &rarr; **Blueprint**.
2. Connect repository `https://github.com/DarkCipher-z/resolveflow-ai`.
3. Provide your environment keys (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`).
4. Click **Apply**. Render will automatically build (`npm install && npm run build`) and start the production web service.

Detailed instructions are available in [DEPLOYMENT.md](./DEPLOYMENT.md).

### Usage Flow

1. **Sync disputes** — click "Sync from PayPal" in the sidebar to pull disputes from Sandbox
2. **Open a dispute** — click on a dispute in the inbox
3. **Upload documents** — drag-and-drop PDFs/images in the Evidence Checklist tab
4. **Run AI analysis** — click "Analyze" on each uploaded document
5. **Review matches** — confirm or reject each AI-suggested evidence match
6. **Preview submission** — go to Evidence Packet tab, review the exact request
7. **Submit** — click "Submit to PayPal Sandbox" and confirm in the modal

## Project Structure

```
resolveflow-ai/
├── app/                        # Next.js App Router
│   ├── api/disputes/           # API routes (sync, detail, upload, analyze, review, submit)
│   ├── disputes/               # UI pages (inbox, workspace)
│   └── layout.tsx              # Root layout with sidebar + topbar
├── components/                 # React components
│   ├── evidence-intelligence.tsx   # 3-pane AI verification UI
│   ├── evidence-packet.tsx     # Submission preview + confirmation
│   ├── document-upload.tsx     # Drag-and-drop upload
│   └── ...
├── server/                     # Server-side modules
│   ├── paypal/                 # PayPal OAuth, disputes, evidence
│   ├── ai/                     # Gemini extractor, pipeline, schemas
│   ├── supabase/               # Admin client, demo seed
│   └── sync/                   # Dispute sync engine
├── lib/                        # Shared utilities
│   ├── document-validation.ts  # Magic bytes + SHA-256
│   └── utils.ts
├── supabase/migrations/        # SQL migrations
├── scripts/                    # Utility scripts (smoke test, sync, verify)
└── BUILD_STATUS.md             # Current build status and next steps
```

## Screenshots

> Screenshots can be added here during the demo.

## License

MIT

---

*Built with ❤️ for the PayPal Disputes Hackathon — November 2026*

## Known limitations
- Single-merchant demo mode: one seeded organization and owner; real authentication and multi-tenant onboarding are future work.
- Dispute updates use the manual "Sync Sandbox" button; PayPal webhooks are not implemented.
- The evidence graph, analytics and AI investigator screens are not built.
- AI output is an unverified suggestion; only human-confirmed matches can be submitted.
- Tested only against PayPal Sandbox: evidence for an item-not-received inquiry was accepted and the case moved to WAITING_FOR_BUYER_RESPONSE.
- Development note: the first sandbox submission (dispute PP-R-YYP-10198826) was run by the coding agent during development; the demo submission was confirmed by a person in the UI.
