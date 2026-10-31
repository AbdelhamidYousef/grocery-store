import { applyPercent } from '../money.ts';

import { allocate } from './allocate.ts';
import {
  PriceCartInputSchema,
  type Adjustment,
  type NextTierProgress,
  type Notice,
  type PriceCartInput,
  type PricedCart,
  type PricedLine,
  type PriceSource,
  type Progress,
} from './types.ts';

// The ONE place price maths lives. Pure: no DB, no clock (`now` is injected), no I/O. Cart,
// checkout, emails and admin all call this, so they cannot disagree by a cent.
//
// Stacking order (fixed; rendered to the customer as "How discounts combine"):
//   1. Line price: min(base, sale, member), prices never stack with each other.
//   2. Order discount: bulk tier OR percent/fixed code, whichever saves more, never both.
//   3. Gift: free item once the merchandise total after step 2 reaches the threshold.
//   4. Shipping: free over the threshold, or by a free-shipping code (stacks with everything).
//   5. Credits last, capped at the remaining merchandise, never on shipping.

function percentOf(done: number, goal: number): number {
  if (goal <= 0) return 100;
  return Math.min(100, Math.floor((done * 100) / goal));
}

function progressTowards(current: number, threshold: number): Progress {
  return {
    thresholdCents: threshold,
    remainingCents: Math.max(0, threshold - current),
    percent: percentOf(current, threshold),
    reached: current >= threshold,
  };
}

export function priceCart(rawInput: PriceCartInput): PricedCart {
  const input = PriceCartInputSchema.parse(rawInput);
  const { now, customer, code, shipping } = input;
  const notices: Notice[] = [];
  const adjustments: Adjustment[] = [];

  // ---- 1. line prices ----
  const lines = input.lines.map((l) => {
    let unit = l.baseCents;
    let source: PriceSource = 'base';
    if (l.fixedPrice) {
      source = 'fixed';
    } else {
      if (customer.isMember && l.memberCents !== undefined && l.memberCents < unit) {
        unit = l.memberCents;
        source = 'member';
      }
      // On a tie the sale price wins, so a code that excludes sale items stays excluded.
      if (
        l.onSale &&
        l.saleCents !== undefined &&
        l.saleCents < l.baseCents &&
        l.saleCents <= unit
      ) {
        unit = l.saleCents;
        source = 'sale';
      }
    }
    return { line: l, unit, source, subtotal: unit * l.qty };
  });
  const subtotal = lines.reduce((a, l) => a + l.subtotal, 0);

  // ---- 2. order discount: best of tier and code ----
  const tierBase = lines.reduce((a, l) => (l.source === 'fixed' ? a : a + l.subtotal), 0);
  const codeEligible = lines.map(
    (l) => l.source !== 'fixed' && !(code?.excludeSaleItems && l.source === 'sale'),
  );
  const codeBase = lines.reduce((a, l, i) => (codeEligible[i] ? a + l.subtotal : a), 0);

  // Highest percent among the tiers whose minimum is met (a later tier may carry a lower percent
  // by mistake in data; we still pick what saves most).
  const tier = input.tiers
    .filter((t) => tierBase >= t.minCents)
    .reduce<(typeof input.tiers)[number] | undefined>(
      (best, t) => (!best || t.percent > best.percent ? t : best),
      undefined,
    );
  const tierSaving = tier ? applyPercent(tierBase, tier.percent) : 0;

  let codeValid = false;
  if (code && lines.length > 0) {
    if (code.startsAt && now < code.startsAt) {
      notices.push({ key: 'code_not_started', refId: code.id });
    } else if (code.endsAt && now >= code.endsAt) {
      notices.push({ key: 'code_expired', refId: code.id });
    } else if (code.firstOrderOnly && customer.orderCount > 0) {
      notices.push({ key: 'code_first_order_only', refId: code.id });
    } else if (codeBase < code.minSpendCents) {
      notices.push({
        key: 'code_min_spend',
        refId: code.id,
        cents: code.minSpendCents - codeBase,
      });
    } else if (code.kind !== 'free_shipping' && codeBase === 0) {
      notices.push({ key: 'code_no_eligible_items', refId: code.id });
    } else {
      codeValid = true;
    }
  }

  let codeSaving = 0;
  if (codeValid && code && code.kind === 'percent') codeSaving = applyPercent(codeBase, code.value);
  if (codeValid && code && code.kind === 'fixed') codeSaving = Math.min(code.value, codeBase);

  // Ties go to the tier: it is automatic, so the customer keeps it without a code.
  const orderDiscounts: { adj: Adjustment; weights: number[] }[] = [];
  if (codeSaving > tierSaving && code) {
    orderDiscounts.push({
      adj: {
        type: 'code',
        refId: code.id,
        label: `Code ${code.code}`,
        cents: codeSaving,
        scope: 'lines',
      },
      weights: lines.map((l, i) => (codeEligible[i] ? l.subtotal : 0)),
    });
  } else if (tier && tierSaving > 0) {
    orderDiscounts.push({
      adj: {
        type: 'bulk_tier',
        refId: tier.id,
        label: `${tier.percent}% bulk discount`,
        cents: tierSaving,
        scope: 'lines',
      },
      weights: lines.map((l) => (l.source === 'fixed' ? 0 : l.subtotal)),
    });
    if (codeValid && code && code.kind !== 'free_shipping') {
      notices.push({ key: 'code_not_stackable', refId: code.id });
    }
  }

  // Allocate every line-scoped adjustment to the lines, each against what is left of them.
  const remaining = lines.map((l) => l.subtotal);
  const promosPerLine = lines.map(() => [] as PricedLine['appliedPromos']);
  function applyToLines(adj: Adjustment, weights: number[]): void {
    adjustments.push(adj);
    const shares = allocate(adj.cents, weights);
    shares.forEach((cents, i) => {
      if (cents === 0) return;
      remaining[i]! -= cents;
      promosPerLine[i]!.push({ type: adj.type, refId: adj.refId, label: adj.label, cents });
    });
  }
  for (const d of orderDiscounts) applyToLines(d.adj, d.weights);

  // Thresholds (gift, free shipping) look at the merchandise after step 2 and BEFORE credits:
  // paying with points must not make a customer lose their gift or free shipping.
  const discounted = remaining.reduce((a, b) => a + b, 0);

  // ---- 4. shipping ----
  let shippingCents = lines.length === 0 ? 0 : shipping.methodCents;
  const overThreshold =
    shipping.freeOverCents !== undefined &&
    lines.length > 0 &&
    discounted >= shipping.freeOverCents;
  const freeByCode = codeValid && code?.kind === 'free_shipping';
  if (shippingCents > 0 && (overThreshold || freeByCode)) {
    if (freeByCode && !overThreshold && code) {
      adjustments.push({
        type: 'free_shipping',
        refId: code.id,
        label: `Code ${code.code}: free shipping`,
        cents: shippingCents,
        scope: 'shipping',
      });
    }
    shippingCents = 0;
  }

  // ---- 3. gift: earned on the discounted merchandise total ----
  const giftRule = input.giftRule?.giftAvailable ? input.giftRule : undefined;
  const giftEarned = !!giftRule && discounted > 0 && discounted >= giftRule.thresholdCents;
  const gift =
    giftRule && giftEarned
      ? ({ variantId: giftRule.variantId, qty: 1, unitCents: 0 } as const)
      : null;
  const giftProgress = giftRule ? progressTowards(discounted, giftRule.thresholdCents) : null;
  if (giftProgress && discounted === 0) giftProgress.reached = false;

  // ---- 5. credits: last, capped at what is left of the merchandise, never on shipping ----
  for (const credit of input.credits) {
    const left = remaining.reduce((a, b) => a + b, 0);
    const applied = Math.min(credit.cents, left);
    if (applied < credit.cents)
      notices.push({ key: 'credit_capped', refId: credit.refId, cents: credit.cents - applied });
    if (applied === 0) continue;
    applyToLines(
      { type: 'credit', refId: credit.refId, label: credit.label, cents: applied, scope: 'lines' },
      [...remaining],
    );
  }
  const merchandise = remaining.reduce((a, b) => a + b, 0);

  // ---- result ----
  const pricedLines: PricedLine[] = lines.map((l, i) => ({
    variantId: l.line.variantId,
    productId: l.line.productId,
    qty: l.line.qty,
    unitCents: l.unit,
    priceSource: l.source,
    lineSubtotalCents: l.subtotal,
    lineDiscountCents: l.subtotal - remaining[i]!,
    lineTotalCents: remaining[i]!,
    appliedPromos: promosPerLine[i]!,
  }));
  const discountCents = pricedLines.reduce((a, l) => a + l.lineDiscountCents, 0);

  const nextTierRow = input.tiers
    .filter((t) => t.minCents > tierBase)
    .reduce<(typeof input.tiers)[number] | undefined>(
      (best, t) => (!best || t.minCents < best.minCents ? t : best),
      undefined,
    );
  const nextTier: NextTierProgress | null = nextTierRow
    ? { ...progressTowards(tierBase, nextTierRow.minCents), discountPercent: nextTierRow.percent }
    : null;

  let freeShipping: Progress | null = null;
  if (shipping.freeOverCents !== undefined) {
    freeShipping = freeByCode
      ? { thresholdCents: shipping.freeOverCents, remainingCents: 0, percent: 100, reached: true }
      : progressTowards(discounted, shipping.freeOverCents);
  }

  return {
    pricedAt: now.toISOString(),
    currency: input.currency,
    lines: pricedLines,
    adjustments,
    subtotalCents: subtotal,
    discountCents,
    merchandiseCents: merchandise,
    shippingCents,
    totalCents: merchandise + shippingCents,
    donationCents: 0,
    gift,
    progress: { freeShipping, gift: giftProgress, nextTier },
    notices,
  };
}
