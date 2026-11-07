import {
  AdminBulkTierInputSchema,
  AdminDiscountCodeInputSchema,
  AdminGiftRuleInputSchema,
  formatMoney,
  type AdminBulkTierInput,
  type AdminDiscountCode,
  type AdminDiscountCodeInput,
  type AdminGiftRuleInput,
  type DiscountKind,
} from '@store/shared';

import { inputToIso, isoToInput } from '../content/datetime';
import { centsToInput, inputToCents, inputToInt } from '../money-input';

// Everything the promotion forms do that is not drawing: text -> the API's input (money parsed from
// the string, never multiplied as a float), and the one-line summary of a code.

export interface CodeFormState {
  code: string;
  kind: DiscountKind;
  /** percent: a whole number; fixed: euros as typed; free_shipping: ignored. */
  value: string;
  minSpend: string;
  startsAt: string;
  endsAt: string;
  maxUses: string;
  perCustomerMax: string;
  excludeSaleItems: boolean;
  firstOrderOnly: boolean;
  active: boolean;
}

export const emptyCodeForm: CodeFormState = {
  code: '',
  kind: 'percent',
  value: '',
  minSpend: '',
  startsAt: '',
  endsAt: '',
  maxUses: '',
  perCustomerMax: '',
  excludeSaleItems: false,
  firstOrderOnly: false,
  active: true,
};

export function codeToForm(c: AdminDiscountCode): CodeFormState {
  return {
    code: c.code,
    kind: c.kind,
    value: c.kind === 'percent' ? String(c.value) : c.kind === 'fixed' ? centsToInput(c.value) : '',
    minSpend: c.minSpendCents > 0 ? centsToInput(c.minSpendCents) : '',
    startsAt: isoToInput(c.startsAt),
    endsAt: isoToInput(c.endsAt),
    maxUses: c.maxUses === null ? '' : String(c.maxUses),
    perCustomerMax: c.perCustomerMax === null ? '' : String(c.perCustomerMax),
    excludeSaleItems: c.excludeSaleItems,
    firstOrderOnly: c.firstOrderOnly,
    active: c.active,
  };
}

export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; input: T } | { ok: false; errors: FieldErrors };

const NOT_MONEY = 'Enter an amount in euros, like 5 or 5.50';
const NOT_WHOLE = 'Enter a whole number';

function firstErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

// Blank = "no limit" (null); anything that is not a whole number is an error, never silently 0.
function optionalInt(text: string, field: string, errors: FieldErrors): number | null {
  if (text.trim() === '') return null;
  const n = inputToInt(text);
  if (n === null) errors[field] = NOT_WHOLE;
  return n;
}

export function parseCodeForm(form: CodeFormState): Parsed<AdminDiscountCodeInput> {
  const errors: FieldErrors = {};
  let value = 0;
  if (form.kind === 'percent') {
    const n = inputToInt(form.value);
    if (n === null) errors.value = 'Enter a whole percentage, 1 to 100';
    else value = n;
  } else if (form.kind === 'fixed') {
    const cents = inputToCents(form.value);
    if (cents === null) errors.value = NOT_MONEY;
    else value = cents;
  }
  let minSpendCents = 0;
  if (form.minSpend.trim() !== '') {
    const cents = inputToCents(form.minSpend);
    if (cents === null) errors.minSpend = NOT_MONEY;
    else minSpendCents = cents;
  }
  const maxUses = optionalInt(form.maxUses, 'maxUses', errors);
  const perCustomerMax = optionalInt(form.perCustomerMax, 'perCustomerMax', errors);

  const candidate = {
    code: form.code,
    kind: form.kind,
    value,
    minSpendCents,
    startsAt: inputToIso(form.startsAt),
    endsAt: inputToIso(form.endsAt),
    maxUses,
    perCustomerMax,
    excludeSaleItems: form.excludeSaleItems,
    firstOrderOnly: form.firstOrderOnly,
    active: form.active,
  };
  const checked = AdminDiscountCodeInputSchema.safeParse(candidate);
  if (!checked.success) {
    // Our own parse errors (above) are more specific than the schema's for the same field.
    return { ok: false, errors: { ...firstErrors(checked.error.issues), ...errors } };
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: candidate };
}

// "10% off, min EUR 30.00, 5 of 100 used". Works on partial input too, so the form can show it
// while the admin is still typing; `used` is how many live redemptions an existing code has.
export function describeCode(
  c: {
    kind: DiscountKind;
    value: number;
    minSpendCents: number;
    firstOrderOnly: boolean;
    excludeSaleItems: boolean;
    maxUses: number | null;
    perCustomerMax: number | null;
  },
  used = 0,
): string {
  const money = (cents: number) => formatMoney(cents, 'EUR');
  const parts: string[] = [];
  if (c.kind === 'percent') parts.push(`${c.value}% off`);
  else if (c.kind === 'fixed') parts.push(`${money(c.value)} off`);
  else parts.push('Free shipping');
  if (c.minSpendCents > 0) parts.push(`min ${money(c.minSpendCents)}`);
  if (c.firstOrderOnly) parts.push('first order only');
  if (c.excludeSaleItems) parts.push('not on sale items');
  if (c.perCustomerMax !== null) parts.push(`${c.perCustomerMax} per customer`);
  if (c.maxUses !== null) parts.push(`${used} of ${c.maxUses} used`);
  else if (used > 0) parts.push(`${used} used`);
  return parts.join(', ');
}

// What the preview shows for a form that may not be valid yet: the parsed values where they parse,
// otherwise a placeholder that says what is missing instead of "NaN% off".
export function previewForm(form: CodeFormState, used: number): string {
  const parsed = parseCodeForm(form);
  if (parsed.ok) {
    const i = parsed.input;
    return describeCode(
      {
        kind: i.kind,
        value: i.value,
        minSpendCents: i.minSpendCents ?? 0,
        firstOrderOnly: i.firstOrderOnly ?? false,
        excludeSaleItems: i.excludeSaleItems ?? false,
        maxUses: i.maxUses ?? null,
        perCustomerMax: i.perCustomerMax ?? null,
      },
      used,
    );
  }
  return form.kind === 'free_shipping'
    ? 'Free shipping (finish the other fields to see the full sentence)'
    : 'Fill in the amount to see what this code does';
}

// ----- tiers and gift -----
export interface TierFormState {
  min: string;
  percent: string;
  active: boolean;
}

export function parseTierForm(form: TierFormState): Parsed<AdminBulkTierInput> {
  const errors: FieldErrors = {};
  const minCents = inputToCents(form.min);
  if (minCents === null) errors.min = NOT_MONEY;
  const percent = inputToInt(form.percent);
  if (percent === null) errors.percent = 'Enter a whole percentage, 1 to 100';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const candidate = { minCents: minCents ?? 0, percent: percent ?? 0, active: form.active };
  const checked = AdminBulkTierInputSchema.safeParse(candidate);
  if (!checked.success) {
    const e = firstErrors(checked.error.issues);
    return {
      ok: false,
      errors: { ...(e.minCents && { min: e.minCents }), ...(e.percent && { percent: e.percent }) },
    };
  }
  return { ok: true, input: candidate };
}

export function parseGiftForm(form: {
  threshold: string;
  variant: string;
}): Parsed<AdminGiftRuleInput> {
  const errors: FieldErrors = {};
  const cents = inputToCents(form.threshold);
  if (cents === null) errors.threshold = NOT_MONEY;
  const candidate = { thresholdCents: cents ?? 0, variant: form.variant };
  const checked = AdminGiftRuleInputSchema.safeParse(candidate);
  if (!checked.success) {
    const e = firstErrors(checked.error.issues);
    if (cents !== null && e.thresholdCents) errors.threshold = e.thresholdCents;
    if (e.variant) errors.variant = e.variant;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, input: candidate };
}
