import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { keys } from '../../lib/query-client';
import { loginUrl } from '../../lib/safe-next';
import { TEST_IDS } from '../../lib/test-ids';

import { useAuth } from './AuthProvider';

// Explains an expired session where the shopper lands next. `signInNext` adds a sign-in link for
// pages that keep working without an account (checkout); on the login page the form is right
// there, so no link is needed. Hidden once someone is signed in again.
export function SessionExpiredNotice({ signInNext }: { signInNext?: string }) {
  const { user } = useAuth();
  const { data: expired } = useQuery({
    queryKey: keys.sessionExpired,
    // Written by handleUnauthenticated; there is nothing to fetch.
    queryFn: () => false,
    enabled: false,
    staleTime: Infinity,
  });
  if (!expired || user) return null;
  return (
    <p
      role="status"
      data-testid={TEST_IDS.sessionExpiredNotice}
      className="mt-4 rounded-control border-2 border-primary bg-primary-soft p-3 font-semibold text-primary-strong"
    >
      Your session expired, so you have been signed out. Your cart is still here.
      {signInNext && (
        <>
          {' '}
          <Link to={loginUrl(signInNext)} className="underline">
            Sign in again
          </Link>{' '}
          to use your saved details, or just carry on as a guest.
        </>
      )}
    </p>
  );
}
