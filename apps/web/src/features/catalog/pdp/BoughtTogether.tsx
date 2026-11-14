import type { RecommendationItem, Variant } from '@store/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { useT } from '../../../i18n';
import { useFormat } from '../../../i18n/format';
import { useBulkAdd } from '../../cart/queries';
import { useRecommendations } from '../queries';

// What a suggestion costs the shopper right now: a running sale counts, a member price does not
// (the block is built from a cacheable answer and must read the same for everyone).
const priceOf = (v: { priceCents: number; saleCents: number | null }) =>
  v.saleCents ?? v.priceCents;

// "Frequently bought together": the page's own item (always in, if it can be bought) plus up to
// three suggestions with checkboxes, a live total, and one button that adds the chosen ones in a
// single all-or-nothing request. The total is an estimate before discounts; the cart prices it.
export function BoughtTogether({
  productSlug,
  productName,
  variant,
}: {
  productSlug: string;
  productName: string;
  variant: Variant | undefined;
}) {
  const { t, tn, tm } = useT();
  const fmt = useFormat();
  const { data } = useRecommendations(productSlug);
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [problems, setProblems] = useState<string[]>([]);
  const bulk = useBulkAdd();

  const items = data?.boughtTogether ?? [];
  if (items.length === 0 || !variant) return null;

  const chosen = items.filter((i) => !unchecked.has(i.card.id));
  const ownIn = variant.available && !variant.isTrial;
  const lines = [
    ...(ownIn
      ? [
          {
            variantId: variant.id,
            quantity: 1,
            name: productName,
            sku: variant.sku,
            priceCents: variant.sale?.priceCents ?? variant.priceCents,
          },
        ]
      : []),
    ...chosen.map((i) => ({
      variantId: i.variant.id,
      quantity: 1,
      name: i.card.name,
      sku: i.variant.sku,
      priceCents: priceOf(i.variant),
    })),
  ];
  const totalCents = lines.reduce((sum, l) => sum + l.priceCents, 0);
  const currency = variant.currency;

  const toggle = (item: RecommendationItem) =>
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(item.card.id)) next.delete(item.card.id);
      else next.add(item.card.id);
      return next;
    });

  const submit = async () => {
    setProblems([]);
    const failures = await bulk.addAll(lines);
    if (failures.length === 0) return;
    const names = new Map(lines.map((l) => [l.variantId, l.name]));
    setProblems(
      failures.map((f) =>
        t('pdp.bought.problem', {
          name: names.get(f.variantId) ?? t('pdp.bought.anItem'),
          message: tm(f.message),
        }),
      ),
    );
  };

  return (
    <section
      aria-labelledby="bought-together-heading"
      data-testid="bought-together"
      className="mt-10 rounded-card border-2 border-line p-4 sm:p-6"
    >
      <h2 id="bought-together-heading" className="font-display text-2xl font-bold">
        {t('pdp.bought.heading')}
      </h2>
      <ul className="mt-4 flex flex-col gap-1">
        <li className="flex min-h-11 items-center justify-between gap-3">
          <span className="min-w-0 break-words">
            <span className="font-semibold">{t('pdp.bought.thisItem')}</span>{' '}
            {variant.name
              ? t('pdp.bought.withVariant', { name: productName, variant: variant.name })
              : productName}
            {!ownIn && <span className="text-danger"> {t('pdp.bought.notAvailable')}</span>}
          </span>
          {ownIn && (
            <span className="shrink-0 font-semibold">
              {fmt.money(variant.sale?.priceCents ?? variant.priceCents, currency)}
            </span>
          )}
        </li>
        {items.map((item) => (
          <li key={item.card.id} className="flex items-center justify-between gap-3">
            <Checkbox
              label={t('pdp.bought.withVariant', {
                name: item.card.name,
                variant: item.variant.name,
              })}
              checked={!unchecked.has(item.card.id)}
              onChange={() => toggle(item)}
              data-testid="bought-together-option"
            />
            <span className="flex shrink-0 items-center gap-3">
              <Link
                to={`/products/${item.card.slug}`}
                aria-label={t('pdp.bought.viewLabel', { name: item.card.name })}
                className="text-sm font-semibold text-primary-strong underline"
              >
                {t('pdp.bought.view')}
              </Link>
              <span className="font-semibold">{fmt.money(priceOf(item.variant), currency)}</span>
            </span>
          </li>
        ))}
      </ul>
      {problems.length > 0 && (
        <ul role="alert" data-testid="bought-together-errors" className="mt-3 text-danger">
          {problems.map((p) => (
            <li key={p} className="font-semibold">
              {p}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <p className="text-lg" data-testid="bought-together-total">
          {t('pdp.bought.total')}{' '}
          <span className="font-bold">{fmt.money(totalCents, currency)}</span>
          <span className="block text-sm text-muted">{t('pdp.bought.beforeDiscounts')}</span>
        </p>
        <Button
          type="button"
          loading={bulk.pending}
          disabled={lines.length === 0}
          data-testid="bought-together-add"
          onClick={() => void submit()}
        >
          {lines.length > 0 ? tn('pdp.bought.addAllCount', lines.length) : t('pdp.bought.addAll')}
        </Button>
      </div>
    </section>
  );
}
