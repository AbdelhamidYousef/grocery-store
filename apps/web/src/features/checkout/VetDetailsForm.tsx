import type { FieldErrors, UseFormRegister } from 'react-hook-form';

import { Input } from '../../components/ui/Input';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';

import type { DetailsInput } from './details';

// Shown in the first checkout step when the cart holds an item that needs a vet's approval. The
// fields belong to the same form (one validation, one submit), and the schema that checks them is
// the API's own. This is a DEMO of the flow: nothing is sent to the vet and no medicine is sold.
export function VetDetailsForm({
  register,
  errors,
}: {
  register: UseFormRegister<DetailsInput>;
  errors: FieldErrors<NonNullable<DetailsInput['vetDetails']>> | undefined;
}) {
  const { t } = useT();
  return (
    <fieldset
      data-testid={TEST_IDS.vetDetailsForm}
      className="flex flex-col gap-4 rounded-card border-2 border-pet bg-pet-soft p-4"
    >
      <legend className="px-1 font-display text-lg font-bold">{t('checkout.vet.legend')}</legend>
      <p className="text-sm">
        {t('checkout.vet.intro')} <strong>{t('checkout.vet.demo')}</strong>
      </p>
      <Input
        label={t('checkout.vet.name')}
        error={errors?.vetName?.message}
        {...register('vetDetails.vetName')}
      />
      <Input
        label={t('checkout.vet.clinic')}
        error={errors?.clinic?.message}
        {...register('vetDetails.clinic')}
      />
      <Input
        label={t('checkout.vet.email')}
        type="email"
        error={errors?.vetEmail?.message}
        {...register('vetDetails.vetEmail')}
      />
    </fieldset>
  );
}
