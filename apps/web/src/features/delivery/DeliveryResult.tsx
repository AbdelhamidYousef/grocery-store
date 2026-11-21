import { Link } from 'react-router-dom';

import { useT } from '../../i18n';

import { useDelivery } from './DeliveryContext';
import { useDeliveryAreas } from './queries';

// What the chosen postcode means: "We deliver to 10115 · Mitte", or "We don't deliver to 12345 yet"
// with the areas we do cover. Renders nothing before a postcode is chosen.
export function DeliveryResult({ testId = 'postcode-saved' }: { testId?: string }) {
  const { t } = useT();
  const { postcode, served, area, store, status } = useDelivery();
  const unserved = status === 'ready' && !served;
  const { data: areas } = useDeliveryAreas();
  if (!postcode) return null;

  if (status === 'loading') {
    return (
      <p role="status" data-testid={testId} className="mt-3 font-semibold text-ink">
        {t('delivery.result.checking', { postcode })}
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p role="alert" data-testid={testId} className="mt-3 font-semibold text-danger">
        {t('delivery.result.error')}
      </p>
    );
  }
  if (served && area) {
    return (
      <div role="status" data-testid={testId} className="mt-3">
        <p className="font-semibold text-ink">
          {t('delivery.result.served', { postcode, area: area.name })}
        </p>
        {store && (
          <p className="text-sm text-muted">
            {t('delivery.result.packedAt', { store: store.name })}
          </p>
        )}
      </div>
    );
  }
  if (!unserved) return null;
  return (
    <div role="status" data-testid={testId} className="mt-3">
      <p className="font-semibold text-danger">{t('delivery.result.notServed', { postcode })}</p>
      {areas && (
        <>
          <p className="mt-1 text-sm">{t('delivery.result.cover')}</p>
          <ul className="list-disc pl-5 text-sm" data-testid="delivery-areas-list">
            {areas.map((a) => (
              <li key={a.slug}>{a.name}</li>
            ))}
          </ul>
        </>
      )}
      <Link
        to="/delivery"
        className="mt-1 inline-block text-sm font-semibold text-primary-strong underline"
      >
        {t('delivery.result.allAreas')}
      </Link>
    </div>
  );
}
