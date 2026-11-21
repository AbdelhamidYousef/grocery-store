import { useMutation } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { answerSwap } from '../api/substitutions';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Button } from '../components/ui/Button';
import { useT } from '../i18n';
import { TEST_IDS } from '../lib/test-ids';

// The page the accept / reject links of the "We changed something in your order" email open. Opening
// it changes nothing (mail scanners open links): the shopper presses the button, which sends the
// answer with the signed token from the link. No sign-in needed.
export default function OrderChangesPage() {
  const { number = '' } = useParams();
  const [params] = useSearchParams();
  const { t } = useT();
  const item = params.get('item') ?? '';
  const token = params.get('token') ?? '';
  const decision = params.get('decision') === 'reject' ? 'reject' : 'accept';
  const send = useMutation({
    mutationFn: () => answerSwap(number, item, { decision, token }),
  });
  const error = send.error;
  const errorKey =
    error instanceof ApiError && error.status === 404
      ? 'subs.link.error.gone'
      : error instanceof ApiError && error.status === 409
        ? 'subs.link.error.closed'
        : 'subs.link.error.generic';
  const broken = item === '' || token === '';

  return (
    <Container className="py-10" data-testid={TEST_IDS.pageOrderChanges}>
      <Seo title={t('subs.link.title')} noindex />
      <h1 className="font-display text-3xl font-bold">{t('subs.link.title')}</h1>
      <p className="mt-1 break-all text-muted">{number}</p>
      {broken ? (
        <p role="alert" className="mt-4">
          {t('subs.link.error.gone')}
        </p>
      ) : send.isSuccess ? (
        <p role="status" data-testid={TEST_IDS.orderChangesDone} className="mt-4 font-semibold">
          {t(decision === 'accept' ? 'subs.link.done.accept' : 'subs.link.done.reject')}
        </p>
      ) : (
        <div className="mt-4 flex max-w-prose flex-col gap-4">
          <p>{t(decision === 'accept' ? 'subs.link.intro.accept' : 'subs.link.intro.reject')}</p>
          {send.isError && (
            <p role="alert" className="font-semibold text-danger">
              {t(errorKey)}
            </p>
          )}
          <Button
            type="button"
            className="self-start"
            variant={decision === 'accept' ? 'primary' : 'secondary'}
            loading={send.isPending}
            data-testid={TEST_IDS.orderChangesConfirm}
            onClick={() => send.mutate()}
          >
            {t(decision === 'accept' ? 'subs.link.confirm.accept' : 'subs.link.confirm.reject')}
          </Button>
        </div>
      )}
      <p className="mt-8">
        <Link to="/" className="font-semibold text-primary-strong underline">
          {t('subs.link.shop')}
        </Link>
      </p>
    </Container>
  );
}
