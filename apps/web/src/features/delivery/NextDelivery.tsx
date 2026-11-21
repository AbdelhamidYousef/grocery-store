import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

import { useDelivery } from './DeliveryContext';
import { firstOpenSlot, slotLabel, useServerNow, useSlots } from './slots';

// "Express in 30 minutes" when express is on offer, else "Next delivery: today 14:00–15:00", from
// the slots of the shopper's store. Without a postcode it says how to see delivery times; while the
// answer is loading (or failed) it shows nothing: an estimate that is not known must not be guessed.
export function NextDelivery({ className }: { className?: string }) {
  const { t } = useT();
  const { locale } = useFormat();
  const { served } = useDelivery();
  const { data } = useSlots();
  const now = useServerNow(data?.offsetMs ?? 0);
  if (!data) return null;

  const next = firstOpenSlot(data.days);
  let text: string | null = null;
  if (data.express.available) text = t('delivery.next.express');
  else if (next) text = t('delivery.next.slot', { when: slotLabel(next, now, locale, true) });
  if (!served && !text) text = t('delivery.next.noPostcode');
  if (!text) return null;

  return (
    <p
      data-testid={TEST_IDS.deliveryNext}
      className={cn('rounded-card bg-dept-soft p-3 font-semibold', className)}
    >
      {text}
    </p>
  );
}
