import { EmailSchema } from '@store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { ApiError } from '../../api/client';
import { createStockAlert } from '../../api/stock-alerts';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';
import { track } from '../../lib/track';
import { useAuthOptional } from '../auth/AuthProvider';

// Shown instead of a dead end when a variant is sold out. A signed-in shopper's address is
// prefilled; a guest types one. One email, once, with a cancel link.
export function StockAlertForm({ variantId }: { variantId: string }) {
  const { user } = useAuthOptional();
  const { t, tm } = useT();
  const [email, setEmail] = useState(user?.email ?? '');
  const [error, setError] = useState<string | undefined>();
  const send = useMutation({
    mutationFn: createStockAlert,
    onSuccess: () => track({ name: 'stock_alert_created' }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = EmailSchema.safeParse(email);
    if (!parsed.success) {
      setError(tm(parsed.error.issues[0]?.message ?? ''));
      return;
    }
    setError(undefined);
    send.mutate({ variantId, email: parsed.data });
  };

  if (send.isSuccess) {
    return (
      <p
        role="status"
        data-testid={TEST_IDS.stockAlertDone}
        className="rounded-control border-2 border-success bg-success-soft p-3 font-semibold"
      >
        {t('loyalty.stockAlerts.done', { email: email.trim().toLowerCase() })}
      </p>
    );
  }
  const apiMessage =
    send.error instanceof ApiError
      ? send.error.status === 409
        ? t('loyalty.stockAlerts.inStock')
        : send.error.status === 400
          ? t('loyalty.stockAlerts.limit')
          : send.error.status === 429
            ? t('loyalty.stockAlerts.tooMany')
            : t('loyalty.stockAlerts.failed')
      : send.error
        ? t('loyalty.stockAlerts.failed')
        : undefined;
  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid={TEST_IDS.stockAlertForm}
      className="flex flex-col gap-2 rounded-card border-2 border-line bg-dept-soft p-4"
    >
      <p className="font-display font-bold">{t('loyalty.stockAlerts.title')}</p>
      <Input
        label={t('loyalty.stockAlerts.email')}
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      {apiMessage && (
        <p role="alert" className="font-semibold text-danger">
          {apiMessage}
        </p>
      )}
      <Button type="submit" variant="secondary" loading={send.isPending}>
        {t('loyalty.stockAlerts.submit')}
      </Button>
    </form>
  );
}
