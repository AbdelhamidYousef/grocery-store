import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';

// On the product page of an item that needs a vet's approval. Plain words, no claims about what
// the item does: it only explains that the order waits for a decision, and that it is a demo.
export function VetBanner() {
  const { t } = useT();
  return (
    <p
      role="note"
      data-testid={TEST_IDS.vetBanner}
      className="rounded-control border-2 border-pet bg-pet-soft p-3 text-sm"
    >
      <strong>{t('checkout.vet.bannerTitle')}</strong> {t('checkout.vet.bannerBody')}
    </p>
  );
}
