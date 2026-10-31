import { Navigate, useSearchParams } from 'react-router-dom';

import { Seo } from '../components/Seo';
import { AuthCard } from '../features/auth/AuthCard';
import { useAuth } from '../features/auth/AuthProvider';
import { LoginForm } from '../features/auth/LoginForm';
import { SessionExpiredNotice } from '../features/auth/SessionExpiredNotice';
import { safeNext } from '../lib/safe-next';

export default function LoginPage() {
  const [params] = useSearchParams();
  const next = params.get('next');
  const { status } = useAuth();
  // Someone who is already signed in has no use for the form.
  if (status === 'authenticated') return <Navigate to={safeNext(next)} replace />;
  return (
    <AuthCard title="Sign in" testId="page-login">
      <Seo title="Sign in" noindex />
      <SessionExpiredNotice />
      <LoginForm next={next} />
    </AuthCard>
  );
}
