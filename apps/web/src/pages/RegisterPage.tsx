import { Navigate, useSearchParams } from 'react-router-dom';

import { Seo } from '../components/Seo';
import { AuthCard } from '../features/auth/AuthCard';
import { useAuth } from '../features/auth/AuthProvider';
import { RegisterForm } from '../features/auth/RegisterForm';
import { safeNext } from '../lib/safe-next';

export default function RegisterPage() {
  const [params] = useSearchParams();
  const next = params.get('next');
  const { status } = useAuth();
  if (status === 'authenticated') return <Navigate to={safeNext(next, '/account')} replace />;
  return (
    <AuthCard title="Create account" testId="page-register">
      <Seo title="Create account" noindex />
      <RegisterForm next={next} />
    </AuthCard>
  );
}
