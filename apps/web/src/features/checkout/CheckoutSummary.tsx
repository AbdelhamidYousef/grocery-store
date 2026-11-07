import type { ShippingQuote } from '@store/shared';
import { Link } from 'react-router-dom';

import type { WebCart } from '../../api/cart';
import type { PlacedOrder } from '../../api/checkout';
import { TEST_IDS } from '../../lib/test-ids';

import { SummaryLines, TotalsList } from './OrderSummary';

const LONG_LIST = 5;

// The sidebar. Lines and subtotal come from the cart, the shipping price from the quote the server
// gave for the chosen method, and the TOTAL only from the server's answer to POST /checkout: the
// browser never adds money up, so what it shows is always what Stripe will charge.
export function CheckoutSummary({
  cart,
  quote,
  placed,
  codeProblem = null,
}: {
  cart: WebCart;
  quote: ShippingQuote | null;
  placed: PlacedOrder | null;
  /** Why the discount code stopped applying, when checkout refused it. */
  codeProblem?: string | null;
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
      {codeProblem && (
        // The same sentence is already in the step's alert; this one sits by the money with the
        // way out, so it is plain text (one alert is enough).
        <div
          data-testid={TEST_IDS.checkoutCodeProblem}
          className="rounded-control border-2 border-danger bg-danger-soft p-3 text-danger"
        >
          <p className="font-semibold">{codeProblem}</p>
          <Link
            to="/cart"
            className="mt-1 inline-flex min-h-11 items-center font-semibold underline"
          >
            Back to your cart to change the code
          </Link>
        </div>
      )}
      {lines.length > LONG_LIST ? (
        // 20 lines would push the totals 17 screens down on a phone. Past a handful the list
        // scrolls inside its own box; it is focusable so a keyboard can scroll it too.
        <div
          role="region"
          aria-label={`Items in your order (${lines.length}), scrollable`}
          tabIndex={0}
          data-testid="checkout-summary-lines"
          className="max-h-80 overflow-y-auto overscroll-contain pr-2"
        >
          <SummaryLines lines={lines} currency={cart.currency} />
        </div>
      ) : (
        <SummaryLines lines={lines} currency={cart.currency} />
      )}
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
