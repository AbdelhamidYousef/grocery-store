import { useElements, useStripe } from '@stripe/react-stripe-js';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Confirms the payment with Stripe.js. `redirect: 'if_required'` keeps the shopper on the page for
// plain cards (we navigate ourselves) and only redirects for methods that need it (3-D Secure,
// bank redirects); Stripe then returns them to `return_url`, the same confirmation page.
// Card problems (declined, incomplete number) come back as `error` with a message written for
// the shopper, so they are shown inline and nothing else happens: the order stays pending and the
// same intent can be tried again. Whether it really succeeded is decided by the webhook, which
// the confirmation page waits for.
export function usePay(orderNumber: string) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/confirmation/${encodeURIComponent(orderNumber)}`,
        },
        redirect: 'if_required',
      });
      if (result.error) {
        const shopperFacing =
          result.error.type === 'card_error' || result.error.type === 'validation_error';
        setError(
          shopperFacing && result.error.message
            ? result.error.message
            : 'Something went wrong while paying. You have not been charged; please try again.',
        );
        return;
      }
      void navigate(`/checkout/confirmation/${encodeURIComponent(orderNumber)}`);
    } catch {
      setError('We could not reach the payment provider. Check your connection and try again.');
    } finally {
      setPaying(false);
    }
  };

  return { pay, paying, error, ready: Boolean(stripe && elements) };
}
