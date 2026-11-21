import { z } from 'zod';

// Food information shown on a product page (EU Regulation 1169/2011 style). Everything here is a
// constant or a schema so the API, the admin, the seed and the web app share one definition.

// The 14 allergens the EU requires shops to declare. The slug is what is stored; the labels are
// what a shopper reads (the web app uses these, so a new allergen needs no translation key).
export const ALLERGENS = [
  { slug: 'gluten', en: 'Cereals containing gluten', de: 'Glutenhaltiges Getreide' },
  { slug: 'crustaceans', en: 'Crustaceans', de: 'Krebstiere' },
  { slug: 'eggs', en: 'Eggs', de: 'Eier' },
  { slug: 'fish', en: 'Fish', de: 'Fisch' },
  { slug: 'peanuts', en: 'Peanuts', de: 'Erdnüsse' },
  { slug: 'soybeans', en: 'Soybeans', de: 'Sojabohnen' },
  { slug: 'milk', en: 'Milk', de: 'Milch' },
  { slug: 'nuts', en: 'Tree nuts', de: 'Schalenfrüchte' },
  { slug: 'celery', en: 'Celery', de: 'Sellerie' },
  { slug: 'mustard', en: 'Mustard', de: 'Senf' },
  { slug: 'sesame', en: 'Sesame', de: 'Sesam' },
  { slug: 'sulphites', en: 'Sulphur dioxide and sulphites', de: 'Schwefeldioxid und Sulfite' },
  { slug: 'lupin', en: 'Lupin', de: 'Lupinen' },
  { slug: 'molluscs', en: 'Molluscs', de: 'Weichtiere' },
] as const;

export type AllergenSlug = (typeof ALLERGENS)[number]['slug'];
export const ALLERGEN_SLUGS = ALLERGENS.map((a) => a.slug) as unknown as readonly [
  AllergenSlug,
  ...AllergenSlug[],
];
export const AllergenSchema = z.enum(ALLERGEN_SLUGS);

export const DIETARY_TAGS = [
  { slug: 'vegan', en: 'Vegan', de: 'Vegan' },
  { slug: 'vegetarian', en: 'Vegetarian', de: 'Vegetarisch' },
  { slug: 'gluten-free', en: 'Gluten-free', de: 'Glutenfrei' },
  { slug: 'lactose-free', en: 'Lactose-free', de: 'Laktosefrei' },
  { slug: 'organic', en: 'Organic', de: 'Bio' },
] as const;

export type DietarySlug = (typeof DIETARY_TAGS)[number]['slug'];
export const DIETARY_SLUGS = DIETARY_TAGS.map((d) => d.slug) as unknown as readonly [
  DietarySlug,
  ...DietarySlug[],
];
export const DietarySchema = z.enum(DIETARY_SLUGS);

const nonNegInt = z.number().int().min(0).max(1_000_000);

// Per 100 g or 100 ml. Energy is whole kJ / kcal; every nutrient is an integer number of TENTHS of
// a gram (31 means 3.1 g), the same reason money is cents: no floats, no rounding drift.
export const NutritionSchema = z.object({
  energyKj: nonNegInt,
  energyKcal: nonNegInt,
  fat: nonNegInt,
  saturates: nonNegInt,
  carbs: nonNegInt,
  sugars: nonNegInt,
  fibre: nonNegInt,
  protein: nonNegInt,
  salt: nonNegInt,
});
export type Nutrition = z.infer<typeof NutritionSchema>;

// The order of the rows in the EU table, with the rows that are "of which" (indented).
export const NUTRITION_ROWS = [
  { key: 'fat', indent: false },
  { key: 'saturates', indent: true },
  { key: 'carbs', indent: false },
  { key: 'sugars', indent: true },
  { key: 'fibre', indent: false },
  { key: 'protein', indent: false },
  { key: 'salt', indent: false },
] as const satisfies readonly { key: keyof Nutrition; indent: boolean }[];

/** Tenths of a gram as the label prints them: 31 -> "3.1", 5 -> "0.5", 200 -> "20". */
export function formatTenths(tenths: number, decimal: '.' | ',' = '.'): string {
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? String(whole) : `${whole}${decimal}${frac}`;
}

// Which products carry food information: the same four fields, all optional on the wire so a
// non-food product (a sponge) simply has none.
export const FoodInfoSchema = z.object({
  nutrition: NutritionSchema.nullable(),
  ingredients: z.string().nullable(),
  allergens: z.array(AllergenSchema),
  dietary: z.array(DietarySchema),
});
export type FoodInfo = z.infer<typeof FoodInfoSchema>;

export type IngredientPart = { text: string; allergen: boolean };

/**
 * Splits an ingredients line into plain and allergen parts. The catalogue marks an allergen by
 * writing the word in capitals ("WHEAT flour"); the page prints it in bold in normal case.
 * A capitalised word is lower-cased, and re-capitalised only at the very start of the text.
 */
export function parseIngredients(text: string): IngredientPart[] {
  const parts: IngredientPart[] = [];
  const re = /[A-ZÄÖÜ]{3,}(?:[A-ZÄÖÜ-]*[A-ZÄÖÜ])?/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index;
    if (at > last) parts.push({ text: text.slice(last, at), allergen: false });
    const lower = m[0].toLowerCase();
    parts.push({
      text: at === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower,
      allergen: true,
    });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), allergen: false });
  return parts;
}
