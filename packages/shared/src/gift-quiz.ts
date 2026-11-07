import { z } from 'zod';

import { formatMoney } from './money.ts';
import { PET_VALUES } from './pets.ts';
import type { ProductCard } from './schemas/catalog.ts';

// The gift finder (phase 15), as data plus one pure function. Changing a question, an answer or a
// weight is a change to THIS file (a code change on purpose: four questions do not need an admin
// screen). The result page is a pure function of the URL: the same answers and the same
// catalogue always give the same picks, in the same order.

// ---------- questions ----------

export const GIFT_PETS = [...PET_VALUES, 'any'] as const; // "any" = "a pet lover" (no one pet)
export const GIFT_AGES = ['young', 'adult', 'senior', 'any'] as const;
// Integer cents, the highest price the buyer will pay; 0 means "no limit".
export const GIFT_BUDGETS = [1500, 2500, 5000, 10000, 0] as const;
export const GIFT_GOALS = ['play', 'comfort', 'walks', 'treats'] as const;

export const GiftAnswersSchema = z.object({
  pet: z.enum(GIFT_PETS),
  age: z.enum(GIFT_AGES),
  budget: z.coerce
    .number()
    .int()
    .refine((v) => (GIFT_BUDGETS as readonly number[]).includes(v), 'unknown budget band'),
  goal: z.enum(GIFT_GOALS),
});
export type GiftAnswers = z.infer<typeof GiftAnswersSchema>;
export type GiftKey = keyof GiftAnswers;

export const GIFT_QUESTIONS: {
  key: GiftKey;
  title: string;
  hint?: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: 'pet',
    title: 'Who is the gift for?',
    options: [
      { value: 'dog', label: 'A dog' },
      { value: 'cat', label: 'A cat' },
      { value: 'bird', label: 'A bird' },
      { value: 'fish', label: 'Fish' },
      { value: 'small', label: 'A small pet' },
      { value: 'reptile', label: 'A reptile' },
      { value: 'any', label: 'A pet lover (any pet)' },
    ],
  },
  {
    key: 'age',
    title: 'How old are they?',
    hint: 'Young means a puppy or kitten, senior is the golden years.',
    options: [
      { value: 'young', label: 'Young' },
      { value: 'adult', label: 'Grown up' },
      { value: 'senior', label: 'Senior' },
      { value: 'any', label: 'Not sure' },
    ],
  },
  {
    key: 'budget',
    title: "What's the budget?",
    options: [
      { value: '1500', label: 'Up to 15' },
      { value: '2500', label: 'Up to 25' },
      { value: '5000', label: 'Up to 50' },
      { value: '10000', label: 'Up to 100' },
      { value: '0', label: 'No limit' },
    ],
  },
  {
    key: 'goal',
    title: 'What should the gift do?',
    options: [
      { value: 'play', label: 'Playtime' },
      { value: 'comfort', label: 'Comfort and naps' },
      { value: 'walks', label: 'Walks and travel' },
      { value: 'treats', label: 'Treats and food' },
    ],
  },
];

export const GIFT_KEYS: GiftKey[] = GIFT_QUESTIONS.map((q) => q.key);

/** The goal is matched through the category slug (`dog-toys`, `cat-beds`, ...). */
const GOAL_CATEGORY_SUFFIXES: Record<(typeof GIFT_GOALS)[number], string[]> = {
  play: ['-toys'],
  comfort: ['-beds'],
  walks: ['-walk', '-travel'],
  treats: ['-treats', '-food'],
};
export const GOAL_LABELS: Record<(typeof GIFT_GOALS)[number], string> = {
  play: 'playtime',
  comfort: 'comfort and naps',
  walks: 'walks and travel',
  treats: 'treats and food',
};

// ageStage values a product may carry for each answer ("all" suits every age).
const AGE_STAGES: Record<(typeof GIFT_AGES)[number], string[]> = {
  young: ['puppy', 'kitten', 'all'],
  adult: ['adult', 'all'],
  senior: ['senior', 'all'],
  any: [],
};

// Weights: the goal decides what a gift IS, so it outweighs everything; a product made for the
// right age beats one made for all ages; editorial badges only break near-ties.
export const WEIGHTS = {
  goal: 50,
  ageExact: 20,
  ageAll: 10,
  bestseller: 8,
  isNew: 3,
  eco: 2,
  sale: 4,
} as const;

export const MAX_PICKS = 6;

// ---------- parsing the URL ----------

/**
 * Reads the answers out of search params. Returns the parsed answers when all four are valid,
 * otherwise `null` (the page then starts again at question 1) plus the answers that were valid so
 * far, so a partly answered quiz resumes where it stopped.
 */
export function parseGiftAnswers(search: URLSearchParams): {
  complete: GiftAnswers | null;
  partial: Partial<GiftAnswers>;
} {
  const raw = Object.fromEntries(GIFT_KEYS.map((k) => [k, search.get(k) ?? undefined]));
  const complete = GiftAnswersSchema.safeParse(raw);
  if (complete.success) return { complete: complete.data, partial: complete.data };
  const partial: Partial<GiftAnswers> = {};
  for (const key of GIFT_KEYS) {
    const one = GiftAnswersSchema.shape[key].safeParse(raw[key]);
    // An answer counts only while every earlier one is valid: question 3 without question 2 is
    // not a state the wizard can show.
    if (!one.success) break;
    (partial as Record<string, unknown>)[key] = one.data;
  }
  return { complete: null, partial };
}

export function giftSearch(answers: Partial<GiftAnswers>): string {
  const params = new URLSearchParams();
  for (const key of GIFT_KEYS) {
    const value = answers[key];
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

// ---------- scoring ----------

export interface GiftPick {
  card: ProductCard;
  score: number;
  /** One line, built from what matched: "Great for playtime. Suits grown-up dogs." */
  why: string;
}

export type Relaxation = 'budget' | 'age' | 'goal';

export interface GiftResult {
  picks: GiftPick[];
  /** Constraints that had to be dropped to find anything, in the order they were dropped. */
  relaxed: Relaxation[];
}

const categoryMatchesGoal = (card: ProductCard, goal: GiftAnswers['goal']) =>
  GOAL_CATEGORY_SUFFIXES[goal].some((suffix) => card.categorySlug.endsWith(suffix));

function matches(
  card: ProductCard,
  a: GiftAnswers,
  use: { budget: boolean; age: boolean; goal: boolean },
): boolean {
  if (!card.inStock) return false;
  if (a.pet !== 'any' && card.attributes.pet !== a.pet) return false;
  if (use.budget && a.budget > 0 && card.price.minCents > a.budget) return false;
  if (use.age && a.age !== 'any') {
    const stage = card.attributes.ageStage;
    // A product with no age stage at all suits any age.
    if (stage !== undefined && !AGE_STAGES[a.age].includes(stage)) return false;
  }
  if (use.goal && !categoryMatchesGoal(card, a.goal)) return false;
  return true;
}

// Whether a pick breaks a constraint (used to report only what was really relaxed).
function violates(card: ProductCard, a: GiftAnswers, constraint: Relaxation): boolean {
  switch (constraint) {
    case 'budget':
      return a.budget > 0 && card.price.minCents > a.budget;
    case 'age':
      return (
        a.age !== 'any' &&
        card.attributes.ageStage !== undefined &&
        !AGE_STAGES[a.age].includes(card.attributes.ageStage)
      );
    case 'goal':
      return !categoryMatchesGoal(card, a.goal);
  }
}

function score(card: ProductCard, a: GiftAnswers): { score: number; reasons: string[] } {
  let total = 0;
  const reasons: string[] = [];
  if (categoryMatchesGoal(card, a.goal)) {
    total += WEIGHTS.goal;
    reasons.push(`Great for ${GOAL_LABELS[a.goal]}`);
  }
  const stage = card.attributes.ageStage;
  if (a.age !== 'any' && stage !== undefined) {
    if (stage === 'all') {
      total += WEIGHTS.ageAll;
      reasons.push('suits every age');
    } else if (AGE_STAGES[a.age].includes(stage)) {
      total += WEIGHTS.ageExact;
      reasons.push(`made for ${stage === 'puppy' || stage === 'kitten' ? 'young' : stage} pets`);
    }
  }
  if (card.badges.includes('Bestseller')) {
    total += WEIGHTS.bestseller;
    reasons.push('a bestseller');
  }
  if (card.badges.includes('New')) total += WEIGHTS.isNew;
  if (card.badges.includes('Eco')) {
    total += WEIGHTS.eco;
    reasons.push('eco friendly');
  }
  if (card.badges.includes('Sale')) {
    total += WEIGHTS.sale;
    reasons.push('on sale');
  }
  if (a.budget > 0 && card.price.minCents <= a.budget) {
    reasons.push(`from ${formatMoney(card.price.minCents, card.price.currency)}`);
  }
  return { score: total, reasons };
}

const sentence = (reasons: string[]): string => {
  const [first = '', ...rest] = reasons;
  const text = [first, ...rest].join(', ');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : 'A good all-round pick.';
};

/**
 * The picks for a set of answers: at most six in stock products, best score first. Ties break by
 * name and then id, so the same input is always the same output. When nothing fits, the
 * constraints are relaxed one at a time (budget, then age, then goal) and `relaxed` says which,
 * so the page can be honest about it. Pet is never relaxed: a gift for a fish is never a leash.
 */
export function scoreGifts(candidates: ProductCard[], answers: GiftAnswers): GiftResult {
  const steps: { relaxed: Relaxation[]; use: { budget: boolean; age: boolean; goal: boolean } }[] =
    [
      { relaxed: [], use: { budget: true, age: true, goal: true } },
      { relaxed: ['budget'], use: { budget: false, age: true, goal: true } },
      { relaxed: ['budget', 'age'], use: { budget: false, age: false, goal: true } },
      { relaxed: ['budget', 'age', 'goal'], use: { budget: false, age: false, goal: false } },
    ];
  for (const step of steps) {
    const pool = candidates.filter((c) => matches(c, answers, step.use));
    if (pool.length === 0) continue;
    const picks = pool
      .map((card) => {
        const s = score(card, answers);
        return { card, score: s.score, why: sentence(s.reasons) };
      })
      .sort(
        (x, y) =>
          y.score - x.score ||
          x.card.name.localeCompare(y.card.name) ||
          x.card.id.localeCompare(y.card.id),
      )
      .slice(0, MAX_PICKS);
    // A constraint is "relaxed" only if something we show actually breaks it: a senior-dog toy
    // for an adult dog says so, but a toy that fits the age anyway does not.
    const relaxed = step.relaxed.filter((c) => picks.some((p) => violates(p.card, answers, c)));
    return { picks, relaxed };
  }
  return { picks: [], relaxed: ['budget', 'age', 'goal'] };
}
