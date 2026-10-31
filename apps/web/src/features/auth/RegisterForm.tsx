import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, RegisterSchema, type RegisterInput } from '@store/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { safeNext } from '../../lib/safe-next';

import { FormAlert } from './AuthCard';
import { applyFieldErrors, formErrorMessage } from './form-errors';
import { useRegister } from './hooks';

export function RegisterForm({ next }: { next: string | null }) {
  const navigate = useNavigate();
  const registerUser = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '' },
  });

  const target = safeNext(next, '/account');
  const submit = handleSubmit((values) => {
    setFormError(null);
    registerUser.mutate(values, {
      onSuccess: () => void navigate(target, { replace: true }),
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'CONFLICT') {
          // The API answers 409 for an email that exists; show it on the email field.
          setError(
            'email',
            { type: 'server', message: 'An account with this email already exists' },
            { shouldFocus: true },
          );
        } else if (
          !applyFieldErrors(error, setError, ['firstName', 'lastName', 'email', 'password'])
        ) {
          setFormError(formErrorMessage(error));
        }
      },
    });
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="mt-2 flex flex-col gap-4">
      <FormAlert message={formError} />
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
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordInput
        label="Password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few random words make a strong one.`}
        error={errors.password?.message}
        {...register('password')}
      />
      <Button
        type="submit"
        size="lg"
        loading={registerUser.isPending}
        data-testid="register-submit"
      >
        Create account
      </Button>
      <p className="text-center">
        Already have an account?{' '}
        <Link
          to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-semibold text-primary-strong underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
