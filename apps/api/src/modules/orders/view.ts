import type { Order } from '@store/shared';

import type { OrderItemRow, OrderRow, PaymentRow } from '../checkout/repo.ts';

export const totalsOf = (order: OrderRow): Order['totals'] => ({
  currency: order.currency,
  subtotalCents: order.subtotalCents,
  shippingCents: order.shippingCents,
  discountCents: order.discountCents,
  donationCents: order.donationCents,
  taxCents: order.taxCents,
  totalCents: order.totalCents,
});

// The one place a database order becomes the `Order` the web (and the emails) read, so the
// confirmation page, the account page, the admin page and the email can never disagree about what
// an order contains.
export function toOrderDto(
  order: OrderRow,
  items: OrderItemRow[],
  payment: PaymentRow | undefined,
): Order {
  return {
    number: order.number,
    status: order.status,
    paymentStatus: payment?.status ?? null,
    email: order.email,
    totals: totalsOf(order),
    shippingMethod: { code: order.shippingMethodCode, name: order.shippingMethodName },
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    notes: order.notes,
    items: items.map((i) => ({
      id: i.id,
      productName: i.productName,
      variantName: i.variantName,
      sku: i.sku,
      imageUrl: i.imageUrl,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
      lineTotalCents: i.lineTotalCents,
    })),
    placedAt: order.placedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}
