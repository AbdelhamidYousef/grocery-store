import { formatMoney } from '@store/shared';
import { Link } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../features/auth/AuthProvider';
import { useCharityTotal } from '../features/loyalty/queries';
import { TEST_IDS } from '../lib/test-ids';

export default function CharityPage() {
  const { data, isPending, error } = useCharityTotal();
  const { user } = useAuth();
  return (
    <Container className="max-w-3xl py-10" data-testid="page-charity">
      <Seo
        title="Our shelter"
        description="Whisker Hollow Rescue, the (fictional) shelter Pawsome supports. A demo: no money moves."
        canonical="/charity"
      />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">
        {data?.charity.name ?? 'Whisker Hollow Rescue'}
      </h1>
      <p
        role="note"
        className="mt-3 rounded-control border-2 border-line bg-pet-soft p-3 font-semibold"
      >
        This is a demo store and the shelter is made up. Donations here are counted, but no money
        moves anywhere.
      </p>
      {isPending && <Skeleton className="mt-6 h-24 w-full rounded-card" />}
      {error && <p className="mt-6 text-danger">We could not load the total just now.</p>}
      {data && (
        <>
          <p className="mt-6 max-w-prose text-lg">{data.charity.description}</p>
          <div className="mt-6 rounded-card bg-pet-soft p-5">
            <p className="text-sm text-muted">Given so far</p>
            <p className="font-display text-4xl font-bold" data-testid={TEST_IDS.charityAmount}>
              {formatMoney(data.totalCents, 'EUR')}
            </p>
            <p className="text-sm text-muted">
              from {data.donations} {data.donations === 1 ? 'donation' : 'donations'}
            </p>
          </div>
        </>
      )}
      <h2 className="mt-8 font-display text-2xl font-bold">Two ways to give</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>
          <strong>At checkout:</strong> tick &ldquo;round up&rdquo; and the total goes up to the
          next whole euro. The extra is its own line on your order, never discounted.
        </li>
        <li>
          <strong>With points:</strong> give any number of your loyalty points (1 point = 1 cent){' '}
          {user ? (
            <>
              on your{' '}
              <Link to="/account/rewards" className="font-semibold text-primary-strong underline">
                rewards page
              </Link>
              .
            </>
          ) : (
            <>
              once you{' '}
              <Link to="/login?next=%2Faccount%2Frewards" className="font-semibold underline">
                sign in
              </Link>
              .
            </>
          )}
        </li>
      </ul>
      <p className="mt-4 text-sm text-muted">
        A round-up is counted when the order is paid and taken back if the order is refunded.
      </p>
    </Container>
  );
}
