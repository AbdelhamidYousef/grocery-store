import { zodResolver } from '@hookform/resolvers/zod';
import { AddressInputSchema, type Address, type AddressInput } from '@store/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { countryOptions } from '../../lib/countries';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';
import { applyFieldErrors, formErrorMessage } from '../auth/form-errors';

import { useCreateAddress, useUpdateAddress } from './queries';

const FIELDS = [
  'label',
  'fullName',
  'line1',
  'line2',
  'city',
  'region',
  'postalCode',
  'country',
  'phone',
] as const;

function defaultsFor(address?: Address): AddressInput {
  return {
    label: address?.label ?? '',
    fullName: address?.fullName ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    region: address?.region ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? 'DE',
    phone: address?.phone ?? '',
    isDefaultShipping: address?.isDefaultShipping ?? false,
    isDefaultBilling: address?.isDefaultBilling ?? false,
  };
}

// One form for "add" and "edit" (edit when `address` is given). The default checkboxes can only
// turn a default ON: moving the default is done by making another address the default, which the
// server handles atomically, so an unchecked box is simply left out of the request.
export function AddressForm({
  address,
  onDone,
  onCancel,
}: {
  address?: Address;
  onDone: () => void;
  onCancel: () => void;
}) {
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AddressInput>({
    resolver: zodResolver(AddressInputSchema),
    defaultValues: defaultsFor(address),
  });
  const pending = create.isPending || update.isPending;

  const submit = handleSubmit((values) => {
    setFormError(null);
    const { isDefaultShipping, isDefaultBilling, ...rest } = values;
    const input: AddressInput = {
      ...rest,
      ...(isDefaultShipping ? { isDefaultShipping: true } : {}),
      ...(isDefaultBilling ? { isDefaultBilling: true } : {}),
    };
    const options = {
      onSuccess: onDone,
      onError: (error: unknown) => {
        if (!applyFieldErrors(error, setError, FIELDS)) setFormError(formErrorMessage(error));
      },
    };
    if (address) update.mutate({ id: address.id, input }, options);
    else create.mutate(input, options);
  });

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      data-testid={TEST_IDS.addressForm}
      className="flex flex-col gap-4"
    >
      <FormAlert message={formError} />
      <Input
        label="Label (optional)"
        hint="For example Home or Work."
        error={errors.label?.message}
        {...register('label')}
      />
      <Input
        label="Full name"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register('fullName')}
      />
      <Input
        label="Address line 1"
        autoComplete="address-line1"
        error={errors.line1?.message}
        {...register('line1')}
      />
      <Input
        label="Address line 2 (optional)"
        autoComplete="address-line2"
        error={errors.line2?.message}
        {...register('line2')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Postal code"
          autoComplete="postal-code"
          error={errors.postalCode?.message}
          {...register('postalCode')}
        />
        <Input
          label="City"
          autoComplete="address-level2"
          error={errors.city?.message}
          {...register('city')}
        />
      </div>
      <Input
        label="Region (optional)"
        autoComplete="address-level1"
        error={errors.region?.message}
        {...register('region')}
      />
      <Select
        label="Country"
        autoComplete="country"
        error={errors.country?.message}
        {...register('country')}
      >
        {countryOptions(address?.country).map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Select>
      <Input
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <div>
        <Checkbox
          label="Use as my default shipping address"
          disabled={address?.isDefaultShipping === true}
          {...register('isDefaultShipping')}
        />
        <Checkbox
          label="Use as my default billing address"
          disabled={address?.isDefaultBilling === true}
          {...register('isDefaultBilling')}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} data-testid="address-save">
          {address ? 'Save address' : 'Add address'}
        </Button>
      </div>
    </form>
  );
}
