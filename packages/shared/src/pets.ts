import { z } from 'zod';

// The pet values a product can carry in `attributes.pet`. One constant so the API schema, the
// admin validation, the seed and the web theme can never disagree about which pets exist.
// `small` is the attribute value for the "Small Pets" category (slug `small-pets`).
export const PET_VALUES = ['dog', 'cat', 'bird', 'fish', 'small', 'reptile'] as const;
export const PetSchema = z.enum(PET_VALUES);
export type Pet = z.infer<typeof PetSchema>;

// Net contents are stored as integers in the base *small* unit (grams or millilitres), so unit
// price maths never touches a float (see unit-price.ts).
export const NET_UNITS = ['g', 'ml'] as const;
export const NetUnitSchema = z.enum(NET_UNITS);
export type NetUnit = z.infer<typeof NetUnitSchema>;
