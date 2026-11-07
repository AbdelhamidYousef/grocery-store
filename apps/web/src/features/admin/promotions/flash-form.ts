import {
  AdminFlashSaleInputSchema,
  type AdminFlashSale,
  type AdminFlashSaleInput,
} from '@store/shared';

import { inputToIso, isoToInput } from '../content/datetime';
import { centsToInput, inputToCents } from '../money-input';

import type { Parsed } from './code-form';

// The flash-sale form's text -> the API's input. Row errors are keyed "items.<n>.variant" and
// "items.<n>.salePriceCents", the same keys the server uses, so both land on the same inputs.

export interface FlashItemState {
  /** Stable key for React; not sent. */
  key: string;
  sku: string;
  /** Euros as typed. */
  price: string;
}
export interface FlashFormState {
  name: string;
  startsAt: string;
  endsAt: string;
  items: FlashItemState[];
}

let counter = 0;
export const newItem = (sku = '', price = ''): FlashItemState => ({
  key: `item-${(counter += 1)}`,
  sku,
  price,
});

export const emptyFlashForm = (): FlashFormState => ({
  name: '',
  startsAt: '',
  endsAt: '',
  items: [newItem()],
});

export const saleToForm = (s: AdminFlashSale): FlashFormState => ({
  name: s.name,
  startsAt: isoToInput(s.startsAt),
  endsAt: isoToInput(s.endsAt),
  items: s.items.map((i) => newItem(i.sku, centsToInput(i.salePriceCents))),
});

/** Whole percent off the regular price, rounded; integer maths on cents. */
export function percentOff(regularCents: number, saleCents: number): number {
  if (regularCents <= 0) return 0;
  return Math.round(((regularCents - saleCents) * 100) / regularCents);
}

export function parseFlashForm(form: FlashFormState): Parsed<AdminFlashSaleInput> {
  const errors: Record<string, string> = {};
  const seen = new Map<string, number>();
  const items = form.items.map((item, i) => {
    const sku = item.sku.trim();
    if (sku === '') errors[`items.${i}.variant`] = 'Enter the SKU';
    else if (seen.has(sku.toLowerCase()))
      errors[`items.${i}.variant`] = 'This SKU is already in the sale';
    else seen.set(sku.toLowerCase(), i);
    const cents = inputToCents(item.price);
    if (cents === null) errors[`items.${i}.salePriceCents`] = 'Enter a price in euros, like 4.50';
    else if (cents <= 0) errors[`items.${i}.salePriceCents`] = 'The sale price must be above 0';
    return { variant: sku, salePriceCents: cents ?? 0 };
  });
  const candidate = {
    name: form.name,
    startsAt: inputToIso(form.startsAt) ?? '',
    endsAt: inputToIso(form.endsAt) ?? '',
    items,
  };
  if (!form.startsAt) errors.startsAt = 'Pick when the sale starts';
  if (!form.endsAt) errors.endsAt = 'Pick when the sale ends';
  const checked = AdminFlashSaleInputSchema.safeParse(candidate);
  if (!checked.success) {
    for (const issue of checked.error.issues) {
      const path = issue.path.join('.');
      if (path.startsWith('items.') && errors[path]) continue;
      if (path === 'startsAt' || path === 'endsAt') {
        errors[path] ??= issue.message;
      } else if (path === 'name' || path === 'items') {
        errors[path] ??= issue.message;
      }
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, input: candidate };
}

/** Where a server field error belongs: the input's own key, or the form as a whole. */
export function serverFieldErrors(details: unknown): Record<string, string> {
  const fields = (details as { fieldErrors?: Record<string, unknown> } | undefined)?.fieldErrors;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fields ?? {})) {
    const first = Array.isArray(messages) ? messages.find((m) => typeof m === 'string') : undefined;
    if (typeof first === 'string') out[key] = first;
  }
  return out;
}
