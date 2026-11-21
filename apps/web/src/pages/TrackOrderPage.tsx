import { TrackOrderBodySchema, type TrackedOrder, type TrackOrderBody } from '@store/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { trackOrder } from '../api/tracking';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormAlert } from '../features/auth/AuthCard';
import { TrackedOrderView } from '../features/tracking/TrackedOrderView';
import { useT, type TFunction } from '../i18n';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

// Same words for "wrong email" and "no such order": the server gives one answer, the page gives one
// message, so nothing here helps someone guess which order numbers exist.
function messageFor(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && error.status === 404) return t('account.tracking.notFound');
  if (error instanceof ApiError && error.status === 429) return t('account.tracking.tooMany');
  return t('account.tracking.failed');
}

export default function TrackOrderPage() {
  const [params] = useSearchParams();
  const { t } = useT();
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

  // While the bag is on the way the page asks again every 30 seconds (the same lookup, the same
  // body), so the rider's progress and "delivered" show up without a reload. A failed refresh keeps
  // what is on screen.
  const lastBody = useRef<TrackOrderBody | null>(null);
  const refresh = useMutation({ mutationFn: trackOrder, onSuccess: setResult });
  const { mutate: refreshNow } = refresh;
  const onTheWay = result?.status === 'shipped';
  useEffect(() => {
    if (!onTheWay) return;
    const id = window.setInterval(() => {
      if (lastBody.current) refreshNow(lastBody.current);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [onTheWay, refreshNow]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = TrackOrderBodySchema.safeParse({ orderNumber, email });
    if (!parsed.success) {
      setFieldError(t('account.tracking.fieldError'));
      return;
    }
    setFieldError(null);
    lastBody.current = parsed.data;
    lookup.mutate(parsed.data);
  };

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageTrackOrder}>
      <Seo
        title={t('account.tracking.seoTitle')}
        description={t('account.tracking.seoDescription')}
        noindex
      />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">
        {t('account.tracking.seoTitle')}
      </h1>
      <p className="mt-2 max-w-prose text-muted">{t('account.tracking.intro')}</p>
      <form onSubmit={submit} noValidate className="mt-5 flex max-w-md flex-col gap-4">
        <FormAlert message={fieldError ?? (lookup.error ? messageFor(lookup.error, t) : null)} />
        <Input
          label={t('account.tracking.orderNumber')}
          placeholder="GR-2026-000123"
          autoComplete="off"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          data-testid={TEST_IDS.trackOrderNumber}
        />
        <Input
          label={t('account.tracking.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid={TEST_IDS.trackEmail}
        />
        <Button type="submit" loading={lookup.isPending} data-testid={TEST_IDS.trackSubmit}>
          {t('account.tracking.submit')}
        </Button>
      </form>
      {result && <TrackedOrderView order={result} />}
    </Container>
  );
}
