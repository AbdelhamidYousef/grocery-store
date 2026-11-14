import type { WebCart } from '../../api/cart';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { image600 } from '../../lib/images';
import { TEST_IDS } from '../../lib/test-ids';

// The free gift the engine added. It is not a cart item (no quantity, no remove button), so it
// has its own quiet row instead of a CartLine.
export function GiftLine({ pricing, currency }: { pricing: WebCart['pricing']; currency: string }) {
  const { t } = useT();
  const fmt = useFormat();
  const gift = pricing.gift;
  if (!gift) return null;
  return (
    <li
      data-testid={TEST_IDS.cartGiftLine}
      className="flex items-center gap-3 border-b-2 border-line py-4"
    >
      {gift.imageUrl ? (
        <img
          src={image600(gift.imageUrl)}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-control border border-line object-cover"
        />
      ) : (
        <span aria-hidden="true" className="h-16 w-16 shrink-0 rounded-control bg-line" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-success">{t('cart.gift.label')}</p>
        <p className="break-words font-semibold">{gift.productName}</p>
        <p className="break-words text-sm text-muted">{gift.variantName}</p>
      </div>
      <p className="shrink-0 font-display font-bold">{fmt.money(0, currency)}</p>
    </li>
  );
}
