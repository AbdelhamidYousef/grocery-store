import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminVariant } from '@store/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import {
  emptyVariantForm,
  variantToCreate,
  variantToForm,
  variantToUpdate,
  VariantFormSchema,
  type VariantFormInput,
  type VariantFormOutput,
} from './product-form';
import { useAddAdminVariant, useUpdateAdminVariant } from './queries';
import { VariantFields } from './VariantFields';

function VariantForm({
  productId,
  variant,
  onDone,
}: {
  productId: string;
  variant: AdminVariant | undefined;
  onDone: () => void;
}) {
  const toast = useToast();
  const add = useAddAdminVariant(productId);
  const update = useUpdateAdminVariant();
  const [formError, setFormError] = useState<string | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<VariantFormInput, unknown, VariantFormOutput>({
    resolver: zodResolver(VariantFormSchema),
    defaultValues: variant ? variantToForm(variant) : emptyVariantForm,
  });

  const weighed = useWatch({ control, name: 'soldByWeight' }) === true;

  const submit = handleSubmit((values) => {
    setFormError(null);
    const options = {
      onSuccess: () => {
        toast.show(variant ? 'Variant saved' : 'Variant added', 'success');
        onDone();
      },
      onError: (error: unknown) => setFormError(adminErrorMessage(error)),
    };
    if (variant) {
      update.mutate(
        {
          id: variant.id,
          input: { ...variantToUpdate(values), ...(makeDefault && { isDefault: true }) },
        },
        options,
      );
    } else {
      add.mutate(variantToCreate(values, makeDefault), options);
    }
  });

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      data-testid={TEST_IDS.adminVariantForm}
      className="flex flex-col gap-4"
    >
      <FormAlert message={formError} />
      <VariantFields
        showStock={!variant}
        weighed={weighed}
        errors={{
          sku: errors.sku?.message,
          name: errors.name?.message,
          options: errors.options?.message,
          price: errors.price?.message,
          pricePerKg: errors.pricePerKg?.message,
          nominalGrams: errors.nominalGrams?.message,
          compareAtPrice: errors.compareAtPrice?.message,
          memberPrice: errors.memberPrice?.message,
          weight: errors.weight?.message,
          stock: errors.stock?.message,
          lowStockThreshold: errors.lowStockThreshold?.message,
          status: errors.status?.message,
        }}
        field={(name) => register(name)}
      />
      {/* The current default cannot be un-flagged (the API refuses): another variant takes over. */}
      {!variant?.isDefault && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
          <span>Opens first in the shop</span>
        </label>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={add.isPending || update.isPending}>
          {variant ? 'Save variant' : 'Add variant'}
        </Button>
      </div>
    </form>
  );
}

// `variant` undefined means "add a new one". The Dialog renders its children only while open, so
// the form starts from fresh defaults every time.
export function VariantDialog({
  productId,
  variant,
  open,
  onClose,
}: {
  productId: string;
  variant?: AdminVariant | undefined;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={variant ? `Edit ${variant.sku}` : 'Add a variant'}
      className="max-w-2xl"
    >
      <VariantForm productId={productId} variant={variant} onDone={onClose} />
    </Dialog>
  );
}
