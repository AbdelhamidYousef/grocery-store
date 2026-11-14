import { useParams } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Skeleton } from '../components/ui/Skeleton';
import { useSharedWishlist } from '../features/wishlist/queries';
import { useT } from '../i18n';
import { TEST_IDS } from '../lib/test-ids';

import NotFoundPage from './NotFoundPage';
import { WishlistItemCard } from './WishlistPage';

// A read-only view of someone's list: noindex (it is not a page for search engines), first name
// only, no controls to change it. A revoked or unknown link is a plain 404.
export default function SharedWishlistPage() {
  const { token = '' } = useParams();
  const { t } = useT();
  const { data, isPending, isError } = useSharedWishlist(token);
  if (isError) return <NotFoundPage />;
  return (
    <Container className="py-8" data-testid={TEST_IDS.pageSharedWishlist}>
      <Seo title={t('loyalty.wishlist.sharedTitle')} noindex />
      {isPending && <Skeleton className="h-32 w-full rounded-card" />}
      {data && (
        <>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {t('loyalty.wishlist.ownerTitle', { name: data.ownerFirstName })}
          </h1>
          {data.items.length === 0 ? (
            <p className="mt-4 text-muted">{t('loyalty.wishlist.sharedEmpty')}</p>
          ) : (
            <ul className="mt-5 grid gap-3 md:grid-cols-2">
              {data.items.map((item) => (
                <WishlistItemCard key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </Container>
  );
}
