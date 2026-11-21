import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminVariant } from '@store/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

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
  // Mitte (the central store) first; the rest in the order the API lists them.
  const first = variant.stores.find((st) => st.storeSlug === 'mitte') ?? variant.stores[0];
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<StockFormInput, unknown, ReturnType<typeof StockFormSchema.parse>>({
    resolver: zodResolver(StockFormSchema),
    defaultValues: {
      storeId: first?.storeId ?? '',
      quantity: String(first?.quantity ?? 0),
      lowStockThreshold: String(first?.lowStockThreshold ?? 5),
      reason: 'restock',
      note: '',
    },
  });
  const chosenStore = useWatch({ control, name: 'storeId' });
  const store = variant.stores.find((st) => st.storeId === chosenStore) ?? first;
  // Counting another store starts from that store's own numbers.
  const storeField = register('storeId', {
    onChange: (e: { target: { value: string } }) => {
      const next = variant.stores.find((st) => st.storeId === e.target.value);
      if (!next) return;
      setValue('quantity', String(next.quantity));
      setValue('lowStockThreshold', String(next.lowStockThreshold));
    },
  });

  const submit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(
      {
        variantId: variant.id,
        input: {
          storeId: values.storeId,
          quantity: values.quantity,
          lowStockThreshold: values.lowStockThreshold,
          reason: values.reason,
          ...(values.note && { note: values.note }),
        },
      },
      {
        onSuccess: (result) => {
          const sign = result.delta > 0 ? '+' : '';
          toast.show(
            `Stock set to ${result.quantity} (${sign}${result.delta}) in ${store?.storeName ?? 'the store'}`,
            'success',
          );
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
      <table className="w-full text-left text-sm" data-testid="admin-stock-stores">
        <thead>
          <tr className="border-b-2 border-line text-muted">
            <th scope="col" className="py-1 pr-2">
              Store
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              On hand
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              Reserved
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              Available
            </th>
            <th scope="col" className="py-1 text-right">
              Alert at
            </th>
          </tr>
        </thead>
        <tbody>
          {variant.stores.map((st) => (
            <tr key={st.storeId} className="border-b border-line">
              <th scope="row" className="py-1 pr-2 font-semibold">
                {st.storeName}
              </th>
              <td className="py-1 pr-2 text-right">{st.quantity}</td>
              <td className="py-1 pr-2 text-right">{st.reserved}</td>
              <td className="py-1 pr-2 text-right">{st.available}</td>
              <td className="py-1 text-right">{st.lowStockThreshold}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Select label="Store" error={errors.storeId?.message} {...storeField}>
        {variant.stores.map((st) => (
          <option key={st.storeId} value={st.storeId}>
            {st.storeName}
          </option>
        ))}
      </Select>
      <Input
        label="Units on hand"
        inputMode="numeric"
        hint={`The count on ${store?.storeName ?? 'the'} shelf. The change is recorded with your reason.`}
        error={errors.quantity?.message}
        {...register('quantity')}
      />
      <Input
        label="Low-stock alert at"
        inputMode="numeric"
        error={errors.lowStockThreshold?.message}
        {...register('lowStockThreshold')}
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
