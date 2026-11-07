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

// The top-level category each pet shops in (`/c/<slug>`). The menu and the pet pages use it to go
// from a pet to its category without guessing; `small` is the pet value, `small-pets` the slug.
export const PET_CATEGORY_SLUGS: Record<Pet, string> = {
  dog: 'dogs',
  cat: 'cats',
  bird: 'birds',
  fish: 'fish',
  small: 'small-pets',
  reptile: 'reptiles',
};
