import { ApiError } from '../../api/client';
import { formErrorMessage } from '../auth/form-errors';

// The text for a failed admin write. A validation error that could not be put on a single input
// (the server reports only the first path segment, e.g. `variants`) lists every message instead of
// the useless "Invalid input"; a 409 already carries a sentence written for people ("That SKU is
// already used by another variant").
export function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
    const details = error.details as { fieldErrors?: Record<string, unknown> } | undefined;
    const lines = Object.entries(details?.fieldErrors ?? {}).flatMap(([field, messages]) =>
      Array.isArray(messages)
        ? messages.filter((m): m is string => typeof m === 'string').map((m) => `${field}: ${m}`)
        : [],
    );
    if (lines.length > 0) return lines.join('. ');
  }
  return formErrorMessage(error);
}
