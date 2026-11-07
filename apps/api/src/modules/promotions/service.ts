import {
  formatMoney,
  priceCart,
  type CartPricing,
  type PricedCart,
  type PricingCode,
} from '@store/shared';

import type { Tx } from '../../db/client.ts';
import { validation } from '../../lib/errors.ts';
import { onOrderCancelled, type OrderCancelledEvent } from '../orders/events.ts';
import { customerKey } from '../trials/service.ts';

import * as repo from './repo.ts';

// Loads the promotion rules, hands them with the cart to the pure engine, and turns its output into
// what the API returns. No price maths here: that is the engine's job (packages/shared/src/pricing).

export interface PricingLineInput {
  variantId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  isTrial: boolean;
}

export interface PricingRequest {
  currency: string;
  // Purchasable lines only (sold-out lines are not priced).
  lines: PricingLineInput[];
  userId: string | null;
  // Unknown for a guest until checkout asks for it.
  email: string | null;
  code: string | null;
  // Shipping before any free-shipping threshold, and that threshold; the engine applies it to the
  // merchandise total after discounts.
  shipping: { methodCents: number; freeOverCents: number | null };
  now?: Date;
  // Checkout only: lock the code row before counting its uses (the cap race), and leave out the
  // redemption of the pending order being re-placed.
  lockCode?: boolean;
  exceptOrderId?: string;
}

// Codes the service refuses before the engine sees them (the engine only knows the cart).
type ServiceNotice = 'code_unknown' | 'code_used_up' | 'code_already_used';

export interface PricingResult {
  priced: PricedCart;
  // The code row the engine was given, if any (checkout needs its id for the redemption row).
  code: repo.CodeRow | null;
  // The active gift rule as loaded (checkout snapshots the gift line from it).
  gift: Awaited<ReturnType<typeof repo.activeGift>>;
  pricing: CartPricing;
}

const dateLabel = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Usage caps are the service's half of the code rules: they need the database.
async function usageProblem(
  run: Tx,
  code: repo.CodeRow,
  key: string | null,
  exceptOrderId: string | undefined,
): Promise<ServiceNotice | null> {
  if (code.maxUses === null && (code.perCustomerMax === null || key === null)) return null;
  const used = await repo.countRedemptions(run, code.id, key ?? '', exceptOrderId);
  if (code.maxUses !== null && used.total >= code.maxUses) return 'code_used_up';
  if (key !== null && code.perCustomerMax !== null && used.mine >= code.perCustomerMax) {
    return 'code_already_used';
  }
  return null;
}

function toEngineCode(code: repo.CodeRow): PricingCode {
  return {
    id: code.id,
    code: code.code,
    kind: code.kind,
    value: code.value,
    minSpendCents: code.minSpendCents,
    excludeSaleItems: code.excludeSaleItems,
    firstOrderOnly: code.firstOrderOnly,
    startsAt: code.startsAt ?? undefined,
    endsAt: code.endsAt ?? undefined,
  };
}

export async function price(tx: Tx, req: PricingRequest): Promise<PricingResult> {
  const now = req.now ?? new Date();
  const key = req.userId || req.email ? customerKey(req.userId, req.email ?? '') : null;
  // One after the other: queries on one transaction share a connection anyway.
  const tiers = await repo.activeTiers(tx);
  const gift = await repo.activeGift(tx);
  const codeRow = req.code ? await repo.findCode(tx, req.code) : undefined;

  const serviceNotices: { key: ServiceNotice; refId?: string }[] = [];
  let code: repo.CodeRow | null = null;
  if (req.code) {
    if (!codeRow || !codeRow.active || codeRow.archivedAt !== null) {
      serviceNotices.push({ key: 'code_unknown' });
    } else {
      if (req.lockCode) await repo.lockCode(tx, codeRow.id);
      const problem = await usageProblem(tx, codeRow, key, req.exceptOrderId);
      if (problem) serviceNotices.push({ key: problem, refId: codeRow.id });
      else code = codeRow;
    }
  }

  const orderCount = code?.firstOrderOnly
    ? await repo.countPlacedOrders(tx, req.userId, req.email)
    : 0;

  const priced = priceCart({
    now,
    currency: req.currency,
    lines: req.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      qty: l.quantity,
      baseCents: l.unitPriceCents,
      fixedPrice: l.isTrial,
    })),
    customer: { isMember: req.userId !== null, orderCount },
    code: code ? toEngineCode(code) : undefined,
    tiers,
    giftRule: gift
      ? {
          id: gift.id,
          thresholdCents: gift.thresholdCents,
          variantId: gift.variantId,
          giftAvailable: gift.available,
        }
      : undefined,
    shipping: {
      methodCents: req.shipping.methodCents,
      freeOverCents: req.shipping.freeOverCents ?? undefined,
    },
  });

  return {
    priced,
    code,
    gift,
    pricing: {
      code: req.code ? (codeRow?.code ?? req.code) : null,
      lines: priced.lines.map((l) => ({
        variantId: l.variantId,
        unitCents: l.unitCents,
        priceSource: l.priceSource,
        lineDiscountCents: l.lineDiscountCents,
      })),
      adjustments: priced.adjustments,
      discountCents: priced.discountCents,
      merchandiseCents: priced.merchandiseCents,
      shippingEstimateCents: priced.shippingCents,
      totalEstimateCents: priced.totalCents,
      gift:
        priced.gift && gift
          ? {
              variantId: gift.variantId,
              productName: gift.productName,
              variantName: gift.variantName,
              imageUrl: gift.imageUrl,
            }
          : null,
      progress: priced.progress,
      notices: [...serviceNotices, ...priced.notices],
    },
  };
}

// The kind sentence for a code the shopper is trying to apply, or null when it can be applied.
// `code_not_stackable` is not a refusal: the code stays and the cart explains the tier won.
export function codeRefusal(
  pricing: CartPricing,
  code: Pick<repo.CodeRow, 'startsAt' | 'endsAt'> | undefined,
  codeText: string,
  currency: string,
): string | null {
  for (const notice of pricing.notices) {
    switch (notice.key) {
      case 'code_unknown':
        return `We don't recognise the code ${codeText}`;
      case 'code_used_up':
        return 'This code has been fully used';
      case 'code_already_used':
        return "You've already used this code";
      case 'code_not_started':
        return code?.startsAt
          ? `This code starts on ${dateLabel(code.startsAt)}`
          : 'This code has not started yet';
      case 'code_expired':
        return code?.endsAt
          ? `This code expired on ${dateLabel(code.endsAt)}`
          : 'This code has expired';
      case 'code_min_spend':
        return `Add ${formatMoney(notice.cents ?? 0, currency)} more to use this code`;
      case 'code_no_eligible_items':
        return "This code doesn't apply to items that are already reduced";
      case 'code_first_order_only':
        return 'This code is for a first order only';
    }
  }
  return null;
}

export const codeError = (message: string) =>
  validation({ formErrors: [], fieldErrors: { code: [message] } }, message);

export const findCode = (tx: Tx, code: string) => repo.findCode(tx, code);

// ---------- order event subscribers ----------

// An order that never got paid gives its code use back. A paid order that is cancelled later
// keeps it: the code was consumed (phase 18 plan, step 18.4).
async function releaseOnCancelled(tx: Tx, { orderId }: OrderCancelledEvent): Promise<void> {
  if (!(await repo.wasPaid(tx, orderId))) await repo.releaseRedemptions(tx, orderId);
}

// Called once at start-up (modules/index.ts); safe to call again (the registry is a set).
export function registerPromotionSubscribers(): void {
  onOrderCancelled(releaseOnCancelled);
}
