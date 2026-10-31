import { TrackOrderBodySchema, type TrackedOrder } from '@store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { trackOrder } from '../api/tracking';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormAlert } from '../features/auth/AuthCard';
import { TrackedOrderView } from '../features/tracking/TrackedOrderView';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

// Same words for "wrong email" and "no such order": the server gives one answer, the page gives one
// message, so nothing here helps someone guess which order numbers exist.
const NOT_FOUND =
  'We could not find an order with that number and email. Check both and try again.';

function messageFor(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return NOT_FOUND;
  if (error instanceof ApiError && error.status === 429) {
    return 'Too many tries from this connection. Please wait a while and try again.';
  }
  return 'We could not look that up right now. Please try again in a moment.';
}

export default function TrackOrderPage() {
  const [params] = useSearchParams();
  // The confirmation email links here with the number filled in; the email is never in a URL.
  const [orderNumber, setOrderNumber] = useState(params.get('number') ?? '');
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackedOrder | null>(null);

  const lookup = useMutation({
    mutationFn: trackOrder,
    onSuccess: (order) => {
      setResult(order);
      track({ name: 'track_order', status: order.status });
    },
    onError: () => setResult(null),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = TrackOrderBodySchema.safeParse({ orderNumber, email });
    if (!parsed.success) {
      setFieldError('Enter your order number and the email you ordered with.');
      return;
    }
    setFieldError(null);
    lookup.mutate(parsed.data);
  };

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageTrackOrder}>
      <Seo title="Track your order" description="See where your Pawsome order is." noindex />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Track your order</h1>
      <p className="mt-2 max-w-prose text-muted">
        Enter the order number from your confirmation email and the email address you used. You do
        not need an account.
      </p>
      <form onSubmit={submit} noValidate className="mt-5 flex max-w-md flex-col gap-4">
        <FormAlert message={fieldError ?? (lookup.error ? messageFor(lookup.error) : null)} />
        <Input
          label="Order number"
          placeholder="PW-2026-000123"
          autoComplete="off"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          data-testid={TEST_IDS.trackOrderNumber}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid={TEST_IDS.trackEmail}
        />
        <Button type="submit" loading={lookup.isPending} data-testid={TEST_IDS.trackSubmit}>
          Track order
        </Button>
      </form>
      {result && <TrackedOrderView order={result} />}
    </Container>
  );
}
