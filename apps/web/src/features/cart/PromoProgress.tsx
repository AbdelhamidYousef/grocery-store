import { formatMoney } from '@store/shared';

import type { WebCart } from '../../api/cart';
import { TEST_IDS } from '../../lib/test-ids';

// A progress bar with its sentence. The sentence is also the bar's accessible value text, so a
// screen reader hears "Spend €2.00 more for a free gift" instead of a bare "95".
function Bar({
  label,
  text,
  percent,
  reached,
  testId,
}: {
  label: string;
  text: string;
  percent: number;
  reached: boolean;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <p className="text-sm">{text}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={text}
        className="mt-1 h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className={reached ? 'h-full rounded-full bg-success' : 'h-full rounded-full bg-primary'}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function GiftProgress({
  pricing,
  currency,
}: {
  pricing: WebCart['pricing'];
  currency: string;
}) {
  const gift = pricing.progress.gift;
  if (!gift) return null;
  return (
    <Bar
      label="Progress to a free gift"
      testId={TEST_IDS.cartGiftProgress}
      percent={gift.percent}
      reached={gift.reached}
      text={
        gift.reached
          ? 'You get a free gift!'
          : `Spend ${formatMoney(gift.remainingCents, currency)} more for a free gift`
      }
    />
  );
}

export function FreeShippingProgress({
  percent,
  remainingCents,
  currency,
}: {
  percent: number;
  remainingCents: number;
  currency: string;
}) {
  return (
    <Bar
      label="Progress to free shipping"
      testId={TEST_IDS.cartShippingHint}
      percent={percent}
      reached={remainingCents === 0}
      text={
        remainingCents === 0
          ? 'You get free standard shipping.'
          : `Add ${formatMoney(remainingCents, currency)} more for free standard shipping.`
      }
    />
  );
}
