import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminVariant } from '@store/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import { StockFormSchema, type StockFormInput } from './product-form';
import { useSetAdminInventory } from './queries';

const REASONS = [
  { value: 'restock', label: 'Restock (new stock arrived)' },
  { value: 'correction', label: 'Correction (recount)' },
  { value: 'damage', label: 'Damage or loss' },
  { value: 'return', label: 'Return (inspected, back on sale)' },
] as const;

function StockForm({ variant, onDone }: { variant: AdminVariant; onDone: () => void }) {
  const toast = useToast();
  const mutation = useSetAdminInventory();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StockFormInput, unknown, ReturnType<typeof StockFormSchema.parse>>({
    resolver: zodResolver(StockFormSchema),
    defaultValues: { quantity: String(variant.quantity), reason: 'restock', note: '' },
  });

  const submit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(
      {
        variantId: variant.id,
        input: {
          quantity: values.quantity,
          reason: values.reason,
          ...(values.note && { note: values.note }),
        },
      },
      {
        onSuccess: (result) => {
          const sign = result.delta > 0 ? '+' : '';
          toast.show(`Stock set to ${result.quantity} (${sign}${result.delta})`, 'success');
          onDone();
        },
        // A 409 here is "below what unpaid orders reserved"; the server's sentence says how many.
        onError: (error: unknown) => setFormError(adminErrorMessage(error)),
      },
    );
  });

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      data-testid={TEST_IDS.adminStockForm}
      className="flex flex-col gap-4"
    >
      <FormAlert message={formError} />
      <p className="text-sm text-muted">
        On hand {variant.quantity}, reserved by unpaid orders {variant.reserved}, available{' '}
        {variant.available}.
      </p>
      <Input
        label="Units on hand"
        inputMode="numeric"
        hint="The count on the shelf. The change is recorded with your reason."
        error={errors.quantity?.message}
        {...register('quantity')}
      />
      <Select label="Reason" error={errors.reason?.message} {...register('reason')}>
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <Input label="Note (optional)" error={errors.note?.message} {...register('note')} />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          Save stock
        </Button>
      </div>
    </form>
  );
}

export function StockDialog({
  variant,
  onClose,
}: {
  /** The variant being adjusted; null keeps the dialog closed. */
  variant: AdminVariant | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={variant !== null}
      onClose={onClose}
      title={variant ? `Adjust stock for ${variant.sku}` : 'Adjust stock'}
    >
      {variant && <StockForm variant={variant} onDone={onClose} />}
    </Dialog>
  );
}
