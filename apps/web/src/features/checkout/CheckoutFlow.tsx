import type { ShippingQuote, User, Address } from '@store/shared';
import { useState } from 'react';

import type { WebCart } from '../../api/cart';
import type { PlacedOrder } from '../../api/checkout';
import { ApiError } from '../../api/client';
import { paymentsConfigured } from '../../lib/stripe';
import { TEST_IDS } from '../../lib/test-ids';
import { track } from '../../lib/track';
import { useCreateAddress } from '../account/queries';
import { formErrorMessage } from '../auth/form-errors';

import { CheckoutSummary } from './CheckoutSummary';
import type { Details } from './details';
import { detailsDefaults, toInput } from './details';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';
import { usePlaceOrder, useShippingQuotes } from './queries';
import { ShippingStep } from './ShippingStep';
import { StepCard } from './StepCard';

type Step = 1 | 2 | 3;

function placeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'CART_CHANGED') {
      return 'Something in your cart changed while you were checking out (an item sold out or a price moved). We refreshed your order summary, so please look it over and continue.';
    }
    if (error.code === 'PAYMENT_PROVIDER_ERROR') {
      return 'Our payment provider is having trouble right now. You have not been charged; please try again in a moment.';
    }
  }
  return formErrorMessage(error);
}

// The three sections and the state that links them. Going back to an earlier step drops the pending
// order from the screen (its total may no longer be right); continuing again calls POST /checkout,
// which the server answers idempotently for the same cart, so nothing is duplicated.
export function CheckoutFlow({
  cart,
  user,
  addresses,
}: {
  cart: WebCart;
  user: User | null;
  addresses: Address[] | undefined;
}) {
  const [step, setStep] = useState<Step>(1);
  const [details, setDetails] = useState<Details | null>(null);
  const [shippingCode, setShippingCode] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const place = usePlaceOrder();
  const createAddress = useCreateAddress();
  const { data: quotes } = useShippingQuotes(details?.shippingAddress.country ?? null);
  const selectedQuote: ShippingQuote | null =
    step >= 2 && quotes ? (quotes.find((q) => q.code === shippingCode) ?? quotes[0] ?? null) : null;

  const goTo = (target: Step) => {
    setStep(target);
    setPlaced(null);
    setError(null);
  };

  const continueToPayment = (quote: ShippingQuote) => {
    if (!details) return;
    setError(null);
    setShippingCode(quote.code);
    // No publishable key: show the "not configured" state and never create an order that nobody
    // could pay for (it would reserve stock for 30 minutes for nothing).
    if (!paymentsConfigured()) {
      setStep(3);
      return;
    }
    place.mutate(
      {
        email: details.email,
        shippingAddress: details.shippingAddress,
        shippingMethodCode: quote.code,
      },
      {
        onSuccess: (order) => {
          setPlaced(order);
          setStep(3);
          track({
            name: 'add_payment_info',
            valueCents: order.totals.totalCents,
            currency: order.totals.currency,
            shippingMethod: quote.code,
          });
          if (saveAddress && user) {
            const { line2, region, phone, ...rest } = details.shippingAddress;
            createAddress.mutate({
              ...rest,
              label: '',
              line2: line2 ?? '',
              region: region ?? '',
              phone: phone ?? '',
            });
          }
        },
        onError: (e) => setError(placeErrorMessage(e)),
      },
    );
  };

  const a = details?.shippingAddress;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-4">
        <StepCard
          id="details"
          number={1}
          title="Contact and address"
          state={step === 1 ? 'active' : 'done'}
          onEdit={() => goTo(1)}
          summary={
            details &&
            a && (
              <>
                <p className="line-clamp-1 break-all">{details.email}</p>
                <p className="line-clamp-2 break-all">
                  {a.fullName}, {a.line1}, {a.postalCode} {a.city}, {a.country}
                </p>
              </>
            )
          }
        >
          <DetailsStep
            defaults={details ? toInput(details) : detailsDefaults(user, addresses)}
            signedIn={user !== null}
            saveAddress={saveAddress}
            onSaveAddressChange={setSaveAddress}
            onSubmit={(values) => {
              setDetails(values);
              goTo(2);
            }}
          />
        </StepCard>

        <StepCard
          id="shipping"
          number={2}
          title="Shipping method"
          state={step === 2 ? 'active' : step > 2 ? 'done' : 'locked'}
          onEdit={() => goTo(2)}
          summary={selectedQuote && <p>{selectedQuote.name}</p>}
        >
          {details && (
            <>
              {error && (
                <p
                  role="alert"
                  data-testid={TEST_IDS.checkoutError}
                  className="mb-4 rounded-control border-2 border-danger bg-danger-soft p-3 font-semibold text-danger"
                >
                  {error}
                </p>
              )}
              <ShippingStep
                country={details.shippingAddress.country}
                selected={shippingCode}
                onSelect={setShippingCode}
                onContinue={continueToPayment}
                placing={place.isPending}
              />
            </>
          )}
        </StepCard>

        <StepCard id="payment" number={3} title="Payment" state={step === 3 ? 'active' : 'locked'}>
          <PaymentStep placed={placed} />
        </StepCard>
      </div>

      <CheckoutSummary cart={cart} quote={selectedQuote} placed={placed} />
    </div>
  );
}
