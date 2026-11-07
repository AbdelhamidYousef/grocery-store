import { z } from 'zod';

import { MAX_PETS, PET_SIZES, isoToday, parseIsoDate } from '../pet-profiles.ts';
import { PetSchema } from '../pets.ts';

import { DataSchema } from './common.ts';

// ---------- pet profiles (phase 15) ----------

const BirthdaySchema = z
  .string()
  .trim()
  .refine((v) => parseIsoDate(v) !== null, 'Use a date like 2024-03-18')
  // A plain calendar date (no time zone): phase 19 sends birthday emails from it. Compared as
  // text, which orders correctly for YYYY-MM-DD.
  .refine((v) => v <= isoToday(new Date()), 'A birthday cannot be in the future');

// Empty string and null both mean "not given", so a form can send what its inputs hold.
const nullable = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), z.null(), schema])
    .optional()
    .transform((v) =>
      v === undefined ? undefined : v === '' || v === null ? null : (v as z.output<T>),
    );

export const PetInputSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(40),
  species: PetSchema,
  birthday: nullable(BirthdaySchema),
  approxAgeMonths: nullable(z.number().int().min(0).max(600)),
  size: nullable(z.enum(PET_SIZES)),
});
export type PetInput = z.input<typeof PetInputSchema>;

export const PetUpdateSchema = PetInputSchema.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Nothing to update',
);
export type PetUpdateInput = z.input<typeof PetUpdateSchema>;

export const PetProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: PetSchema,
  birthday: z.string().nullable(),
  approxAgeMonths: z.number().int().nullable(),
  size: z.enum(PET_SIZES).nullable(),
});
export type PetProfile = z.infer<typeof PetProfileSchema>;

export const PetResponseSchema = DataSchema(PetProfileSchema);
export const PetListResponseSchema = DataSchema(z.array(PetProfileSchema));

// The guest's local pets, sent once after sign-in. Capped like the account itself.
export const PetMergeBodySchema = z.object({ pets: z.array(PetInputSchema).max(MAX_PETS) });
export type PetMergeInput = z.input<typeof PetMergeBodySchema>;
