import type { WebCart } from '../../api/cart';
import { TEST_IDS } from '../../lib/test-ids';

import { INLINE_NOTICE_CODES, noticeText } from './CartLine';
import { noticeKey, useCartNotices } from './queries';

// Notices that belong to no visible line: a line the API removed, or a code this build does not
// know. Inline-capable notices whose line is gone also end up here so they are never lost.
export function useBannerNotices(cart: WebCart) {
  const { notices, dismiss } = useCartNotices();
  const lineVariants = new Set(cart.items.map((i) => i.variantId));
  const inlineFor = (variantId: string) =>
    notices.filter((w) => INLINE_NOTICE_CODES.includes(w.code) && w.variantId === variantId);
  const banner = notices.filter(
    (w) =>
      w.code !== 'OUT_OF_STOCK' &&
      !(INLINE_NOTICE_CODES.includes(w.code) && lineVariants.has(w.variantId)),
  );
  return { inlineFor, banner, dismiss };
}

export function CartNotices({
  notices,
  currency,
  onDismiss,
}: {
  notices: ReturnType<typeof useBannerNotices>['banner'];
  currency: string;
  onDismiss: (key: string) => void;
}) {
  if (notices.length === 0) return null;
  return (
    <ul className="mb-4 flex flex-col gap-2" data-testid={TEST_IDS.cartWarnings}>
      {notices.map((w) => (
        <li
          key={noticeKey(w)}
          role="status"
          className="flex items-start gap-3 rounded-control border-2 border-primary bg-primary-soft p-3 font-semibold text-primary-strong"
        >
          <p className="min-w-0 flex-1 break-words">{noticeText(w, currency)}</p>
          <button
            type="button"
            onClick={() => onDismiss(noticeKey(w))}
            className="-my-1 min-h-11 shrink-0 rounded-control px-2 underline"
          >
            Dismiss<span className="sr-only"> notice about {w.productName}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
