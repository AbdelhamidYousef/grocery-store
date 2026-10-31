import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateProfileSchema, type UpdateProfileInput } from '@store/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { FormAlert } from '../auth/AuthCard';
import { useAuth } from '../auth/AuthProvider';
import { applyFieldErrors, formErrorMessage } from '../auth/form-errors';

import { useUpdateProfile } from './queries';

export function ProfileSection() {
  const { user } = useAuth();
  const toast = useToast();
  const update = useUpdateProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' },
  });

  const submit = handleSubmit((values) => {
    setFormError(null);
    update.mutate(values, {
      onSuccess: (saved) => {
        // The trimmed values the server stored become the new baseline (clears "dirty").
        reset({ firstName: saved.firstName, lastName: saved.lastName });
        toast.show('Profile saved', 'success');
      },
      onError: (error) => {
        if (!applyFieldErrors(error, setError, ['firstName', 'lastName'])) {
          setFormError(formErrorMessage(error));
        }
      },
    });
  });

  return (
    <section aria-labelledby="profile-heading" data-testid="account-profile">
      <Seo title="My account" noindex />
      <h2 id="profile-heading" className="font-display text-2xl font-bold">
        Profile
      </h2>
      <form
        onSubmit={(e) => void submit(e)}
        noValidate
        className="mt-4 flex max-w-lg flex-col gap-4"
      >
        <FormAlert message={formError} />
        <Input
          label="Email"
          value={user?.email ?? ''}
          readOnly
          hint="Your email is your sign-in name and cannot be changed here."
          autoComplete="email"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            autoComplete="given-name"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Last name"
            autoComplete="family-name"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
        <Button
          type="submit"
          loading={update.isPending}
          disabled={!isDirty}
          className="self-start"
          data-testid="profile-save"
        >
          Save changes
        </Button>
      </form>
    </section>
  );
}
