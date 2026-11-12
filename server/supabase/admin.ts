import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';

  if (!_client) {
    _client = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}

/**
 * Server-only Supabase client with service role key.
 * Used for server-side trusted DB operations (PayPal sync, migrations, audit logs).
 * Uses lazy proxy initialization to prevent build-time crashes when env vars are missing.
 * Never expose to browser bundle.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

