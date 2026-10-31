import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Container } from '../../components/layout/Container';
import { Seo } from '../../components/Seo';
import { loginUrl } from '../../lib/safe-next';
import RouteFallback from '../../pages/RouteFallback';

import { useAuth } from './AuthProvider';

// Route wrappers used as layout routes (`element: <RequireAuth />` with children): they render the
// matched child through <Outlet />. These guards only decide what the visitor SEES; the API
// re-checks the session and the role on every request, so a bypassed guard shows an empty shell
// and nothing else.
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <RouteFallback />;
  if (status === 'anonymous') {
    return <Navigate to={loginUrl(location.pathname + location.search)} replace />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <RouteFallback />;
  if (status === 'anonymous') {
    return <Navigate to={loginUrl(location.pathname + location.search)} replace />;
  }
  if (user?.role !== 'admin') {
    return (
      <Container className="py-12 text-center" data-testid="page-forbidden">
        <Seo title="Not allowed" noindex />
        <h1 className="text-3xl font-bold">You do not have access to this page</h1>
        <p className="mt-3 text-muted">This area is for shop admins only.</p>
      </Container>
    );
  }
  return <Outlet />;
}
