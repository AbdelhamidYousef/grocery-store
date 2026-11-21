import { pgEnum } from 'drizzle-orm/pg-core';

// Substitutions (G7). The same lists live in packages/shared (SUBSTITUTION_PREFERENCES, PICK_STATUSES,
// SWAP_STATUSES); a test asserts they match. Written out here because drizzle-kit loads the schema
// files on their own.
export const substitutionPreference = pgEnum('substitution_preference', [
  'best_match',
  'specific',
  'none',
]);
export const pickStatus = pgEnum('pick_status', [
  'pending',
  'picked',
  'short',
  'missing',
  'substituted',
]);
export const swapStatus = pgEnum('swap_status', ['proposed', 'accepted', 'rejected']);
