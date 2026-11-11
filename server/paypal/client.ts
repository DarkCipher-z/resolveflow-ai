import { getPayPalAccessToken } from './auth';
import {
  PayPalAPIError,
  PayPalAuthError,
  PayPalForbiddenError,
  PayPalRateLimitError,
  PayPalServerError,
} from './errors';

const base = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormData;
}

/**
 * Standard fetch client for PayPal REST APIs with automatic token injection,
 * typed error conversion, and exponential backoff retry on 429 and 5xx.
 */
export async function paypalFetch<T = any>(
  path: string,
  options: RequestOptions = {},
  retries = 2
): Promise<T> {
  const token = await getPayPalAccessToken();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : '/' + path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  // If body is string and Content-Type not specified, default to application/json
  if (typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let attempt = 0;
  while (true) {
    try {
      attempt++;
      const res = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body,
      });

      if (res.ok) {
        // Some responses might be 204 No Content
        if (res.status === 204) return null as T;
        return (await res.json()) as T;
      }

      // Handle specific status codes
      if (res.status === 401) {
        throw new PayPalAuthError(`PayPal API returned 401 Unauthorized for ${path}`);
      }

      if (res.status === 403) {
        const errorData = await res.json().catch(() => ({}));
        throw new PayPalForbiddenError(`PayPal API returned 403 Forbidden for ${path}`, errorData);
      }

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '3', 10);
        if (attempt <= retries) {
          const waitTime = (retryAfter || Math.pow(2, attempt)) * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
        throw new PayPalRateLimitError(`PayPal rate limit (429) reached for ${path}`, retryAfter);
      }

      if (res.status >= 500) {
        if (attempt <= retries) {
          const waitTime = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
        const errorText = await res.text().catch(() => '');
        throw new PayPalServerError(`PayPal server error (${res.status}) on ${path}: ${errorText}`, res.status);
      }

      // Other 4xx client errors
      const errorData = await res.json().catch(() => ({}));
      throw new PayPalAPIError(
        `PayPal request failed (${res.status}): ${errorData.message || JSON.stringify(errorData)}`,
        res.status,
        errorData
      );
    } catch (err: any) {
      if (err instanceof PayPalAPIError) throw err;
      if (attempt <= retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      throw new PayPalAPIError(`Network error communicating with PayPal: ${err.message}`, 0, err);
    }
  }
}
