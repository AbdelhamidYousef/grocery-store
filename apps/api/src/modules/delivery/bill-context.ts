import { isOuterArea, isPeakSlot, type BasketContext } from '@store/shared';

// What the basket rules need to know about the delivery: the kind, whether the slot is in the peak
// window and whether the address is in an outer area. Pure; the cart, checkout and the quotes all
// build it here so the fee cannot depend on who asks.
type Delivery = BasketContext['delivery'];

/** From the cart's choice (a live hold or express; null when nothing is chosen yet). */
export function deliveryContext(
  chosen: { kind: 'slot' | 'express'; slot: { startsAt: string } | null } | null,
  areaSlug: string | null | undefined,
): Delivery {
  const outerArea = isOuterArea(areaSlug);
  if (!chosen) return { kind: null, peak: false, outerArea };
  if (chosen.kind === 'express') return { kind: 'express', peak: false, outerArea };
  return {
    kind: 'slot',
    peak: chosen.slot ? isPeakSlot(new Date(chosen.slot.startsAt)) : false,
    outerArea,
  };
}

/** From the delivery an order takes at checkout (`takeDelivery`). */
export function takenDeliveryContext(
  taken: { deliveryKind: 'slot' | 'express'; deliveryFrom: Date },
  areaSlug: string | null | undefined,
): Delivery {
  return deliveryContext(
    {
      kind: taken.deliveryKind,
      slot: taken.deliveryKind === 'slot' ? { startsAt: taken.deliveryFrom.toISOString() } : null,
    },
    areaSlug,
  );
}
