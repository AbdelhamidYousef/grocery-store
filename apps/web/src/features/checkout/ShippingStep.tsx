import { formatMoney, type ShippingQuote } from '@store/shared';
import { useId } from 'react';

import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

import { useShippingQuotes } from './queries';

const eta = (q: ShippingQuote) =>
  q.etaDaysMin === q.etaDaysMax
    ? `${q.etaDaysMin} working days`
    : `${q.etaDaysMin}-${q.etaDaysMax} working days`;

// Step 2: the quotes the server priced for this cart and country. Nothing here adds prices up; the
// radio shows each method's own price and the order total comes back from POST /checkout.
export function ShippingStep({
  country,
  selected,
  onSelect,
  onContinue,
  placing,
}: {
  country: string;
  selected: string | null;
  onSelect: (code: string) => void;
  onContinue: (quote: ShippingQuote) => void;
  placing: boolean;
}) {
  const name = useId();
  const { data: quotes, isPending, error, refetch } = useShippingQuotes(country);

  if (isPending && !error) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <p className="sr-only" role="status">
          Loading shipping options
        </p>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (error || !quotes) {
    return (
      <div role="alert" data-testid={TEST_IDS.shippingError}>
        <p className="font-semibold text-danger">We could not load the shipping options.</p>
        <Button className="mt-3" variant="secondary" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (quotes.length === 0) {
    return (
      <p role="alert" className="font-semibold text-danger" data-testid={TEST_IDS.shippingError}>
        We cannot ship this order to that country right now.
      </p>
    );
  }

  // Cheapest first (the API sorts them); keep the shopper's pick if it is still on offer.
  const current = quotes.find((q) => q.code === selected) ?? quotes[0]!;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Shipping method</legend>
        {quotes.map((q) => (
          <label
            key={q.code}
            data-testid={TEST_IDS.shippingOption}
            className={cn(
              'flex min-h-14 cursor-pointer items-start gap-3 rounded-control border-2 p-3',
              q.code === current.code ? 'border-primary bg-primary-soft' : 'border-line',
            )}
          >
            <input
              type="radio"
              name={name}
              value={q.code}
              checked={q.code === current.code}
              onChange={() => onSelect(q.code)}
              className="mt-1 h-5 w-5 shrink-0 accent-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{q.name}</span>
              <span className="block text-sm text-muted">{eta(q)}</span>
            </span>
            <span className="shrink-0 font-display font-bold">
              {q.free ? 'Free' : formatMoney(q.priceCents, q.currency)}
            </span>
          </label>
        ))}
      </fieldset>
      <Button
        size="lg"
        className="self-stretch sm:self-end"
        loading={placing}
        onClick={() => onContinue(current)}
        data-testid={TEST_IDS.checkoutContinuePayment}
      >
        Continue to payment
      </Button>
    </div>
  );
}
