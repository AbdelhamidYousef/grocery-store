import type { ShippingQuote, User, Address } from '@store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { WebCart } from '../../api/cart';
import type { PlacedOrder } from '../../api/checkout';
import { ApiError } from '../../api/client';
import { fetchDeliveryAreas, fetchPostcode } from '../../api/delivery';
import { Checkbox } from '../../components/ui/Checkbox';
import { useT, type TFunction } from '../../i18n';
import { keys } from '../../lib/query-client';
import { paymentsConfigured } from '../../lib/stripe';
import { TEST_IDS } from '../../lib/test-ids';
import { track } from '../../lib/track';
import { useCreateAddress } from '../account/queries';
import { formErrorMessage } from '../auth/form-errors';
import { useDelivery } from '../delivery/DeliveryContext';
import { deliverySentence } from '../delivery/slots';
import { PointsRedeem } from '../loyalty/PointsRedeem';
import { useStore } from '../stores/StoreContext';

import { CheckoutSummary } from './CheckoutSummary';
import { DeliveryTimeStep } from './DeliveryTimeStep';
import type { Details } from './details';
import { detailsDefaults, toInput } from './details';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';
import { usePlaceOrder, useShippingQuotes } from './queries';
import { StepCard } from './StepCard';

type Step = 1 | 2 | 3;

// The 400 for a code that stopped applying (for this email) carries the sentence in
// fieldErrors.code; null for every other error.
function codeProblem(error: unknown, tm: (message: string) => string): string | null {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return null;
  const messages = (error.details as { fieldErrors?: { code?: unknown } } | undefined)?.fieldErrors
    ?.code;
  const message = Array.isArray(messages) ? messages.find((m) => typeof m === 'string') : null;
  return typeof message === 'string' ? tm(message) : null;
}

// The 400 for points the server would not take (balance changed under the shopper).
function pointsProblem(error: unknown, tm: (message: string) => string): string | null {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return null;
  const messages = (error.details as { fieldErrors?: { pointsToRedeem?: unknown } } | undefined)
    ?.fieldErrors?.pointsToRedeem;
  const message = Array.isArray(messages) ? messages.find((m) => typeof m === 'string') : null;
  return typeof message === 'string' ? tm(message) : null;
}

// What to tell the shopper when checkout refuses the delivery time; null for every other error.
function deliveryErrorMessage(code: string, t: TFunction): string | null {
  switch (code) {
    case 'SLOT_HOLD_EXPIRED':
      return t('delivery.error.holdExpired');
    case 'SLOT_FULL':
      return t('delivery.error.slotFull');
    case 'SLOT_CLOSED':
      return t('delivery.error.slotClosed');
    case 'SLOT_WRONG_AREA':
      return t('delivery.error.wrongArea');
    case 'EXPRESS_UNAVAILABLE':
      return t('delivery.error.expressUnavailable');
    case 'DELIVERY_REQUIRED':
      return t('delivery.error.required');
    default:
      return null;
  }
}

function placeErrorMessage(
  error: unknown,
  { t, tm }: { t: TFunction; tm: (message: string) => string },
): string {
  if (error instanceof ApiError) {
    if (error.code === 'CART_CHANGED') {
      return t('checkout.error.cartChanged');
    }
    if (error.code === 'PAYMENT_PROVIDER_ERROR') {
      return t('checkout.error.paymentProvider');
    }
  }
  return formErrorMessage(error, t, tm);
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
  const i18n = useT();
  const { t } = i18n;
  const { shipCountries, locale } = useStore();
  const queryClient = useQueryClient();
  const delivery = useDelivery();
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [details, setDetails] = useState<Details | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [roundUp, setRoundUp] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);

  const place = usePlaceOrder();
  const createAddress = useCreateAddress();
  const { data: quotes } = useShippingQuotes(details?.shippingAddress.country ?? null);
  // The fee follows the delivery time: express has its own, every slot uses the slot fee. (Any
  // other active method stands in when the slot method is not on offer.)
  const expressQuote = quotes?.find((q) => q.code === 'express') ?? null;
  const selectedQuote: ShippingQuote | null =
    step >= 2 && quotes && cart.delivery
      ? cart.delivery.kind === 'express'
        ? expressQuote
        : (quotes.find((q) => q.code === 'slot') ??
          quotes.find((q) => q.code !== 'express') ??
          null)
      : null;

  const goTo = (target: Step) => {
    setStep(target);
    setPlaced(null);
    setError(null);
    setCodeError(null);
    setPointsError(null);
  };

  // The bag is packed at the store of the ADDRESS postcode, so an address we do not deliver to stops
  // here, on the postcode field, before shipping and payment (the API refuses it too).
  const notServedMessage = async (postcode: string, areaNames?: string[]) => {
    const names =
      areaNames ??
      (
        await queryClient.fetchQuery({
          queryKey: keys.delivery.areas,
          queryFn: () => fetchDeliveryAreas(),
          staleTime: 60 * 60_000,
        })
      ).map((a) => a.name);
    return t('delivery.checkout.notServed', { postcode, areas: names.join(', ') });
  };

  const submitDetails = async (values: Details) => {
    setPostcodeError(null);
    const postcode = values.shippingAddress.postalCode.trim();
    try {
      const found = await fetchPostcode(postcode);
      if (!found.served) {
        setPostcodeError(await notServedMessage(postcode));
        return;
      }
    } catch (e) {
      // A malformed postcode is a 400 from the lookup: also "not somewhere we deliver". Any other
      // failure (network) is let through: the API checks the address again when the order is placed.
      if (e instanceof ApiError && e.status === 400) {
        setPostcodeError(await notServedMessage(postcode));
        return;
      }
    }
    setDetails(values);
    goTo(2);
  };

  const continueToPayment = () => {
    const quote = selectedQuote;
    if (!details || !quote) return;
    setError(null);
    setCodeError(null);
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
        ...(user && points > 0 && { pointsToRedeem: points }),
        ...(roundUp && { roundUpDonation: true }),
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
        onError: (e) => {
          const slotMessage = e instanceof ApiError ? deliveryErrorMessage(e.code, t) : null;
          if (slotMessage) {
            // The delivery time is no longer good: back to the picker, with the reason, and fresh
            // slots (the cart too, its hold may be gone).
            goTo(2);
            setError(slotMessage);
            void queryClient.invalidateQueries({ queryKey: keys.cart });
            void queryClient.invalidateQueries({ queryKey: keys.slots });
            return;
          }
          if (e instanceof ApiError && e.code === 'POSTCODE_NOT_SERVED') {
            // Back to the address, with the sentence on the postcode field.
            const d = e.details as { postcode?: string; areas?: string[] } | undefined;
            goTo(1);
            void notServedMessage(d?.postcode ?? details.shippingAddress.postalCode, d?.areas).then(
              setPostcodeError,
            );
            return;
          }
          setError(placeErrorMessage(e, i18n));
          setCodeError(codeProblem(e, i18n.tm));
          setPointsError(pointsProblem(e, i18n.tm));
        },
      },
    );
  };

  const a = details?.shippingAddress;
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-4">
        <StepCard
          id="details"
          number={1}
          title={t('checkout.step.details')}
          state={step === 1 ? 'active' : 'done'}
          onEdit={() => goTo(1)}
          editLabel={t('checkout.step.editDetails')}
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
            defaults={
              details
                ? toInput(details)
                : detailsDefaults(user, addresses, shipCountries, delivery.postcode)
            }
            postcodeError={postcodeError}
            signedIn={user !== null}
            saveAddress={saveAddress}
            onSaveAddressChange={setSaveAddress}
            onSubmit={submitDetails}
          />
        </StepCard>

        <StepCard
          id="shipping"
          number={2}
          title={t('checkout.step.shipping')}
          state={step === 2 ? 'active' : step > 2 ? 'done' : 'locked'}
          onEdit={() => goTo(2)}
          editLabel={t('checkout.step.editShipping')}
          summary={cart.delivery && <p>{deliverySentence(cart.delivery, locale, t)}</p>}
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
              {user && (
                <PointsRedeem
                  merchandiseCents={cart.pricing.merchandiseCents}
                  shippingCents={selectedQuote?.priceCents ?? 0}
                  currency={cart.currency}
                  value={points}
                  onChange={setPoints}
                  problem={pointsError}
                />
              )}
              <div className="mb-4">
                <Checkbox
                  label={t('checkout.roundUp.label')}
                  data-testid={TEST_IDS.roundUp}
                  checked={roundUp}
                  onChange={(e) => setRoundUp(e.target.checked)}
                />
                <p className="ml-8 text-sm text-muted">{t('checkout.roundUp.hint')}</p>
              </div>
              <DeliveryTimeStep
                cart={cart}
                express={expressQuote}
                onContinue={continueToPayment}
                placing={place.isPending}
              />
            </>
          )}
        </StepCard>

        <StepCard
          id="payment"
          number={3}
          title={t('checkout.step.payment')}
          state={step === 3 ? 'active' : 'locked'}
        >
          <PaymentStep placed={placed} />
        </StepCard>
      </div>

      <CheckoutSummary cart={cart} quote={selectedQuote} placed={placed} codeProblem={codeError} />
    </div>
  );
}
