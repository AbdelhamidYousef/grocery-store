import type { WithdrawalReceipt } from '@store/shared';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { submitWithdrawal } from '../api/withdrawals';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { FormAlert } from '../features/auth/AuthCard';
import { useT, type TFunction } from '../i18n';
import { useFormat } from '../i18n/format';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

function messageFor(error: unknown, t: TFunction, tm: (message: string) => string): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return t('returns.withdraw.notFound');
    if (error.status === 409) return tm(error.message);
    if (error.status === 429) return t('returns.withdraw.tooMany');
  }
  return t('returns.withdraw.failed');
}

// EU withdrawal: the visitor proves the order with number + email (the same check as order
// tracking), says what they withdraw from, and gets a reference and an email as proof.
export default function WithdrawPage() {
  const [params] = useSearchParams();
  const { t, tm } = useT();
  const fmt = useFormat();
  const whenFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(fmt.locale, {
        dateStyle: 'long',
        timeStyle: 'long',
        timeZone: 'UTC',
      }),
    [fmt.locale],
  );
  const [orderNumber, setOrderNumber] = useState(params.get('number') ?? '');
  const [email, setEmail] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WithdrawalReceipt | null>(null);

  const send = useMutation({
    mutationFn: submitWithdrawal,
    onSuccess: (r) => {
      setReceipt(r);
      track({ name: 'withdrawal_submitted', orderNumber: r.orderNumber });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !email.trim()) {
      setFieldError(t('returns.withdraw.fieldError'));
      return;
    }
    setFieldError(null);
    send.mutate({ orderNumber, email, itemsText, reason });
  };

  if (receipt) {
    return (
      <Container className="py-8" data-testid={TEST_IDS.pageWithdraw}>
        <Seo title={t('returns.withdraw.doneSeo')} noindex />
        <section
          aria-labelledby="withdraw-done"
          className="max-w-xl rounded-card border-2 border-success bg-success-soft p-5"
          data-testid={TEST_IDS.withdrawSuccess}
        >
          <h1 id="withdraw-done" className="font-display text-2xl font-bold">
            {t('returns.withdraw.doneTitle')}
          </h1>
          <p className="mt-2">
            {t('returns.withdraw.doneOrder', {
              number: receipt.orderNumber,
              date: whenFormat.format(new Date(receipt.requestedAt)),
            })}
          </p>
          <p className="mt-2">
            {t('returns.withdraw.doneReference', { reference: receipt.reference })}
          </p>
          <p className="mt-4">
            <Link to="/" className="font-semibold text-primary-strong underline">
              {t('returns.withdraw.backToShop')}
            </Link>
          </p>
        </section>
      </Container>
    );
  }

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageWithdraw}>
      <Seo title={t('returns.withdraw.title')} description={t('returns.withdraw.seoDescription')} />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('returns.withdraw.title')}</h1>
      <p className="mt-2 max-w-prose text-muted">
        {t('returns.withdraw.intro')}{' '}
        <Link to="/returns" className="font-semibold text-primary-strong underline">
          {t('returns.withdraw.returnsLink')}
        </Link>
        .
      </p>
      <form
        onSubmit={submit}
        noValidate
        data-testid={TEST_IDS.withdrawForm}
        className="mt-5 flex max-w-xl flex-col gap-4"
      >
        <FormAlert message={fieldError ?? (send.error ? messageFor(send.error, t, tm) : null)} />
        <Input
          label={t('returns.withdraw.orderNumber')}
          placeholder="GR-2026-000123"
          autoComplete="off"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
        />
        <Input
          label={t('returns.withdraw.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Textarea
          label={t('returns.withdraw.items')}
          hint={t('returns.withdraw.itemsHint')}
          rows={3}
          maxLength={500}
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
        />
        <Textarea
          label={t('returns.withdraw.reason')}
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button type="submit" loading={send.isPending}>
          {t('returns.withdraw.title')}
        </Button>
      </form>
    </Container>
  );
}
