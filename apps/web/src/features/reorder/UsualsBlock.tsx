import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';
import { useAddToCartAction } from '../cart/queries';

import { useUsuals } from './queries';
import { ReorderButton } from './ReorderButton';

function UsualRow({ item }: { item: import('@store/shared').BuyAgainItem }) {
  const { t, tn } = useT();
  const fmt = useFormat();
  const cart = useAddToCartAction({ id: item.productId, name: item.name });
  return (
    <li
      data-testid={TEST_IDS.usualsRow}
      className="flex min-w-0 gap-3 rounded-card border border-line bg-surface p-3"
    >
      <Link
        to={`/products/${item.slug}`}
        className="h-16 w-16 shrink-0 overflow-hidden rounded-control bg-dept-soft"
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
          })}{' '}
          &middot; {tn('usuals.inOrders', item.timesBought)}
        </p>
        <div className="mt-auto">
          <Button
            size="sm"
            loading={cart.pending}
            onClick={() =>
              cart.add({ id: item.variantId, sku: item.slug, priceCents: item.priceCents }, 1)
            }
          >
            {t('account.reorder.add')}
          </Button>
        </div>
      </div>
    </li>
  );
}

// "Your usuals": what the signed-in shopper keeps buying (in at least 2 of the last 10 orders, in
// stock at their store) and one button that repeats the last basket. Nothing renders for a visitor,
// while it loads, when there is no order yet, or when the request fails: a shortcut that is not
// ready should not take space on the page.
export function UsualsBlock({ headingLevel = 'h2' }: { headingLevel?: 'h2' | 'h3' }) {
  const { t } = useT();
  const { data } = useUsuals();
  if (!data || !data.lastOrder) return null;
  const Heading = headingLevel;
  return (
    <section aria-labelledby="usuals-heading" data-testid={TEST_IDS.usuals}>
      <Heading id="usuals-heading" className="font-display text-2xl font-bold sm:text-3xl">
        {t('shell.home.usuals.title')}
      </Heading>
      <p className="mt-1 text-muted">{t('usuals.intro')}</p>
      {data.items.length > 0 ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item) => (
            <UsualRow key={item.variantId} item={item} />
          ))}
        </ul>
      ) : (
        <p className="mt-3">{t('usuals.none')}</p>
      )}
      <ReorderButton orderNumber={data.lastOrder.number} label={t('usuals.reorderLast')} />
    </section>
  );
}
