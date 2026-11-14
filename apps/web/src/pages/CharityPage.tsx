import { Link } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../features/auth/AuthProvider';
import { useCharityTotal } from '../features/loyalty/queries';
import { useT } from '../i18n';
import { useFormat } from '../i18n/format';
import { TEST_IDS } from '../lib/test-ids';

export default function CharityPage() {
  const { data, isPending, error } = useCharityTotal();
  const { user } = useAuth();
  const { t, tn } = useT();
  const fmt = useFormat();
  return (
    <Container className="max-w-3xl py-10" data-testid="page-charity">
      <Seo
        title={t('loyalty.charity.seoTitle')}
        description={t('loyalty.charity.seoDescription')}
        canonical="/charity"
      />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">
        {data?.charity.name ?? 'Whisker Hollow Rescue'}
      </h1>
      <p
        role="note"
        className="mt-3 rounded-control border-2 border-line bg-pet-soft p-3 font-semibold"
      >
        {t('loyalty.charity.note')}
      </p>
      {isPending && <Skeleton className="mt-6 h-24 w-full rounded-card" />}
      {error && <p className="mt-6 text-danger">{t('loyalty.charity.error')}</p>}
      {data && (
        <>
          <p className="mt-6 max-w-prose text-lg">{data.charity.description}</p>
          <div className="mt-6 rounded-card bg-pet-soft p-5">
            <p className="text-sm text-muted">{t('loyalty.charity.given')}</p>
            <p className="font-display text-4xl font-bold" data-testid={TEST_IDS.charityAmount}>
              {fmt.money(data.totalCents, 'EUR')}
            </p>
            <p className="text-sm text-muted">{tn('loyalty.charity.donations', data.donations)}</p>
          </div>
        </>
      )}
      <h2 className="mt-8 font-display text-2xl font-bold">{t('loyalty.charity.waysTitle')}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>
          <strong>{t('loyalty.charity.checkoutLabel')}</strong> {t('loyalty.charity.checkoutText')}
        </li>
        <li>
          <strong>{t('loyalty.charity.pointsLabel')}</strong> {t('loyalty.charity.pointsText')}{' '}
          {user ? (
            <>
              {t('loyalty.charity.pointsOnYour')}{' '}
              <Link to="/account/rewards" className="font-semibold text-primary-strong underline">
                {t('loyalty.charity.rewardsPage')}
              </Link>
              .
            </>
          ) : (
            <>
              {t('loyalty.charity.pointsOnceYou')}{' '}
              <Link to="/login?next=%2Faccount%2Frewards" className="font-semibold underline">
                {t('loyalty.charity.signIn')}
              </Link>
              .
            </>
          )}
        </li>
      </ul>
      <p className="mt-4 text-sm text-muted">{t('loyalty.charity.roundUpNote')}</p>
    </Container>
  );
}
