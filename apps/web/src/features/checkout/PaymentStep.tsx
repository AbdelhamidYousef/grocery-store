import { formatMoney } from '@store/shared';
import { Elements, PaymentElement } from '@stripe/react-stripe-js';

import type { PlacedOrder } from '../../api/checkout';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { getStripe, paymentsConfigured } from '../../lib/stripe';
import { TEST_IDS } from '../../lib/test-ids';

import { usePay } from './usePay';

function PayForm({ placed }: { placed: PlacedOrder }) {
  const { pay, paying, error, ready } = usePay(placed.orderNumber);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void pay();
      }}
      className="flex flex-col gap-4"
    >
      <div data-testid={TEST_IDS.paymentElement}>
        <PaymentElement />
      </div>
      {error && (
        <p
          role="alert"
          data-testid={TEST_IDS.paymentError}
          className="rounded-control border-2 border-danger bg-danger-soft p-3 font-semibold text-danger"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        loading={paying}
        disabled={!ready}
        data-testid={TEST_IDS.payButton}
      >
        Pay {formatMoney(placed.totals.totalCents, placed.totals.currency)}
      </Button>
      <p className="text-center text-sm text-muted">
        Test mode: use card 4242 4242 4242 4242, any future date and any CVC. No real money moves.
      </p>
    </form>
  );
}

// Step 3. Without a publishable key (a fresh clone, a preview deploy) there is nothing to mount, so
// the step says so plainly and offers no way to place an order: better an honest dead end than a
// crash or a button that cannot work.
export function PaymentStep({ placed }: { placed: PlacedOrder | null }) {
  if (!paymentsConfigured()) {
    return (
      <div
        role="status"
        data-testid={TEST_IDS.paymentNotConfigured}
        className="rounded-control border-2 border-primary bg-primary-soft p-4"
      >
        <p className="font-display text-lg font-bold">
          Payments aren&apos;t configured in this environment
        </p>
        <p className="mt-1">
          This is a demo shop that only runs in Stripe test mode, and this copy has no Stripe key
          yet, so orders can&apos;t be placed here. Everything before this step works as normal.
        </p>
      </div>
    );
  }
  if (!placed) {
    return (
      <p role="status" className="flex items-center gap-2">
        <Spinner label={null} /> Preparing your payment…
      </p>
    );
  }
  // Keyed by the client secret: Elements cannot swap its secret after mounting.
  return (
    <Elements
      key={placed.clientSecret}
      stripe={getStripe()}
      options={{ clientSecret: placed.clientSecret, appearance: { theme: 'stripe' } }}
    >
      <PayForm placed={placed} />
    </Elements>
  );
}
