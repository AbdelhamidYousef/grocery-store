import type { ReactNode } from 'react';

import { Container } from '../../components/layout/Container';

// The centred card shared by sign-in and registration.
export function AuthCard({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Container className="flex justify-center py-8 sm:py-12" data-testid={testId}>
      <div className="w-full max-w-md rounded-card border-2 border-line bg-surface p-6 shadow-card sm:p-8">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        {children}
      </div>
    </Container>
  );
}

// A form-level error. role=alert makes a screen reader announce it as soon as it appears.
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      data-testid="form-error"
      className="mt-4 rounded-control border-2 border-danger bg-danger-soft p-3 font-semibold text-danger"
    >
      {message}
    </p>
  );
}
