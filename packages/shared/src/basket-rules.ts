import { priceCart } from './pricing/priceCart.ts';
import type { PriceCartInput, PricedCart } from './pricing/types.ts';
import { formatClock, parseClock } from './slots.ts';

// The basket rules of a quick-delivery shop (phase G9) and the ONE function that turns a basket into
// a bill. The cart, checkout (the server recomputes it; the browser's numbers are never trusted),
// the order snapshot, the emails and the card authorisation all show this function's output, so
// they cannot disagree by a cent. Pure: no database, no clock, integer cents only.

export const BASKET_RULES = {
  /** Goods only (after discounts, before deposit, bags and delivery). Below it checkout is blocked. */
  minOrderCents: 1500,
  /** Delivery in a one-hour slot. */
  slotFeeCents: 299,
  /** Added to a slot that starts in the peak window. */
  peakSurchargeCents: 100,
  /** The peak window, local shop time: a slot starting at 17:00, 18:00 or 19:00 is peak. */
  peakFromHour: 17,
  peakToHour: 20,
  /** Express (within 30 minutes). Never free. */
  expressFeeCents: 499,
  /** Added in the outer delivery areas. */
  outerAreaSurchargeCents: 50,
  /** A slot is free from this much in goods (after discounts). Deposit does not count. */
  freeDeliveryOverCents: 4900,
  /** One paper bag, and how many units fit in it. */
  bagFeeCents: 25,
  unitsPerBag: 8,
} as const;

/** Areas that pay the outer-area surcharge. */
export const OUTER_AREA_SLUGS: readonly string[] = ['neukoelln'];

export const isOuterArea = (areaSlug: string | null | undefined): boolean =>
  areaSlug != null && OUTER_AREA_SLUGS.includes(areaSlug);

/** True when a slot starting at `startsAt` is in the peak window (shop time, not the visitor's). */
export function isPeakSlot(startsAt: Date): boolean {
  const minutes = parseClock(formatClock(startsAt));
  return minutes >= BASKET_RULES.peakFromHour * 60 && minutes < BASKET_RULES.peakToHour * 60;
}

/** Bags for a basket: `ceil(units / 8)`. */
export function bagCount(units: number): number {
  return units <= 0 ? 0 : Math.ceil(units / BASKET_RULES.unitsPerBag);
}

export type DeliveryKind = 'slot' | 'express';

/** The delivery fee before any free-delivery rule. */
export function deliveryFeeBeforeFreeCents(d: {
  kind: DeliveryKind;
  peak: boolean;
  outerArea: boolean;
}): number {
  const base =
    d.kind === 'express'
      ? BASKET_RULES.expressFeeCents
      : BASKET_RULES.slotFeeCents + (d.peak ? BASKET_RULES.peakSurchargeCents : 0);
  return base + (d.outerArea ? BASKET_RULES.outerAreaSurchargeCents : 0);
}

export interface BasketLine {
  variantId: string;
  productId: string;
  qty: number;
  baseCents: number;
  saleCents?: number | undefined;
  memberCents?: number | undefined;
  onSale?: boolean | undefined;
  fixedPrice?: boolean | undefined;
  /** Bottle deposit per unit (0 for most things). Not goods: never discounted, never in a threshold. */
  depositCents: number;
}

export interface BasketContext extends Omit<PriceCartInput, 'lines' | 'shipping'> {
  /**
   * The delivery the shopper chose. `kind: null` is "not chosen yet": the bill shows the slot fee as
   * an estimate (`deliveryEstimated`), peak unknown.
   */
  delivery: { kind: DeliveryKind | null; peak: boolean; outerArea: boolean };
  /** Paper bags at checkout. false is "No bags, use boxes": no bag fee. */
  bags: boolean;
}

export interface BasketTotals {
  /** The discount engine's full answer (lines, adjustments, notices, gift, progress). */
  priced: PricedCart;
  /** Goods before discounts. */
  subtotalCents: number;
  /** Everything taken off the goods: tiers, codes, credits. */
  discountCents: number;
  /** Goods after discounts and credits. */
  merchandiseCents: number;
  /** Goods after discounts, BEFORE credits: what the minimum and the free-delivery rule look at. */
  goodsCents: number;
  depositCents: number;
  bagCount: number;
  bagFeeCents: number;
  /** The fee charged (0 when free). */
  deliveryFeeCents: number;
  /** The fee before the free-delivery rule. */
  deliveryFeeBeforeFreeCents: number;
  deliveryFree: boolean;
  /** True while no delivery time is chosen: the fee shown is the cheapest slot's. */
  deliveryEstimated: boolean;
  donationCents: number;
  /** What the shopper pays: goods + deposit + bags + delivery + donation. */
  totalCents: number;
  minimumOrder: { minCents: number; missingCents: number; met: boolean };
  /** Free delivery: null for express (never free). */
  freeDelivery: {
    thresholdCents: number;
    missingCents: number;
    reached: boolean;
    percent: number;
  } | null;
  /** The basket may be paid for (goods reach the minimum). Other checks (stock, slot) are elsewhere. */
  canCheckout: boolean;
}

/**
 * The bill as the API sends it and every screen shows it (`BillSchema`): `basketTotals` without the
 * engine's line detail, plus the two choices that shaped it.
 */
export function billOf(
  t: BasketTotals,
  choice: { bags: boolean; deliveryKind: DeliveryKind | null },
) {
  return {
    subtotalCents: t.subtotalCents,
    discountCents: t.discountCents,
    merchandiseCents: t.merchandiseCents,
    goodsCents: t.goodsCents,
    depositCents: t.depositCents,
    bags: choice.bags,
    bagCount: t.bagCount,
    bagFeeCents: t.bagFeeCents,
    deliveryKind: choice.deliveryKind,
    deliveryFeeCents: t.deliveryFeeCents,
    deliveryFeeBeforeFreeCents: t.deliveryFeeBeforeFreeCents,
    deliveryFree: t.deliveryFree,
    deliveryEstimated: t.deliveryEstimated,
    donationCents: t.donationCents,
    totalCents: t.totalCents,
    minimumOrder: t.minimumOrder,
    freeDelivery: t.freeDelivery,
    canCheckout: t.canCheckout,
  };
}

export function basketTotals(lines: readonly BasketLine[], ctx: BasketContext): BasketTotals {
  const { delivery, bags, ...engine } = ctx;
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const depositCents = lines.reduce((n, l) => n + l.depositCents * l.qty, 0);
  const bagsNeeded = bags ? bagCount(units) : 0;
  const bagFeeCents = bagsNeeded * BASKET_RULES.bagFeeCents;

  const kind: DeliveryKind = delivery.kind ?? 'slot';
  const empty = lines.length === 0;
  const beforeFree = empty
    ? 0
    : deliveryFeeBeforeFreeCents({
        kind,
        peak: delivery.kind === null ? false : delivery.peak,
        outerArea: delivery.outerArea,
      });

  const priced = priceCart({
    ...engine,
    lines: lines.map(({ depositCents: _deposit, ...line }) => line),
    shipping: {
      methodCents: beforeFree,
      ...(kind === 'express'
        ? { neverFree: true }
        : { freeOverCents: BASKET_RULES.freeDeliveryOverCents }),
    },
    feesCents: depositCents + bagFeeCents,
  });

  const goodsCents = priced.goodsCents;
  const minimumOrder = {
    minCents: BASKET_RULES.minOrderCents,
    missingCents: Math.max(0, BASKET_RULES.minOrderCents - goodsCents),
    met: goodsCents >= BASKET_RULES.minOrderCents,
  };
  const freeDelivery =
    kind === 'express' || empty
      ? null
      : {
          thresholdCents: BASKET_RULES.freeDeliveryOverCents,
          missingCents: Math.max(0, BASKET_RULES.freeDeliveryOverCents - goodsCents),
          reached: goodsCents >= BASKET_RULES.freeDeliveryOverCents,
          percent: Math.min(
            100,
            Math.floor((goodsCents * 100) / BASKET_RULES.freeDeliveryOverCents),
          ),
        };

  return {
    priced,
    subtotalCents: priced.subtotalCents,
    discountCents: priced.discountCents,
    merchandiseCents: priced.merchandiseCents,
    goodsCents,
    depositCents,
    bagCount: bagsNeeded,
    bagFeeCents,
    deliveryFeeCents: priced.shippingCents,
    deliveryFeeBeforeFreeCents: beforeFree,
    deliveryFree: beforeFree > 0 && priced.shippingCents === 0,
    deliveryEstimated: delivery.kind === null,
    donationCents: priced.donationCents,
    totalCents: priced.totalCents,
    minimumOrder,
    freeDelivery,
    canCheckout: !empty && minimumOrder.met,
  };
}
