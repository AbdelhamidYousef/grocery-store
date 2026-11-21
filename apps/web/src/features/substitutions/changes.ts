import type { OrderItem } from '@store/shared';

// One thing that changed while packing: the line that was short or missing, and the replacement
// proposed for the units not found (if any).
export interface OrderChange {
  original: OrderItem;
  replacement: OrderItem | null;
}

export function changesOf(items: readonly OrderItem[]): OrderChange[] {
  return items
    .filter(
      (i) =>
        i.substitutesItemId === null &&
        (i.pickStatus === 'missing' || i.pickStatus === 'short' || i.pickStatus === 'substituted'),
    )
    .map((original) => ({
      original,
      replacement: items.find((r) => r.substitutesItemId === original.id) ?? null,
    }));
}

/**
 * What the shopper saves on a replacement: it normally costs more than the original they ordered,
 * and they are charged the original's price. Zero when it is cheaper or the same.
 */
export function replacementSavingCents(change: OrderChange): number {
  const { replacement } = change;
  if (!replacement?.listPriceCents) return 0;
  return Math.max(
    0,
    (replacement.listPriceCents - replacement.unitPriceCents) * replacement.quantity,
  );
}

/** The bag is still being packed: a paid order that has not been charged yet. */
export const canAnswerSwaps = (order: { status: string; capturedCents: number | null }): boolean =>
  (order.status === 'paid' || order.status === 'processing') && order.capturedCents === null;
