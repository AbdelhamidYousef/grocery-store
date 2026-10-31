import {
  CheckoutResponseSchema,
  OrderResponseSchema,
  OrderStatusResponseSchema,
  ShippingMethodsResponseSchema,
  type CheckoutRequestInput,
  type CheckoutResponse,
  type Order,
  type OrderStatusResponse,
  type ShippingQuote,
} from '@store/shared';

import { apiFetch } from './client';

export type PlacedOrder = CheckoutResponse['data'];

// Quotes are priced by the server from the caller's own cart, so the answer depends on the cart as
// well as the country; the query key in features/checkout/queries.ts carries the cart's numbers.
export async function fetchShippingQuotes(
  country: string,
  signal?: AbortSignal,
): Promise<ShippingQuote[]> {
  return (
    await apiFetch(`/checkout/shipping-methods?country=${encodeURIComponent(country)}`, {
      schema: ShippingMethodsResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

// Creates (or updates) the pending order and its payment intent. The body has no prices: the
// server prices the cart itself.
export async function placeOrder(input: CheckoutRequestInput): Promise<PlacedOrder> {
  return (
    await apiFetch('/checkout', { method: 'POST', body: input, schema: CheckoutResponseSchema })
  ).data;
}

export async function fetchOrderStatus(
  number: string,
  signal?: AbortSignal,
): Promise<OrderStatusResponse['data']> {
  return (
    await apiFetch(`/checkout/orders/${encodeURIComponent(number)}/status`, {
      schema: OrderStatusResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

// The whole order, for the confirmation page: allowed for the owner or for the browser holding
// the signed `last_order` cookie.
export async function fetchPlacedOrder(number: string, signal?: AbortSignal): Promise<Order> {
  return (
    await apiFetch(`/checkout/orders/${encodeURIComponent(number)}`, {
      schema: OrderResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
