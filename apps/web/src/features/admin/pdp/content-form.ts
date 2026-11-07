import {
  findBandProblems,
  type AdminProductContent,
  type AdminProductContentInput,
  type ConstituentKey,
  type LifeStage,
} from '@store/shared';

import { bpToPercent, gramsToKg } from '../../../lib/units';
import { inputToCents, inputToInt } from '../money-input';

export { bpToPercent, gramsToKg };

// The product-content form as strings (what inputs hold) and the two conversions at its edges.
// Basis points and grams are integers in the API; people type percent and kilograms. Both
// conversions work on the TEXT, never `Number(x) * 100`, for the same reason money does.

export const PERCENT_KEYS = ['protein', 'fat', 'fibre', 'ash', 'moisture'] as const;
export type PercentKey = (typeof PERCENT_KEYS)[number];

export interface FeedingFormRow {
  minKg: string;
  maxKg: string;
  dailyG: string;
  lifeStage: LifeStage;
}
export interface ConstituentFormRow {
  variantId: string;
  protein: string;
  fat: string;
  fibre: string;
  ash: string;
  moisture: string;
  kcal: string;
}
export interface ContentForm {
  specs: { label: string; value: string }[];
  faqs: { question: string; answer: string }[];
  feeding: FeedingFormRow[];
  constituents: ConstituentFormRow[];
  deliveryNote: string;
  sizeGuideId: string;
}

/** "26.5" or "26,50" -> 2650 basis points; anything that is not 0 to 100 with two decimals -> null. */
export function percentToBp(raw: string): number | null {
  const bp = inputToCents(raw);
  return bp !== null && bp <= 10_000 ? bp : null;
}
const KG = /^\d{1,3}(?:[.,]\d{1,3})?$/;
/** "7.5" -> 7500 grams, done on the text; null for anything else. */
export function kgToGrams(raw: string): number | null {
  const text = raw.trim();
  if (!KG.test(text)) return null;
  const [whole = '0', fraction = ''] = text.replace(',', '.').split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}
export function toForm(content: AdminProductContent): ContentForm {
  return {
    specs: content.specs.map((s) => ({ ...s })),
    faqs: content.faqs.map((f) => ({ question: f.question, answer: f.answer })),
    feeding: content.feedingTable.map((r) => ({
      minKg: gramsToKg(r.petWeightGMin),
      maxKg: gramsToKg(r.petWeightGMax),
      dailyG: String(r.dailyG),
      lifeStage: r.lifeStage,
    })),
    constituents: content.constituents.map((c) => {
      const at = (key: ConstituentKey) => c.values.find((v) => v.key === key)?.valueBp;
      const percent = (key: PercentKey) => {
        const bp = at(key);
        return bp === undefined ? '' : bpToPercent(bp);
      };
      return {
        variantId: c.variantId,
        protein: percent('protein'),
        fat: percent('fat'),
        fibre: percent('fibre'),
        ash: percent('ash'),
        moisture: percent('moisture'),
        kcal: at('kcal') === undefined ? '' : String(at('kcal')),
      };
    }),
    deliveryNote: content.deliveryNote ?? '',
    sizeGuideId: content.sizeGuideId ?? '',
  };
}

export type FormErrors = Record<string, string>;

// Turns the form into the API body. Every problem is returned at once, keyed by input
// (`feeding.2.minKg`), so the form can put each sentence on its own field.
export function toInput(form: ContentForm): {
  input: AdminProductContentInput;
  errors: FormErrors;
} {
  const errors: FormErrors = {};

  const specs = form.specs.map((s) => ({ label: s.label.trim(), value: s.value.trim() }));
  const seen = new Set<string>();
  specs.forEach((s, i) => {
    if (!s.label) errors[`specs.${i}.label`] = 'Required';
    else if (seen.has(s.label.toLowerCase()))
      errors[`specs.${i}.label`] = 'This label is used twice';
    seen.add(s.label.toLowerCase());
    if (!s.value) errors[`specs.${i}.value`] = 'Required';
  });

  const faqs = form.faqs.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }));
  faqs.forEach((f, i) => {
    if (!f.question) errors[`faqs.${i}.question`] = 'Required';
    if (!f.answer) errors[`faqs.${i}.answer`] = 'Required';
  });

  const rows = form.feeding.map((r, i) => {
    const min = kgToGrams(r.minKg);
    const max = kgToGrams(r.maxKg);
    const daily = inputToInt(r.dailyG);
    if (min === null) errors[`feeding.${i}.minKg`] = 'Whole kg or up to 3 decimals';
    if (max === null) errors[`feeding.${i}.maxKg`] = 'Whole kg or up to 3 decimals';
    else if (min !== null && max <= min)
      errors[`feeding.${i}.maxKg`] = 'Must be above the lower weight';
    if (daily === null || daily < 1) errors[`feeding.${i}.dailyG`] = 'Whole grams, at least 1';
    return {
      petWeightGMin: min ?? 0,
      petWeightGMax: max ?? 0,
      dailyG: daily ?? 0,
      lifeStage: r.lifeStage,
    };
  });
  // The gap/overlap rule only makes sense once every band parses (a typo would read as a gap).
  if (Object.keys(errors).every((k) => !k.startsWith('feeding.'))) {
    for (const p of findBandProblems(rows)) errors[`feeding.${p.index}.minKg`] = p.message;
  }

  const constituents = form.constituents.map((c, i) => {
    const values: { key: ConstituentKey; valueBp: number }[] = [];
    for (const key of PERCENT_KEYS) {
      const raw = c[key].trim();
      if (raw === '') continue;
      const bp = percentToBp(raw);
      if (bp === null) errors[`constituents.${i}.${key}`] = '0 to 100, up to 2 decimals';
      else values.push({ key, valueBp: bp });
    }
    if (c.kcal.trim() !== '') {
      const kcal = inputToInt(c.kcal);
      if (kcal === null || kcal > 9000)
        errors[`constituents.${i}.kcal`] = 'Whole number up to 9000';
      else values.push({ key: 'kcal', valueBp: kcal });
    }
    return { variantId: c.variantId, values };
  });

  return {
    input: {
      specs,
      faqs,
      feedingTable: rows,
      constituents,
      deliveryNote: form.deliveryNote.trim() === '' ? null : form.deliveryNote.trim(),
      sizeGuideId: form.sizeGuideId === '' ? null : form.sizeGuideId,
    },
    errors,
  };
}

// Server-side "feedingTable: message" style errors cannot name a row; this maps the server's field
// errors onto the form where they can, and returns the rest as one sentence.
export function formErrorsFromServer(fieldErrors: Record<string, string[]>): FormErrors {
  return Object.fromEntries(
    Object.entries(fieldErrors).flatMap(([field, messages]) =>
      messages[0] ? [[field, messages[0]] as const] : [],
    ),
  );
}
