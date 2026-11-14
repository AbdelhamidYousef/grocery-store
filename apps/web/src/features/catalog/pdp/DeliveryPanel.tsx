import { Link } from 'react-router-dom';

import { useT } from '../../../i18n';

// Shared policy copy for every product, plus this product's own note. The numbers (prices, free
// delivery threshold) live on the Shipping page and at checkout, so they cannot drift from here.
export function DeliveryPanel({ note }: { note: string | null }) {
  const { t } = useT();
  return (
    <div className="flex max-w-prose flex-col gap-4">
      {note && (
        <p
          data-testid="delivery-note"
          className="rounded-card border-2 border-pet bg-pet-soft p-3 font-semibold"
        >
          {note}
        </p>
      )}
      <section aria-labelledby="delivery-heading">
        <h3 id="delivery-heading" className="font-display text-xl font-bold">
          {t('pdp.delivery.heading')}
        </h3>
        <p className="mt-1">
          {t('pdp.delivery.shipIntro')}{' '}
          <Link to="/shipping" className="font-semibold text-primary-strong underline">
            {t('pdp.delivery.shipLink')}
          </Link>{' '}
          {t('pdp.delivery.shipOutro')}
        </p>
        <p className="mt-2 text-sm text-muted">{t('pdp.delivery.cutoffNote')}</p>
      </section>
      <section aria-labelledby="returns-heading">
        <h3 id="returns-heading" className="font-display text-xl font-bold">
          {t('pdp.delivery.returnsHeading')}
        </h3>
        <p className="mt-1">
          {t('pdp.delivery.returnsIntro')}{' '}
          <Link to="/returns" className="font-semibold text-primary-strong underline">
            {t('pdp.delivery.returnsLink')}
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
