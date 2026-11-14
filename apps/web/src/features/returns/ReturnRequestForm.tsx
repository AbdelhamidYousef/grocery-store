import {
  ReturnReasonSchema,
  returnLineRefundCents,
  type OrderItem,
  type ReturnEligibility,
  type ReturnReason,
} from '@store/shared';
import { useState, type FormEvent } from 'react';

import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';
import { formErrorMessage } from '../auth/form-errors';

import { useRequestReturn } from './queries';

interface Props {
  orderNumber: string;
  currency: string;
  items: OrderItem[];
  eligibility: ReturnEligibility;
  onDone: () => void;
  onCancel: () => void;
}

// Pick lines and quantities, give a reason. Only lines that still have units left are offered
// (the API says how many); a line the customer paid nothing for is simply not listed. The refund
// shown is a PREVIEW from the same shared function the API uses, so the number matches.
export function ReturnRequestForm({
  orderNumber,
  currency,
  items,
  eligibility,
  onDone,
  onCancel,
}: Props) {
  const request = useRequestReturn(orderNumber);
  const { t, tm } = useT();
  const fmt = useFormat();
  const offers = items.flatMap((item) => {
    const line = eligibility.lines.find((l) => l.orderItemId === item.id);
    return line && line.returnableQuantity > 0 ? [{ item, left: line.returnableQuantity }] : [];
  });
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason>('changed_mind');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const picked = offers.filter((o) => (chosen[o.item.id] ?? 0) > 0);
  const preview = picked.reduce(
    (sum, o) =>
      sum +
      returnLineRefundCents(
        {
          quantity: o.item.quantity,
          lineTotalCents: o.item.lineTotalCents,
          // The customer view has no per-line discount, so the preview uses the average paid price.
          discountCents: o.item.lineTotalCents - paidFor(o.item, eligibility),
        },
        o.item.quantity - o.left,
        chosen[o.item.id] ?? 0,
      ),
    0,
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (picked.length === 0) {
      setError(t('returns.form.chooseOne'));
      return;
    }
    request.mutate(
      {
        reason,
        note: note.trim() === '' ? null : note.trim(),
        items: picked.map((o) => ({ orderItemId: o.item.id, quantity: chosen[o.item.id] ?? 0 })),
      },
      { onSuccess: onDone, onError: (err) => setError(formErrorMessage(err, t, tm)) },
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="return-form-heading"
      data-testid={TEST_IDS.returnRequestForm}
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
    >
      <h3 id="return-form-heading" className="font-display text-lg font-bold">
        {t('returns.returnItems')}
      </h3>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">{t('returns.form.whichItems')}</legend>
        {offers.map(({ item, left }) => {
          const qty = chosen[item.id] ?? 0;
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <Checkbox
                  label={t('returns.form.itemLabel', {
                    product: item.productName,
                    variant: item.variantName,
                  })}
                  checked={qty > 0}
                  onChange={(e) => setChosen({ ...chosen, [item.id]: e.target.checked ? 1 : 0 })}
                />
              </div>
              {qty > 0 && left > 1 && (
                <Select
                  label={t('returns.form.quantityOf', { product: item.productName })}
                  value={qty}
                  onChange={(e) => setChosen({ ...chosen, [item.id]: Number(e.target.value) })}
                  className="w-24"
                >
                  {Array.from({ length: left }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          );
        })}
      </fieldset>
      <Select
        label={t('returns.form.why')}
        value={reason}
        onChange={(e) => setReason(ReturnReasonSchema.parse(e.target.value))}
      >
        {ReturnReasonSchema.options.map((r) => (
          <option key={r} value={r}>
            {t(`returns.reason.${r}`)}
          </option>
        ))}
      </Select>
      <Textarea
        label={t('returns.form.note')}
        value={note}
        maxLength={500}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
      />
      <p aria-live="polite" data-testid="return-preview">
        {picked.length > 0
          ? t('returns.form.preview', { amount: fmt.money(preview, currency) })
          : t('returns.form.previewEmpty')}
      </p>
      <FormAlert message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={request.isPending}>
          {t('returns.form.send')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('returns.form.cancel')}
        </Button>
      </div>
    </form>
  );
}

// What the customer paid for the whole line, from the API's per-unit average (a preview only).
function paidFor(item: OrderItem, eligibility: ReturnEligibility): number {
  const unit = eligibility.lines.find((l) => l.orderItemId === item.id)?.paidCents ?? 0;
  return Math.min(item.lineTotalCents, unit * item.quantity);
}
