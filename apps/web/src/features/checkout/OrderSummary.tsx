import {
  formatGrams,
  lineShareCents,
  type OrderAddress,
  type OrderItem,
  type OrderTotals,
} from '@store/shared';

import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { image600 } from '../../lib/images';
import { TEST_IDS } from '../../lib/test-ids';

export interface SummaryLine {
  key: string;
  name: string;
  variant: string;
  quantity: number;
  lineTotalCents: number;
  imageUrl: string | null;
  /** "Weighed 470 g": set once a weighed line has been packed. */
  note?: string | undefined;
  /** What a weighed line really came to (shown instead of the estimate once known). */
  finalCents?: number | null | undefined;
  weighedGrams?: number | null | undefined;
  /** Substitutions (G7): the line a replacement stands in for. */
  replaces?: string | undefined;
  /** Only some units were found: "2 of 3" is shown instead of the quantity. */
  found?: { picked: number; quantity: number } | undefined;
  /** None of it was found and nothing replaces it: the price reads "Not charged". */
  notCharged?: boolean | undefined;
}

export const linesOfOrder = (
  items: OrderItem[],
): (SummaryLine & { weighedGrams?: number | null })[] =>
  items
    // A replacement the shopper rejected is not part of what they bought or pay for.
    .filter((i) => i.swapStatus !== 'rejected')
    .map((i) => {
      const picked = i.pickedQty;
      const isReplacement = i.substitutesItemId !== null;
      const short = !isReplacement && picked !== null && picked < i.quantity;
      const replaced = isReplacement ? items.find((o) => o.id === i.substitutesItemId) : undefined;
      return {
        key: i.id,
        name: i.productName,
        variant: i.variantName,
        quantity: i.quantity,
        // Units not found are not charged: the line shows the share of what was packed.
        lineTotalCents: short
          ? lineShareCents(i.lineTotalCents, picked, i.quantity)
          : i.lineTotalCents,
        imageUrl: i.imageUrl,
        finalCents: i.finalCents,
        weighedGrams: i.weighedGrams,
        replaces: replaced?.productName,
        found: short && picked > 0 ? { picked, quantity: i.quantity } : undefined,
        notCharged: short && picked === 0,
      };
    });

// The picture box has a fixed size, so a long name or a missing image never changes the layout.
export function SummaryLines({ lines, currency }: { lines: SummaryLine[]; currency: string }) {
  const { t } = useT();
  const fmt = useFormat();
  return (
    <ul className="flex flex-col divide-y divide-line">
      {lines.map((line) => (
        <li
          key={line.key}
          data-testid={TEST_IDS.orderItem}
          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          {line.imageUrl ? (
            <img
              src={image600(line.imageUrl)}
              alt=""
              width={64}
              height={64}
              loading="lazy"
              className="h-16 w-16 shrink-0 rounded-control border border-line object-cover"
            />
          ) : (
            <span aria-hidden="true" className="h-16 w-16 shrink-0 rounded-control bg-line" />
          )}
          <div className="min-w-0 flex-1">
            <p className="break-words font-semibold">{line.name}</p>
            <p className="break-words text-sm text-muted">
              {line.variant} ·{' '}
              {line.found
                ? t('subs.order.foundOf', line.found)
                : t('checkout.summary.qty', { quantity: line.quantity })}
            </p>
            {line.replaces && (
              <p className="break-words text-sm font-semibold text-primary-strong">
                {t('subs.order.replaces', { name: line.replaces })}
              </p>
            )}
            {line.finalCents !== null && line.finalCents !== undefined && (
              <p
                data-testid={TEST_IDS.orderItemWeighed}
                className="break-words text-sm font-semibold text-primary-strong"
              >
                {t('weight.weighed', {
                  weight: formatGrams(line.weighedGrams ?? 0, fmt.locale),
                })}
              </p>
            )}
          </div>
          <p className="shrink-0 font-display font-bold">
            {line.notCharged
              ? t('subs.order.notChargedShort')
              : fmt.money(line.finalCents ?? line.lineTotalCents, currency)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function TotalsList({
  currency,
  rows,
  total,
}: {
  currency: string;
  rows: { label: string; cents: number | null; fallback?: string; free?: boolean }[];
  /** The grand total; `null` while the server has not confirmed one. */
  total: { cents: number | null; fallback: string };
}) {
  const { t } = useT();
  const fmt = useFormat();
  return (
    <dl className="flex flex-col gap-1.5 border-t-2 border-line pt-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4">
          <dt>{row.label}</dt>
          <dd className="text-right font-semibold">
            {row.cents === null
              ? (row.fallback ?? '-')
              : row.free && row.cents === 0
                ? t('checkout.summary.free')
                : fmt.money(row.cents, currency)}
          </dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
        <dt className="font-bold">{t('checkout.summary.total')}</dt>
        <dd className="text-right font-display text-xl font-bold" data-testid={TEST_IDS.orderTotal}>
          {total.cents === null ? (
            <span className="text-sm font-semibold text-muted">{total.fallback}</span>
          ) : (
            fmt.money(total.cents, currency)
          )}
        </dd>
      </div>
    </dl>
  );
}

// What was bought and what it came to, as the server recorded it. Used by the confirmation page
// and the order history detail, so both read the same.
export function OrderSummary({
  items,
  totals,
  authorizedCents = null,
  capturedCents = null,
}: {
  items: OrderItem[];
  totals: OrderTotals;
  /** Manual capture: what the card is held for (null for an order charged in full at once). */
  authorizedCents?: number | null;
  /** What was really taken, once it was (the final bill). */
  capturedCents?: number | null;
}) {
  const { t } = useT();
  const fmt = useFormat();
  const weighed = items.some((i) => i.pricePerKgCents !== null);
  return (
    <div data-testid={TEST_IDS.orderSummary} className="flex flex-col gap-4">
      <SummaryLines lines={linesOfOrder(items)} currency={totals.currency} />
      <TotalsList
        currency={totals.currency}
        rows={[
          { label: t('checkout.summary.subtotal'), cents: totals.subtotalCents },
          { label: t('checkout.summary.shipping'), cents: totals.shippingCents, free: true },
          ...(totals.discountCents > 0
            ? [{ label: t('checkout.summary.discount'), cents: -totals.discountCents }]
            : []),
          ...(totals.donationCents > 0
            ? [{ label: t('checkout.summary.donation'), cents: totals.donationCents }]
            : []),
          ...(totals.taxCents > 0
            ? [{ label: t('checkout.summary.tax'), cents: totals.taxCents }]
            : []),
        ]}
        total={{ cents: capturedCents ?? totals.totalCents, fallback: '' }}
      />
      {capturedCents !== null ? (
        <p
          data-testid={TEST_IDS.orderFinalBill}
          className="rounded-control bg-primary-soft p-3 text-sm font-semibold text-primary-strong"
        >
          {authorizedCents !== null && authorizedCents > capturedCents
            ? t('weight.finalBillReleased', {
                amount: fmt.money(capturedCents, totals.currency),
                held: fmt.money(authorizedCents, totals.currency),
              })
            : t('weight.finalBill', { amount: fmt.money(capturedCents, totals.currency) })}
        </p>
      ) : (
        authorizedCents !== null && (
          <p
            data-testid={TEST_IDS.orderHeld}
            className="rounded-control bg-dept-soft p-3 text-sm font-semibold"
          >
            {t(weighed ? 'weight.heldWeighed' : 'weight.held', {
              amount: fmt.money(authorizedCents, totals.currency),
            })}
          </p>
        )
      )}
    </div>
  );
}

// "Where it is going", one block for the confirmation page and the order detail.
export function OrderAddress({ title, address }: { title: string; address: OrderAddress }) {
  return (
    <div data-testid={TEST_IDS.orderAddress}>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <address className="mt-1 break-words not-italic">
        {address.fullName}
        <br />
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {address.postalCode} {address.city}
        {address.region && <>, {address.region}</>}
        <br />
        {address.country}
      </address>
    </div>
  );
}
