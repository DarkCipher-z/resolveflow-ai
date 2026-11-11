import { PayPalAuthError } from './errors';

const base = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

interface CachedToken {
  accessToken: string;
  expiresAt: number; // unix timestamp in ms
  scopes: string[];
}

let tokenCache: CachedToken | null = null;

/**
 * Retrieves a valid PayPal OAuth access token, caching until near expiration.
 * Never logs the token or credentials.
 */
export async function getPayPalAccessToken(): Promise<string> {
  const now = Date.now();
  // Return cached token if valid for at least 60 more seconds
  if (tokenCache && tokenCache.expiresAt - now > 60_000) {
    return tokenCache.accessToken;
  }

  if (!clientId || !clientSecret) {
    throw new PayPalAuthError('PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET environment variable is missing');
  }

  const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new PayPalAuthError(`PayPal token request failed with status ${res.status}`, {
      status: res.status,
      errorText,
    });
  }

  const data = await res.json();
  const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  const scopes = typeof data.scope === 'string' ? data.scope.split(' ') : [];

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + expiresInSeconds * 1000,
    scopes,
  };

  return tokenCache.accessToken;
}

/**
 * Returns metadata about the currently cached token (safe to log / display).
 */
export function getTokenMetadata() {
  if (!tokenCache) return null;
  return {
    hasToken: true,
    expiresAt: new Date(tokenCache.expiresAt).toISOString(),
    remainingSeconds: Math.max(0, Math.floor((tokenCache.expiresAt - Date.now()) / 1000)),
    scopeCount: tokenCache.scopes.length,
  };
}
