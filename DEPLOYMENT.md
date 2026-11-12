# Deployment Guide — ResolveFlow AI on Render

This guide outlines the steps to deploy **ResolveFlow AI** as a production web service on [Render](https://render.com).

---

## Quick Deploy (via Render Blueprint)

Because this repository includes a [`render.yaml`](./render.yaml) blueprint specification, deployment is automated:

1. **Sign in to Render:** Go to [dashboard.render.com](https://dashboard.render.com).
2. **New Blueprint:** Click **New +** in the top right and select **Blueprint**.
3. **Connect Repository:** Select your GitHub repository:
   `https://github.com/DarkCipher-z/resolveflow-ai`
4. **Approve Service Definition:** Render will parse `render.yaml` and configure:
   - **Service Name:** `resolveflow-ai`
   - **Runtime:** `Node` (v20.18.0)
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Plan:** `Free` (or `Starter`)
5. **Populate Environment Variables:** Under the environment variables section, input the following secrets from your `.env`:
   - `PAYPAL_CLIENT_ID` — Your PayPal Sandbox Client ID
   - `PAYPAL_CLIENT_SECRET` — Your PayPal Sandbox Secret Key
   - `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL (`https://<project-ref>.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Your Supabase anonymous public key
   - `SUPABASE_SERVICE_ROLE_KEY` — Your Supabase service role key (kept server-side only)
   - `GEMINI_API_KEY` — Your Google Gemini API Key
6. **Click "Apply":** Render will build and deploy the application.

---

## Manual Deploy (Alternative)

If you prefer to configure the Web Service manually:

1. In Render Dashboard, click **New +** → **Web Service**.
2. Connect `https://github.com/DarkCipher-z/resolveflow-ai`.
3. Configure the following fields:
   - **Name:** `resolveflow-ai`
   - **Region:** `Oregon (US West)` or `Frankfurt (EU Central)`
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
4. Under **Environment Variables**, add:

| Key | Value / Source |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `20.18.0` |
| `PAYPAL_BASE_URL` | `https://api-m.sandbox.paypal.com` |
| `PAYPAL_CLIENT_ID` | *(From your PayPal Developer Portal)* |
| `PAYPAL_CLIENT_SECRET` | *(From your PayPal Developer Portal)* |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(From your Supabase API settings)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(From your Supabase API settings)* |
| `GEMINI_API_KEY` | *(From Google AI Studio)* |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `DEFAULT_TIMEZONE` | `Asia/Kolkata` |

5. Click **Create Web Service**.

---

## Verifying the Deployment

Once the build completes on Render:

1. **Health Check:** Open your Render public URL (`https://resolveflow-ai.onrender.com`).
2. **Disputes Inbox:** Check that existing disputes from PayPal Sandbox load properly.
3. **Trigger Sync:** Click the **"Sync Sandbox"** button to confirm OAuth connectivity with PayPal.
4. **Live Verification:** Open dispute `PP-R-YYP-10198826` to confirm that the `WAITING_FOR_BUYER_RESPONSE` state and human-verified evidence submission banner render correctly.

---

## Supabase Storage Notice

Ensure that your Supabase storage bucket named **`evidence`** is set to **Private** with appropriate Row-Level Security (RLS) policies as initialized by `supabase/migrations/0001_init.sql`. Document preview links are short-lived signed URLs generated on demand.
