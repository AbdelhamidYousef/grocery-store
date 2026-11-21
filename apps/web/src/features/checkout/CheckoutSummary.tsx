import { Link } from 'react-router-dom';

import type { WebCart } from '../../api/cart';
import type { PlacedOrder } from '../../api/checkout';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';
import { WeighedNotice } from '../weight/Weight';

import { SummaryLines, TotalsList } from './OrderSummary';

const LONG_LIST = 5;

// The sidebar. Lines and subtotal come from the cart, the shipping price from the quote the server
// gave for the chosen method, and the TOTAL only from the server's answer to POST /checkout: the
// browser never adds money up, so what it shows is always what Stripe will charge.
export function CheckoutSummary({
  cart,
  placed,
  codeProblem = null,
}: {
  cart: WebCart;
  placed: PlacedOrder | null;
  /** Why the discount code stopped applying, when checkout refused it. */
  codeProblem?: string | null;
}) {
  const { t } = useT();
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
  // Before the order is placed the lines come from the server's bill of the cart (never added up
  // here); after, from the totals the server stored and will charge.
  const bill = cart.pricing.bill;
  const discountCents = totals?.discountCents ?? bill.discountCents;
  const depositCents = totals?.depositCents ?? bill.depositCents;
  const bagCents = totals?.bagFeeCents ?? bill.bagFeeCents;
  return (
    <aside
      aria-label={t('checkout.summary.aria')}
      data-testid={TEST_IDS.checkoutSummary}
      className="flex flex-col gap-4 rounded-card border-2 border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-32"
    >
      <h2 className="font-display text-xl font-bold">{t('checkout.summary.title')}</h2>
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
            {t('checkout.summary.codeBack')}
          </Link>
        </div>
      )}
      {lines.length > LONG_LIST ? (
        // 20 lines would push the totals 17 screens down on a phone. Past a handful the list
        // scrolls inside its own box; it is focusable so a keyboard can scroll it too.
        <div
          role="region"
          aria-label={t('checkout.summary.itemsRegion', { count: lines.length })}
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
          {
            label: t('checkout.summary.subtotal'),
            cents: totals?.subtotalCents ?? bill.subtotalCents,
          },
          ...(discountCents > 0
            ? [{ label: t('checkout.summary.discount'), cents: -discountCents }]
            : []),
          ...(depositCents > 0
            ? [{ label: t('checkout.summary.deposit'), cents: depositCents }]
            : []),
          ...(bagCents > 0 ? [{ label: t('checkout.summary.bags'), cents: bagCents }] : []),
          ...(!totals && !bill.bags
            ? [{ label: t('checkout.summary.noBags'), cents: 0, free: true }]
            : []),
          {
            label: t('checkout.summary.shipping'),
            // The fee follows the chosen delivery time; before one is chosen it is the next step.
            cents: totals?.shippingCents ?? (bill.deliveryEstimated ? null : bill.deliveryFeeCents),
            fallback: t('checkout.summary.shippingNext'),
            free: true,
          },
          ...(totals && totals.donationCents > 0
            ? [{ label: t('checkout.summary.donation'), cents: totals.donationCents }]
            : []),
        ]}
        total={{ cents: totals?.totalCents ?? null, fallback: t('checkout.summary.totalPending') }}
      />
      <WeighedNotice
        items={cart.items}
        totalCents={totals?.totalCents ?? cart.pricing.totalEstimateCents}
        currency={cart.currency}
      />
    </aside>
  );
}
