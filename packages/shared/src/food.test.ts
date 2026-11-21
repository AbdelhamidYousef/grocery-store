import { describe, expect, it } from 'vitest';

import { ALLERGENS, formatTenths, NutritionSchema, parseIngredients } from './food.ts';

describe('ALLERGENS', () => {
  it('lists the 14 EU allergens once each, with both labels', () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(new Set(ALLERGENS.map((a) => a.slug)).size).toBe(14);
    for (const a of ALLERGENS) expect(a.en && a.de).toBeTruthy();
  });
});

describe('formatTenths', () => {
  it.each([
    [0, '0'],
    [5, '0.5'],
    [31, '3.1'],
    [200, '20'],
    [1234, '123.4'],
  ])('%i tenths prints as %s', (n, text) => {
    expect(formatTenths(n)).toBe(text);
  });

  it('uses a comma for German', () => {
    expect(formatTenths(31, ',')).toBe('3,1');
  });
});

describe('NutritionSchema', () => {
  const ok = {
    energyKj: 380,
    energyKcal: 90,
    fat: 3,
    saturates: 1,
    carbs: 200,
    sugars: 125,
    fibre: 20,
    protein: 11,
    salt: 0,
  };

  it('accepts whole numbers', () => {
    expect(NutritionSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects fractions and negatives (tenths are integers)', () => {
    expect(NutritionSchema.safeParse({ ...ok, fat: 0.3 }).success).toBe(false);
    expect(NutritionSchema.safeParse({ ...ok, salt: -1 }).success).toBe(false);
  });
});

describe('parseIngredients', () => {
  it('marks capitalised words as allergens and prints them in normal case', () => {
    expect(parseIngredients('WHEAT flour, water, MILK.')).toEqual([
      { text: 'Wheat', allergen: true },
      { text: ' flour, water, ', allergen: false },
      { text: 'milk', allergen: true },
      { text: '.', allergen: false },
    ]);
  });

  it('keeps text without allergens as one plain part', () => {
    expect(parseIngredients('Bananas.')).toEqual([{ text: 'Bananas.', allergen: false }]);
  });
});
