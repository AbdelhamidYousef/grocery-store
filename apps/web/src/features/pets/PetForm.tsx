import { zodResolver } from '@hookform/resolvers/zod';
import {
  PET_SIZES,
  PET_VALUES,
  PetInputSchema,
  isoToday,
  type PetInput,
  type PetProfile,
} from '@store/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { FormAlert } from '../auth/AuthCard';
import { applyFieldErrors, formErrorMessage } from '../auth/form-errors';

import { speciesLabel } from './age';

const FIELDS = ['name', 'species', 'birthday', 'approxAgeMonths', 'size'] as const;
const SIZE_LABEL = { xs: 'Extra small', s: 'Small', m: 'Medium', l: 'Large', xl: 'Extra large' };

// One form for "add" and "edit" (edit when `pet` is given). The birthday box is the better
// answer; "age in months" is for the shopper who only knows roughly, and the birthday wins when
// both are filled in.
export function PetForm({
  pet,
  onSave,
  onCancel,
}: {
  pet?: PetProfile;
  onSave: (input: PetInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PetInput>({
    resolver: zodResolver(PetInputSchema),
    defaultValues: {
      name: pet?.name ?? '',
      species: pet?.species ?? 'dog',
      birthday: pet?.birthday ?? '',
      approxAgeMonths: pet?.approxAgeMonths ?? null,
      size: pet?.size ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    setPending(true);
    try {
      await onSave(values);
    } catch (error) {
      if (!applyFieldErrors(error, setError, FIELDS)) setFormError(formErrorMessage(error));
    } finally {
      setPending(false);
    }
  });

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      data-testid="pet-form"
      className="flex flex-col gap-4"
    >
      <FormAlert message={formError} />
      <Input label="Name" autoComplete="off" error={errors.name?.message} {...register('name')} />
      <Select label="Kind of pet" error={errors.species?.message} {...register('species')}>
        {PET_VALUES.map((s) => (
          <option key={s} value={s}>
            {speciesLabel(s)}
          </option>
        ))}
      </Select>
      <Input
        label="Birthday (optional)"
        type="date"
        max={isoToday(new Date())}
        error={errors.birthday?.message}
        {...register('birthday')}
      />
      <Input
        label="Age in months (optional)"
        hint="If you do not know the birthday. We use the birthday when both are given."
        type="number"
        inputMode="numeric"
        min={0}
        max={600}
        error={errors.approxAgeMonths?.message}
        {...register('approxAgeMonths', {
          setValueAs: (v: unknown) => (v === '' || v == null ? null : Number(v)),
        })}
      />
      <Select label="Size (optional)" error={errors.size?.message} {...register('size')}>
        <option value="">Not sure</option>
        {PET_SIZES.map((s) => (
          <option key={s} value={s}>
            {SIZE_LABEL[s]}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} data-testid="pet-save">
          {pet ? 'Save pet' : 'Add pet'}
        </Button>
      </div>
    </form>
  );
}
