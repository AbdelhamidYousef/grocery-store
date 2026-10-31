import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError } from '../../api/client';

// The API's 400 VALIDATION_ERROR carries `details: { fieldErrors: { field: [message, ...] } }`
// (Zod's flatten shape). Copying those messages onto the matching form fields means a rule only
// the server knows (an email already taken, a wrong current password) shows up next to the input
// it is about, exactly like a client-side rule. Returns true when at least one field was set;
// the first one takes focus so a keyboard or screen-reader user lands on the problem.
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return false;
  const fieldErrors = (error.details as { fieldErrors?: Record<string, unknown> } | undefined)
    ?.fieldErrors;
  if (!fieldErrors) return false;
  let mapped = false;
  for (const field of fields) {
    const messages = fieldErrors[field];
    const message = Array.isArray(messages) ? messages.find((m) => typeof m === 'string') : null;
    if (typeof message === 'string') {
      setError(field, { type: 'server', message }, { shouldFocus: !mapped });
      mapped = true;
    }
  }
  return mapped;
}

// Text for an error that belongs to the whole form (wrong password, rate limit, offline).
export function formErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK') return 'Could not reach the server. Check your connection.';
    if (error.code === 'RATE_LIMITED') return 'Too many attempts. Please wait a few minutes.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
