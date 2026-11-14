import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useT } from '../../i18n';
import { keys } from '../../lib/query-client';
import { loginUrl } from '../../lib/safe-next';
import { TEST_IDS } from '../../lib/test-ids';

import { useAuth } from './AuthProvider';

// Explains an expired session where the shopper lands next. `signInNext` adds a sign-in link for
// pages that keep working without an account (checkout); on the login page the form is right
// there, so no link is needed. Hidden once someone is signed in again.
export function SessionExpiredNotice({ signInNext }: { signInNext?: string }) {
  const { user } = useAuth();
  const { t } = useT();
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
      {t('auth.expired.message')}
      {signInNext && (
        <>
          {' '}
          <Link to={loginUrl(signInNext)} className="underline">
            {t('auth.expired.signInLink')}
          </Link>{' '}
          {t('auth.expired.rest')}
        </>
      )}
    </p>
  );
}
