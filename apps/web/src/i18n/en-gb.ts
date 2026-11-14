import type { Dictionary } from './types';

// Only the words that are spelled differently in British English. Everything else falls back to
// `en`. Typed loosely on purpose: it is an overlay, not a full dictionary.
export const enGB: Dictionary = {};
