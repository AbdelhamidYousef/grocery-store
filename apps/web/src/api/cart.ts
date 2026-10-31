import {
  AddCartItemSchema,
  CartSchema,
  CartWarningSchema,
  OutOfStockDetailsSchema,
  UpdateCartItemSchema,
  type OutOfStockDetails,
} from '@store/shared';
import { z } from 'zod';

import { ApiError, apiFetch } from './client';

// The web is deployed on its own schedule, so a newer API may send a warning code this build has
// never heard of. The shared schema's code is a closed enum, which would turn the whole cart into
// a BAD_RESPONSE; here the code is a plain string and the page falls back to the warning's text.
// The price-change fields are optional extras of PRICE_CHANGED.
const WarningSchema = CartWarningSchema.extend({
  code: z.string(),
  previousUnitPriceCents: z.number().int().min(0).optional(),
  unitPriceCents: z.number().int().min(0).optional(),
});
export type CartWarning = z.infer<typeof WarningSchema>;

const WebCartSchema = CartSchema.extend({ warnings: z.array(WarningSchema) });
export type WebCart = z.infer<typeof WebCartSchema>;
export type WebCartItem = WebCart['items'][number];

const CartResponse = z.object({ data: WebCartSchema });

export async function fetchCart(signal?: AbortSignal): Promise<WebCart> {
  return (await apiFetch('/cart', { schema: CartResponse, ...(signal && { signal }) })).data;
}

export async function addCartItem(input: z.input<typeof AddCartItemSchema>): Promise<WebCart> {
  return (await apiFetch('/cart/items', { method: 'POST', body: input, schema: CartResponse }))
    .data;
}

export async function updateCartItem(
  id: string,
  input: z.input<typeof UpdateCartItemSchema>,
): Promise<WebCart> {
  return (
    await apiFetch(`/cart/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
      schema: CartResponse,
    })
  ).data;
}

export async function removeCartItem(id: string): Promise<WebCart> {
  return (
    await apiFetch(`/cart/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      schema: CartResponse,
    })
  ).data;
}

// `details` of a 409 OUT_OF_STOCK, or null when the error is something else.
export function outOfStockDetails(error: unknown): OutOfStockDetails | null {
  if (!(error instanceof ApiError) || error.code !== 'OUT_OF_STOCK') return null;
  const parsed = OutOfStockDetailsSchema.safeParse(error.details);
  return parsed.success ? parsed.data : null;
}
