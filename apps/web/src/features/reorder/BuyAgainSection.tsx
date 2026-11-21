import { Link } from 'react-router-dom';

import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';
import { useAddToCartAction } from '../cart/queries';

import { useBuyAgain } from './queries';

function BuyAgainRow({ item }: { item: import('@store/shared').BuyAgainItem }) {
  const { t, tn } = useT();
  const fmt = useFormat();
  const cart = useAddToCartAction({ id: item.productId, name: item.name });
  return (
    <li
      data-testid={TEST_IDS.buyAgainRow}
      className="flex min-w-0 gap-3 rounded-card border border-line bg-surface p-3"
    >
      <Link
        to={`/products/${item.slug}`}
        className="h-20 w-20 shrink-0 overflow-hidden rounded-control bg-dept-soft"
      >
        {item.image && (
          <img
            src={item.image.url}
            alt={item.image.alt}
            width={item.image.width}
            height={item.image.height}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to={`/products/${item.slug}`}
          className="line-clamp-2 break-words font-semibold hover:underline"
        >
          {item.name}
        </Link>
        <p className="truncate text-sm text-muted">
          {t('account.reorder.priceToday', {
            variant: item.variantName,
            price: fmt.money(item.priceCents, item.currency),
          })}
          {item.timesBought > 1 && <> &middot; {tn('account.reorder.bought', item.timesBought)}</>}
        </p>
        <div className="mt-auto">
          <Button
            size="sm"
            disabled={!item.available}
            loading={cart.pending}
            onClick={() =>
              cart.add({ id: item.variantId, sku: item.slug, priceCents: item.priceCents }, 1)
            }
          >
            {item.available ? t('account.reorder.add') : t('account.reorder.soldOut')}
          </Button>
        </div>
      </div>
    </li>
  );
}

// The account block: what this customer has bought before, one tap from the cart.
export function BuyAgainSection() {
  const { data, isPending, error } = useBuyAgain();
  const { t } = useT();
  return (
    <section aria-labelledby="buy-again-heading" data-testid={TEST_IDS.pageBuyAgain}>
      <Seo title={t('account.reorder.heading')} noindex />
      <h2 id="buy-again-heading" className="font-display text-2xl font-bold">
        {t('account.reorder.heading')}
      </h2>
      <p className="mt-1 text-muted">{t('account.reorder.intro')}</p>
      {isPending && <Skeleton className="mt-4 h-24 w-full rounded-card" />}
      {error && <p className="mt-4 text-danger">{t('account.reorder.loadError')}</p>}
      {data && data.length === 0 && (
        <p className="mt-4">
          {t('account.reorder.empty')}{' '}
          <Link to="/" className="font-semibold text-primary-strong underline">
            {t('account.reorder.startShopping')}
          </Link>
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {data.map((item) => (
            <BuyAgainRow key={item.variantId} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
