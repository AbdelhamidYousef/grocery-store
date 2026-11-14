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
import { useT, type StringKey } from '../../i18n';
import { FormAlert } from '../auth/AuthCard';
import { applyFieldErrors, formErrorMessage } from '../auth/form-errors';

import { speciesName } from './age';

const FIELDS = ['name', 'species', 'birthday', 'approxAgeMonths', 'size'] as const;
const SIZE_LABEL: Record<(typeof PET_SIZES)[number], StringKey> = {
  xs: 'pets.size.xs',
  s: 'pets.size.s',
  m: 'pets.size.m',
  l: 'pets.size.l',
  xl: 'pets.size.xl',
};

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
  const { t, tm } = useT();
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
      if (!applyFieldErrors(error, setError, FIELDS)) setFormError(formErrorMessage(error, t, tm));
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
      <Input
        label={t('pets.form.name')}
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <Select label={t('pets.form.kind')} error={errors.species?.message} {...register('species')}>
        {PET_VALUES.map((s) => (
          <option key={s} value={s}>
            {speciesName(t, s)}
          </option>
        ))}
      </Select>
      <Input
        label={t('pets.form.birthday')}
        type="date"
        max={isoToday(new Date())}
        error={errors.birthday?.message}
        {...register('birthday')}
      />
      <Input
        label={t('pets.form.age')}
        hint={t('pets.form.ageHint')}
        type="number"
        inputMode="numeric"
        min={0}
        max={600}
        error={errors.approxAgeMonths?.message}
        {...register('approxAgeMonths', {
          setValueAs: (v: unknown) => (v === '' || v == null ? null : Number(v)),
        })}
      />
      <Select label={t('pets.form.size')} error={errors.size?.message} {...register('size')}>
        <option value="">{t('pets.form.sizeUnknown')}</option>
        {PET_SIZES.map((s) => (
          <option key={s} value={s}>
            {t(SIZE_LABEL[s])}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          {t('pets.form.cancel')}
        </Button>
        <Button type="submit" loading={pending} data-testid="pet-save">
          {pet ? t('pets.form.save') : t('pets.form.add')}
        </Button>
      </div>
    </form>
  );
}
