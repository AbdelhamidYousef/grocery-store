// Single source of truth for API error codes (see docs/plan/02-api-contract.md): the API maps a
// thrown AppError to this status, and the web client switches on the code, never on the message.
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  CART_CHANGED: 'CART_CHANGED',
  TRIAL_LIMIT: 'TRIAL_LIMIT',
  POSTCODE_NOT_SERVED: 'POSTCODE_NOT_SERVED',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYMENT_PROVIDER_ERROR: 'PAYMENT_PROVIDER_ERROR',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const errorStatus: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  CART_CHANGED: 409,
  // A trial size is limited to one per customer per variant.
  TRIAL_LIMIT: 409,
  // The delivery address is outside every delivery area: the request is well-formed, we just do not go there.
  POSTCODE_NOT_SERVED: 422,
  RATE_LIMITED: 429,
  // The payment provider (Stripe) failed or is not configured; nothing is charged. Retryable.
  PAYMENT_PROVIDER_ERROR: 502,
  INTERNAL: 500,
};
