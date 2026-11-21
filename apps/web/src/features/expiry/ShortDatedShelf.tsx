import { SHORT_DATED_PERCENT_OFF } from '@store/shared';

import { useT } from '../../i18n';
import { ProductRail } from '../catalog/pdp/ProductRail';

import { useShortDated } from './queries';

// The "Short-dated deals" shelf of the shopper's store (home page and product lists). Nothing
// renders while loading, on an error, or when the store has no such packs: an empty shelf is noise.
export function ShortDatedShelf() {
  const { t } = useT();
  const { data } = useShortDated();
  if (!data || data.length === 0) return null;
  return (
    <section aria-labelledby="short-dated-heading" data-testid="short-dated-shelf">
      <h2 id="short-dated-heading" className="font-display text-2xl font-bold">
        {t('expiry.shelf.title')}
      </h2>
      <p className="mb-4 max-w-prose text-muted">
        {t('expiry.shelf.lead', { percent: SHORT_DATED_PERCENT_OFF })}
      </p>
      <ProductRail cards={data} label={t('expiry.shelf.label')} testId="short-dated-list" />
    </section>
  );
}
