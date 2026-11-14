import { pointsForCents } from '@store/shared';
import { Link } from 'react-router-dom';

import { cn } from '../../lib/cn';
import { loginUrl } from '../../lib/safe-next';
import { TEST_IDS } from '../../lib/test-ids';
import { useAuthOptional } from '../auth/AuthProvider';

import { usePoints } from './queries';

// "Earn N points" on the product page and in the cart. The number comes from the same shared
// function the API uses to award points, at the shopper's current tier. A guest earns nothing, so
// they get a way to sign in instead of a number.
export function EarnPoints({
  merchandiseCents,
  returnTo,
  className,
}: {
  /** Merchandise after discounts, without shipping. */
  merchandiseCents: number;
  returnTo: string;
  className?: string;
}) {
  const { user, status } = useAuthOptional();
  const { data } = usePoints();
  if (status === 'loading') return null;
  if (!user) {
    return (
      <p className={cn('text-sm text-muted', className)} data-testid={TEST_IDS.earnPoints}>
        <Link to={loginUrl(returnTo)} className="font-semibold text-primary-strong underline">
          Sign in to earn
        </Link>{' '}
        loyalty points on this order.
      </p>
    );
  }
  const points = pointsForCents(Math.max(0, merchandiseCents), data?.tier.id ?? 'pup');
  if (points <= 0) return null;
  return (
    <p
      className={cn('text-sm font-semibold text-success', className)}
      data-testid={TEST_IDS.earnPoints}
    >
      Earn {points} {points === 1 ? 'point' : 'points'}
    </p>
  );
}
