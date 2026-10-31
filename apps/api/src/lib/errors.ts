import { ErrorCode, errorStatus } from '@store/shared';

// The one error type services throw. Nothing below the error middleware knows about HTTP bodies:
// they pick a code, and the status comes from the shared code→status table so API and web agree.
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown, status = errorStatus[code]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const notFound = (message = 'Not found') => new AppError(ErrorCode.NOT_FOUND, message);

export const unauthenticated = (message = 'Authentication required') =>
  new AppError(ErrorCode.UNAUTHENTICATED, message);

export const forbidden = (message = 'Forbidden') => new AppError(ErrorCode.FORBIDDEN, message);

export const validation = (details?: unknown, message = 'Request validation failed') =>
  new AppError(ErrorCode.VALIDATION_ERROR, message, details);

// Covers CONFLICT, OUT_OF_STOCK and CART_CHANGED: all are 409s that differ only by code.
export const conflict = (
  code:
    | typeof ErrorCode.CONFLICT
    | typeof ErrorCode.OUT_OF_STOCK
    | typeof ErrorCode.CART_CHANGED = ErrorCode.CONFLICT,
  message = 'Conflict',
  details?: unknown,
) => new AppError(code, message, details);

export const rateLimited = (message = 'Too many requests') =>
  new AppError(ErrorCode.RATE_LIMITED, message);
