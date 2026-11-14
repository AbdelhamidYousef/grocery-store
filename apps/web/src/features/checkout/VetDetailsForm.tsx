import type { FieldErrors, UseFormRegister } from 'react-hook-form';

import { Input } from '../../components/ui/Input';
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
  return (
    <fieldset
      data-testid={TEST_IDS.vetDetailsForm}
      className="flex flex-col gap-4 rounded-card border-2 border-pet bg-pet-soft p-4"
    >
      <legend className="px-1 font-display text-lg font-bold">Your vet</legend>
      <p className="text-sm">
        An item in your cart needs a vet&apos;s okay before we pack it. We will email you as soon as
        it is decided.{' '}
        <strong>Demo shop: this is not real medicine and no vet is contacted.</strong>
      </p>
      <Input
        label="Vet's name"
        error={errors?.vetName?.message}
        {...register('vetDetails.vetName')}
      />
      <Input label="Clinic" error={errors?.clinic?.message} {...register('vetDetails.clinic')} />
      <Input
        label="Vet's email"
        type="email"
        error={errors?.vetEmail?.message}
        {...register('vetDetails.vetEmail')}
      />
    </fieldset>
  );
}
