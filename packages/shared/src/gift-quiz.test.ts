import { describe, expect, it } from 'vitest';

import {
  GIFT_BUDGETS,
  GIFT_KEYS,
  MAX_PICKS,
  giftSearch,
  parseGiftAnswers,
  scoreGifts,
  type GiftAnswers,
} from './gift-quiz.ts';
import type { ProductCard } from './schemas/catalog.ts';

let n = 0;
function card(
  over: Partial<ProductCard> & { attrs?: ProductCard['attributes'] } = {},
): ProductCard {
  n += 1;
  const { attrs, ...rest } = over;
  return {
    id: `p${String(n).padStart(3, '0')}`,
    slug: `p${n}`,
    name: `Product ${String(n).padStart(3, '0')}`,
    categorySlug: 'dog-toys',
    image: null,
    price: { minCents: 1000, maxCents: 1000, currency: 'EUR' },
    inStock: true,
    attributes: { pet: 'dog', ageStage: 'all', ...attrs },
    brand: null,
    badges: [],
    unitPrice: null,
    swatches: [],
    sale: null,
    hasMemberPrice: false,
    member: null,
    rating: { count: 0, averageTenths: 0 },
    ...rest,
  };
}
const answers: GiftAnswers = { pet: 'dog', age: 'adult', budget: 2500, goal: 'play' };

describe('scoreGifts', () => {
  it('excludes out-of-stock products and other pets', () => {
    const ok = card({ name: 'Ok' });
    const result = scoreGifts(
      [ok, card({ inStock: false }), card({ attrs: { pet: 'cat', ageStage: 'all' } })],
      answers,
    );
    expect(result.picks.map((p) => p.card.name)).toEqual(['Ok']);
    expect(result.relaxed).toEqual([]);
  });

  it('respects the budget (the cheapest variant counts) and a band of 0 means no limit', () => {
    const cheap = card({
      name: 'Cheap',
      price: { minCents: 2500, maxCents: 9000, currency: 'EUR' },
    });
    const dear = card({ name: 'Dear', price: { minCents: 2501, maxCents: 2501, currency: 'EUR' } });
    expect(scoreGifts([cheap, dear], answers).picks.map((p) => p.card.name)).toEqual(['Cheap']);
    const unlimited = scoreGifts([cheap, dear], { ...answers, budget: 0 });
    expect(unlimited.picks).toHaveLength(2);
    expect(unlimited.relaxed).toEqual([]);
  });

  it('ranks the goal first, then the exact age, then the badges', () => {
    const toy = card({ name: 'Toy', categorySlug: 'dog-toys' });
    const bed = card({ name: 'Bed', categorySlug: 'dog-beds', badges: ['Bestseller'] });
    const exact = card({ name: 'Adult toy', attrs: { pet: 'dog', ageStage: 'adult' } });
    const result = scoreGifts([bed, toy, exact], { ...answers, goal: 'play' });
    // The bed is filtered out by the goal; the adult toy beats the all-ages toy.
    expect(result.picks.map((p) => p.card.name)).toEqual(['Adult toy', 'Toy']);
  });

  it('breaks ties by name and then id, so the order is stable', () => {
    const a = card({ name: 'Same', id: 'b' });
    const b = card({ name: 'Same', id: 'a' });
    const c = card({ name: 'Alpha' });
    const first = scoreGifts([a, b, c], answers).picks.map((p) => p.card.id);
    const second = scoreGifts([c, b, a], answers).picks.map((p) => p.card.id);
    expect(first).toEqual(second);
    expect(first).toEqual([c.id, 'a', 'b']);
  });

  it('returns at most six picks', () => {
    const many = Array.from({ length: 20 }, () => card());
    expect(scoreGifts(many, answers).picks).toHaveLength(MAX_PICKS);
  });

  it('builds the why line from what matched', () => {
    const [pick] = scoreGifts(
      [card({ attrs: { pet: 'dog', ageStage: 'adult' }, badges: ['Bestseller'] })],
      answers,
    ).picks;
    expect(pick?.why).toBe('Great for playtime, made for adult pets, a bestseller, from €10.00.');
  });

  it('relaxes the budget first and says so, then the age, then the goal', () => {
    const dearToy = card({ price: { minCents: 9000, maxCents: 9000, currency: 'EUR' } });
    expect(scoreGifts([dearToy], answers)).toMatchObject({ relaxed: ['budget'] });

    const seniorToy = card({
      attrs: { pet: 'dog', ageStage: 'senior' },
      price: { minCents: 9000, maxCents: 9000, currency: 'EUR' },
    });
    expect(scoreGifts([seniorToy], answers)).toMatchObject({ relaxed: ['budget', 'age'] });

    const bed = card({
      categorySlug: 'dog-beds',
      price: { minCents: 9000, maxCents: 9000, currency: 'EUR' },
    });
    const result = scoreGifts([bed], { ...answers, age: 'senior' });
    expect(result.picks).toHaveLength(1);
    expect(result.relaxed).toEqual(['budget', 'goal']);
  });

  it('never relaxes the pet', () => {
    const result = scoreGifts([card({ attrs: { pet: 'cat', ageStage: 'all' } })], answers);
    expect(result.picks).toEqual([]);
  });

  it('treats a pet lover as any pet', () => {
    const result = scoreGifts(
      [
        card({ name: 'Dog', attrs: { pet: 'dog', ageStage: 'all' } }),
        card({ name: 'Fish', attrs: { pet: 'fish', ageStage: 'all' } }),
      ],
      { ...answers, pet: 'any' },
    );
    expect(result.picks.map((p) => p.card.name).sort()).toEqual(['Dog', 'Fish']);
  });
});

describe('URL answers', () => {
  it('parses a complete, valid URL', () => {
    const search = new URLSearchParams('pet=dog&age=adult&budget=2500&goal=play');
    expect(parseGiftAnswers(search).complete).toEqual(answers);
  });

  it('falls back to the first unanswered question for invalid or missing params', () => {
    const bad = parseGiftAnswers(new URLSearchParams('pet=horse&age=adult&budget=2500&goal=play'));
    expect(bad.complete).toBeNull();
    expect(bad.partial).toEqual({});
    const missing = parseGiftAnswers(new URLSearchParams('pet=cat&age=young'));
    expect(missing.complete).toBeNull();
    expect(missing.partial).toEqual({ pet: 'cat', age: 'young' });
    const oddBudget = parseGiftAnswers(new URLSearchParams('pet=cat&age=young&budget=7&goal=play'));
    expect(oddBudget.complete).toBeNull();
    expect(oddBudget.partial).toEqual({ pet: 'cat', age: 'young' });
  });

  it('round-trips through giftSearch', () => {
    const text = giftSearch(answers);
    expect(parseGiftAnswers(new URLSearchParams(text)).complete).toEqual(answers);
  });

  it('keeps budget bands as integer cents', () => {
    expect(GIFT_BUDGETS.every((b) => Number.isInteger(b))).toBe(true);
    expect(GIFT_KEYS).toEqual(['pet', 'age', 'budget', 'goal']);
  });
});
