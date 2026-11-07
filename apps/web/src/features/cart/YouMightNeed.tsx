import { formatMoney } from '@store/shared';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { useRecommendations } from '../catalog/queries';

import { useAddToCartAction, useCart } from './queries';

const MAX_SHOWN = 2;

// The drawer's short "You might also need": suggestions for the item added last, minus anything
// already in the cart. Items the API can add in one click get an Add button; the rest link to
// their page. Two rows at most, so the pinned bar of the drawer stays short.
export function YouMightNeed({ onNavigate }: { onNavigate: () => void }) {
  const { data: cart } = useCart();
  const newest = cart?.items.at(-1);
  const { data } = useRecommendations(newest?.productSlug);
  const add = useAddToCartAction({ id: '', name: '' });
  if (!cart || !newest || !data) return null;

  const inCart = new Set(cart.items.map((i) => i.productId));
  const direct = data.boughtTogether
    .filter((i) => !inCart.has(i.card.id))
    .map((i) => ({ kind: 'add' as const, item: i }));
  const links = data.related
    .filter((c) => !inCart.has(c.id) && !data.boughtTogether.some((i) => i.card.id === c.id))
    .map((card) => ({ kind: 'link' as const, card }));
  const shown = [...direct, ...links].slice(0, MAX_SHOWN);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="might-need-heading" data-testid="you-might-need">
      <h3 id="might-need-heading" className="font-display text-lg font-bold">
        You might also need
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {shown.map((entry) =>
          entry.kind === 'add' ? (
            <li key={entry.item.card.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 break-words">
                <Link
                  to={`/products/${entry.item.card.slug}`}
                  onClick={onNavigate}
                  className="font-semibold underline"
                >
                  {entry.item.card.name}
                </Link>
                <span className="block text-sm text-muted">
                  {formatMoney(
                    entry.item.variant.saleCents ?? entry.item.variant.priceCents,
                    entry.item.variant.currency,
                  )}
                </span>
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={`Add ${entry.item.card.name}`}
                onClick={() =>
                  add.add(
                    {
                      id: entry.item.variant.id,
                      sku: entry.item.variant.sku,
                      priceCents: entry.item.variant.priceCents,
                    },
                    1,
                  )
                }
              >
                Add
              </Button>
            </li>
          ) : (
            <li key={entry.card.id}>
              <Link
                to={`/products/${entry.card.slug}`}
                onClick={onNavigate}
                className="flex min-h-11 items-center font-semibold underline"
              >
                {entry.card.name}
              </Link>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
