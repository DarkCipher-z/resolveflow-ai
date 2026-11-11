export class PayPalAPIError extends Error {
  public status: number;
  public details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'PayPalAPIError';
    this.status = status;
    this.details = details;
  }
}

export class PayPalAuthError extends PayPalAPIError {
  constructor(message = 'PayPal Authentication failed', details?: any) {
    super(message, 401, details);
    this.name = 'PayPalAuthError';
  }
}

export class PayPalForbiddenError extends PayPalAPIError {
  constructor(message = 'Forbidden: PayPal permissions or scopes missing', details?: any) {
    super(message, 403, details);
    this.name = 'PayPalForbiddenError';
  }
}

export class PayPalRateLimitError extends PayPalAPIError {
  public retryAfterSeconds: number;

  constructor(message = 'PayPal Rate limit exceeded (429)', retryAfterSeconds = 5, details?: any) {
    super(message, 429, details);
    this.name = 'PayPalRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class PayPalServerError extends PayPalAPIError {
  constructor(message = 'PayPal Server error (5xx)', status = 500, details?: any) {
    super(message, status, details);
    this.name = 'PayPalServerError';
  }
}
