import { BASKET_RULES } from '@store/shared';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Skeleton } from '../components/ui/Skeleton';
import { useDelivery } from '../features/delivery/DeliveryContext';
import { DeliveryResult } from '../features/delivery/DeliveryResult';
import { PostcodeForm } from '../features/delivery/PostcodeForm';
import { useDeliveryAreas } from '../features/delivery/queries';
import { useT } from '../i18n';
import { useFormat } from '../i18n/format';

// The four areas, the store that packs each one and the postcodes it covers. The same table the
// postcode box looks up, read from `GET /delivery/areas`.
export default function DeliveryPage() {
  const { t } = useT();
  const fmt = useFormat();
  const money = (cents: number) => fmt.money(cents, 'EUR');
  const { data: areas, isPending, isError } = useDeliveryAreas();
  const { postcode, area, setPostcode } = useDelivery();

  return (
    <Container className="py-8">
      <Seo
        title={t('delivery.page.title')}
        description={t('delivery.page.seo')}
        canonical="/delivery"
      />
      <h1 className="font-display text-3xl font-extrabold">{t('delivery.page.title')}</h1>
      <p className="mt-3 max-w-prose text-lg">{t('delivery.page.lead')}</p>
      <PostcodeForm
        initial={postcode ?? ''}
        onSubmit={setPostcode}
        className="mt-5 flex max-w-md flex-col gap-3 sm:flex-row sm:items-start"
      />
      <DeliveryResult />

      {isPending && (
        <div className="mt-6" role="status" aria-label={t('delivery.page.loading')}>
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {isError && (
        <p role="alert" className="mt-6 text-danger">
          {t('delivery.page.error')}
        </p>
      )}
      {areas && (
        <ul className="mt-6 grid gap-4 md:grid-cols-2" data-testid="delivery-areas">
          {areas.map((a) => (
            <li
              key={a.slug}
              data-testid="delivery-area"
              className="rounded-card border-2 border-line p-4"
            >
              <h2 className="font-display text-xl font-bold">
                {a.name}
                {area?.slug === a.slug && (
                  <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-sm font-semibold text-primary-strong">
                    {t('delivery.page.yours')}
                  </span>
                )}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t('delivery.page.store', {
                  name: a.store.name,
                  street: a.store.street,
                  postalCode: a.store.postalCode,
                })}
              </p>
              <h3 className="mt-3 text-sm font-semibold">{t('delivery.page.postcodes')}</h3>
              <p className="break-words">{a.postcodes.join(', ')}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10" aria-labelledby="basket-rules" data-testid="basket-rules">
        <h2 id="basket-rules" className="font-display text-2xl font-bold">
          {t('delivery.rules.title')}
        </h2>
        <ul className="mt-3 flex max-w-prose list-disc flex-col gap-2 pl-5">
          <li>{t('delivery.rules.minimum', { amount: money(BASKET_RULES.minOrderCents) })}</li>
          <li>
            {t('delivery.rules.slot', {
              slot: money(BASKET_RULES.slotFeeCents),
              peak: money(BASKET_RULES.peakSurchargeCents),
            })}
          </li>
          <li>{t('delivery.rules.free', { amount: money(BASKET_RULES.freeDeliveryOverCents) })}</li>
          <li>{t('delivery.rules.express', { amount: money(BASKET_RULES.expressFeeCents) })}</li>
          <li>
            {t('delivery.rules.outer', { amount: money(BASKET_RULES.outerAreaSurchargeCents) })}
          </li>
          <li>{t('delivery.rules.bags', { amount: money(BASKET_RULES.bagFeeCents) })}</li>
          <li>{t('delivery.rules.deposit', { amount: money(25), small: money(8) })}</li>
        </ul>
      </section>
    </Container>
  );
}
