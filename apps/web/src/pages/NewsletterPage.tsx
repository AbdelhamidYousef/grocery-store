import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { confirmNewsletter, unsubscribeNewsletter } from '../api/newsletter';
import { cancelStockAlert } from '../api/stock-alerts';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Spinner } from '../components/ui/Spinner';
import { NewsletterForm } from '../features/newsletter/NewsletterForm';
import { TEST_IDS } from '../lib/test-ids';

export function NewsletterPage() {
  return (
    <Container className="py-10" data-testid={TEST_IDS.pageNewsletter}>
      <Seo
        title="Newsletter"
        description="Pet tips and offers from Pawsome."
        canonical="/newsletter"
      />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Join the pack</h1>
      <p className="mb-5 mt-2 max-w-prose text-muted">
        Subscribe and get 10% off your first order once you confirm your address.
      </p>
      <NewsletterForm />
    </Container>
  );
}

// The link in the email opens one of these; the click is the proof, so the page does the POST
// itself on arrival (once) and only then says what happened. A link that merely loaded a page
// and changed state on GET would be triggered by mail scanners.
function TokenPage({
  title,
  run,
  done,
  testId,
}: {
  title: string;
  run: (token: string) => Promise<unknown>;
  done: (data: unknown) => string;
  testId: string;
}) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const mutation = useMutation({ mutationFn: run });
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    mutation.mutate(token);
  }, [token, mutation]);

  const expired = mutation.error instanceof ApiError && mutation.error.status === 410;
  return (
    <Container className="max-w-xl py-10" data-testid={testId}>
      <Seo title={title} noindex />
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <div className="mt-4" aria-live="polite">
        {!token && <p>This link is incomplete. Please open it again from the email.</p>}
        {token && mutation.isPending && <Spinner label="Working on it" />}
        {mutation.isSuccess && (
          <p className="rounded-control border-2 border-success bg-success-soft p-4 font-semibold">
            {done(mutation.data)}
          </p>
        )}
        {mutation.isError && (
          <p role="alert" className="font-semibold text-danger">
            {expired ? 'This link has expired.' : 'This link is not valid any more.'}{' '}
            <Link to="/newsletter" className="underline">
              Sign up again
            </Link>
          </p>
        )}
      </div>
    </Container>
  );
}

export function NewsletterConfirmPage() {
  return (
    <TokenPage
      title="Confirm your subscription"
      testId={TEST_IDS.newsletterConfirmed}
      run={confirmNewsletter}
      done={(s) =>
        s === 'already_confirmed'
          ? 'You are already subscribed. Your welcome code is in the email we sent.'
          : 'You are subscribed! We just emailed you your 10% welcome code.'
      }
    />
  );
}

export function NewsletterUnsubscribePage() {
  return (
    <TokenPage
      title="Unsubscribe"
      testId={TEST_IDS.newsletterUnsubscribed}
      run={unsubscribeNewsletter}
      done={() => 'You are unsubscribed. We will not send you more news.'}
    />
  );
}

export function StockAlertCancelPage() {
  return (
    <TokenPage
      title="Stock alert"
      testId={TEST_IDS.stockAlertCancelled}
      run={cancelStockAlert}
      done={() => 'Done: we will not email you about that item.'}
    />
  );
}
