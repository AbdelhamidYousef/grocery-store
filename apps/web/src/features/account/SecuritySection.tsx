import { zodResolver } from '@hookform/resolvers/zod';
import { ChangePasswordSchema, PASSWORD_MIN_LENGTH, type ChangePasswordInput } from '@store/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { useToast } from '../../components/ui/Toast';
import { FormAlert } from '../auth/AuthCard';
import { applyFieldErrors, formErrorMessage } from '../auth/form-errors';

import { useChangePassword } from './queries';

export function SecuritySection() {
  const toast = useToast();
  const change = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const submit = handleSubmit((values) => {
    setFormError(null);
    change.mutate(values, {
      onSuccess: () => {
        reset();
        toast.show('Password changed. Your other devices were signed out.', 'success');
      },
      onError: (error) => {
        // A wrong current password arrives as 400 fieldErrors.currentPassword, so it lands on
        // that field instead of looking like an expired session.
        if (!applyFieldErrors(error, setError, ['currentPassword', 'newPassword'])) {
          setFormError(formErrorMessage(error));
        }
      },
    });
  });

  return (
    <section aria-labelledby="security-heading" data-testid="account-security">
      <Seo title="Security" noindex />
      <h2 id="security-heading" className="font-display text-2xl font-bold">
        Security
      </h2>
      <p className="mt-1 text-muted">
        Changing your password signs you out everywhere else, in case someone else had it.
      </p>
      <form
        onSubmit={(e) => void submit(e)}
        noValidate
        className="mt-4 flex max-w-lg flex-col gap-4"
      >
        <FormAlert message={formError} />
        <PasswordInput
          label="Current password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <Button
          type="submit"
          loading={change.isPending}
          className="self-start"
          data-testid="password-save"
        >
          Change password
        </Button>
      </form>
    </section>
  );
}
