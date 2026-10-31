import type { ShippingQuote } from '@store/shared';

import type { WebCart } from '../../api/cart';
import type { PlacedOrder } from '../../api/checkout';
import { TEST_IDS } from '../../lib/test-ids';

import { SummaryLines, TotalsList } from './OrderSummary';

// The sidebar. Lines and subtotal come from the cart, the shipping price from the quote the server
// gave for the chosen method, and the TOTAL only from the server's answer to POST /checkout: the
// browser never adds money up, so what it shows is always what Stripe will charge.
export function CheckoutSummary({
  cart,
  quote,
  placed,
}: {
  cart: WebCart;
  quote: ShippingQuote | null;
  placed: PlacedOrder | null;
}) {
  const lines = cart.items
    .filter((i) => i.available > 0)
    .map((i) => ({
      key: i.id,
      name: i.productName,
      variant: i.variantName,
      quantity: i.quantity,
      lineTotalCents: i.lineTotalCents,
      imageUrl: i.imageUrl,
    }));
  const totals = placed?.totals;
  return (
    <aside
      aria-label="Order summary"
      data-testid={TEST_IDS.checkoutSummary}
      className="flex flex-col gap-4 rounded-card border-2 border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-32"
    >
      <h2 className="font-display text-xl font-bold">Order summary</h2>
      <SummaryLines lines={lines} currency={cart.currency} />
      <TotalsList
        currency={cart.currency}
        rows={[
          { label: 'Subtotal', cents: totals?.subtotalCents ?? cart.subtotalCents },
          {
            label: 'Shipping',
            cents: totals?.shippingCents ?? quote?.priceCents ?? null,
            fallback: 'Next step',
            free: true,
          },
          ...(totals && totals.discountCents > 0
            ? [{ label: 'Discount', cents: -totals.discountCents }]
            : []),
        ]}
        total={{ cents: totals?.totalCents ?? null, fallback: 'Confirmed at payment' }}
      />
    </aside>
  );
}
