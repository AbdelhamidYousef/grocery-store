import type { Variant } from '@store/shared';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';

import { formatBestBefore } from './format';

// "Best before at least 25 Nov": the oldest date the store could send. Food only: for anything
// that does not expire the API sends no date and nothing shows.
export function BestBeforeNote({ variant }: { variant: Pick<Variant, 'bestBefore'> }) {
  const { t } = useT();
  const { locale } = useFormat();
  if (!variant.bestBefore) return null;
  return (
    <p className="text-sm text-muted" data-testid={TEST_IDS.bestBefore}>
      {t('expiry.bestBefore', { date: formatBestBefore(variant.bestBefore, locale) })}
    </p>
  );
}

// The short-dated offer next to the normal one: how many packs, until when, the price. The shopper
// picks it with its own button, so the cart line carries `shortDated`.
export function ShortDatedOffer({
  variant,
  name,
  pending,
  onAdd,
}: {
  variant: Pick<Variant, 'shortDated' | 'currency'>;
  name: string;
  pending: boolean;
  onAdd: () => void;
}) {
  const { t, tn } = useT();
  const fmt = useFormat();
  const offer = variant.shortDated;
  if (!offer) return null;
  return (
    <div
      data-testid={TEST_IDS.shortDatedOffer}
      className="flex flex-col gap-2 rounded-card border border-line bg-primary-soft p-4"
    >
      <p className="flex flex-wrap items-center gap-2 font-display font-bold">
        <Badge tone="primary">{t('expiry.short.title')}</Badge>
        {t('expiry.short.price', { price: fmt.money(offer.priceCents, variant.currency) })}
      </p>
      <p className="font-semibold">
        {tn('expiry.short.offer', offer.units, {
          date: formatBestBefore(offer.bestBefore, fmt.locale),
          percent: offer.percentOff,
        })}
      </p>
      <p className="text-sm text-muted">{t('expiry.short.why')}</p>
      <Button
        variant="secondary"
        loading={pending}
        aria-label={t('expiry.short.addAria', { name })}
        data-testid={TEST_IDS.addShortDated}
        onClick={onAdd}
        className="w-fit"
      >
        {t('expiry.short.add')}
      </Button>
    </div>
  );
}
