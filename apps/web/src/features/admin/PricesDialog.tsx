import { STORES, formatMoney, type AdminVariant } from '@store/shared';
import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import { centsToInput, inputToCents } from './money-input';
import { useAdminVariantPrices, useSetAdminVariantPrices } from './queries';

// The currencies the store views sell in, other than EUR (which is the variant's own price).
const OTHER_CURRENCIES = [...new Set(STORES.map((s) => s.currency))].filter((c) => c !== 'EUR');

function PricesForm({ variant, onDone }: { variant: AdminVariant; onDone: () => void }) {
  const toast = useToast();
  const query = useAdminVariantPrices(variant.id);
  const mutation = useSetAdminVariantPrices(variant.id);
  // What the shopper-facing rows say now, until the admin types something over it.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const values = Object.fromEntries(
    OTHER_CURRENCIES.map((c) => {
      const row = query.data?.prices.find((p) => p.currency === c);
      return [c, edits[c] ?? (row ? centsToInput(row.priceCents) : '')];
    }),
  );

  const submit = () => {
    setError(null);
    const prices: { currency: string; priceCents: number }[] = [];
    for (const currency of OTHER_CURRENCIES) {
      const raw = (values[currency] ?? '').trim();
      if (raw === '') continue;
      const cents = inputToCents(raw);
      if (cents === null) {
        setError(`${currency}: type an amount such as 12.99`);
        return;
      }
      prices.push({ currency, priceCents: cents });
    }
    mutation.mutate(
      { prices },
      {
        onSuccess: () => {
          toast.show(`Prices saved for ${variant.sku}`, 'success');
          onDone();
        },
        onError: (e) => setError(adminErrorMessage(e)),
      },
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      data-testid={TEST_IDS.adminPricesForm}
      className="flex flex-col gap-4"
    >
      <FormAlert message={error} />
      <p className="text-sm text-muted">
        EUR price: {formatMoney(variant.priceCents, 'EUR')} (edit it with the variant). A currency
        left empty means this variant is not sold in that store view: nothing is converted.
      </p>
      {OTHER_CURRENCIES.map((currency) => (
        <Input
          key={currency}
          label={`${currency} price`}
          inputMode="decimal"
          value={values[currency] ?? ''}
          onChange={(e) => setEdits((v) => ({ ...v, [currency]: e.target.value }))}
        />
      ))}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={query.isPending}>
          Save prices
        </Button>
      </div>
    </form>
  );
}

export function PricesDialog({
  variant,
  onClose,
}: {
  variant: AdminVariant | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={variant !== null}
      onClose={onClose}
      title={variant ? `Prices for ${variant.sku}` : 'Prices'}
    >
      {variant && <PricesForm variant={variant} onDone={onClose} />}
    </Dialog>
  );
}
