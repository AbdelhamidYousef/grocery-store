import type { WithdrawalReceipt } from '@store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { submitWithdrawal } from '../api/withdrawals';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { FormAlert } from '../features/auth/AuthCard';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'We could not find an order with that number and email. Check both and try again.';
    }
    if (error.status === 409) return error.message;
    if (error.status === 429)
      return 'Too many tries from this connection. Please wait and try again.';
  }
  return 'We could not send your withdrawal right now. Please try again in a moment.';
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  timeStyle: 'long',
  timeZone: 'UTC',
});

// EU withdrawal: the visitor proves the order with number + email (the same check as order
// tracking), says what they withdraw from, and gets a reference and an email as proof.
export default function WithdrawPage() {
  const [params] = useSearchParams();
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
      setFieldError('Enter your order number and the email you ordered with.');
      return;
    }
    setFieldError(null);
    send.mutate({ orderNumber, email, itemsText, reason });
  };

  if (receipt) {
    return (
      <Container className="py-8" data-testid={TEST_IDS.pageWithdraw}>
        <Seo title="Withdrawal received" noindex />
        <section
          aria-labelledby="withdraw-done"
          className="max-w-xl rounded-card border-2 border-success bg-success-soft p-5"
          data-testid={TEST_IDS.withdrawSuccess}
        >
          <h1 id="withdraw-done" className="font-display text-2xl font-bold">
            We received your withdrawal
          </h1>
          <p className="mt-2">
            Order <strong className="break-all">{receipt.orderNumber}</strong>, received on{' '}
            <strong>{WHEN.format(new Date(receipt.requestedAt))}</strong>.
          </p>
          <p className="mt-2">
            Your reference is <strong>{receipt.reference}</strong>. We have emailed you a
            confirmation: keep it as your proof.
          </p>
          <p className="mt-4">
            <Link to="/" className="font-semibold text-primary-strong underline">
              Back to the shop
            </Link>
          </p>
        </section>
      </Container>
    );
  }

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageWithdraw}>
      <Seo title="Withdraw from contract" description="Withdraw from an order within 14 days." />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Withdraw from contract</h1>
      <p className="mt-2 max-w-prose text-muted">
        In the EU you may withdraw from an order within 14 days of receiving it, without giving a
        reason. Fill in the form and we will confirm by email. See also our{' '}
        <Link to="/returns" className="font-semibold text-primary-strong underline">
          returns page
        </Link>
        .
      </p>
      <form
        onSubmit={submit}
        noValidate
        data-testid={TEST_IDS.withdrawForm}
        className="mt-5 flex max-w-xl flex-col gap-4"
      >
        <FormAlert message={fieldError ?? (send.error ? messageFor(send.error) : null)} />
        <Input
          label="Order number"
          placeholder="PW-2026-000123"
          autoComplete="off"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
        />
        <Input
          label="Email used for the order"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Textarea
          label="Items (optional)"
          hint="Leave empty to withdraw from the whole order."
          rows={3}
          maxLength={500}
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
        />
        <Textarea
          label="Reason (optional)"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button type="submit" loading={send.isPending}>
          Withdraw from contract
        </Button>
      </form>
    </Container>
  );
}
