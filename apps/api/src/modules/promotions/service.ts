import {
  formatMoney,
  priceCart,
  type CartPricing,
  type PricedCart,
  type BannerResponse,
  type PricingCode,
  type PriceCartInput,
  type PromotionRulesResponse,
  type SaleOffer,
} from '@store/shared';

import { db, type Tx } from '../../db/client.ts';
import { validation } from '../../lib/errors.ts';
import { listActiveShippingMethods } from '../checkout/repo.ts';
import { estimateRule } from '../checkout/shipping.ts';
import { currentStore } from '../i18n/context.ts';
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
  // Prepaid value taken off the merchandise last (loyalty points, referral credit); the engine caps
  // it at what is left, so it can never make the total negative or touch shipping.
  credits?: NonNullable<PriceCartInput['credits']>;
  // Round the payable total up to the next whole euro as a separate donation line.
  roundUpDonation?: boolean;
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
  // The sale price in force right now, per variant (the engine picks the best of base, sale, member).
  const sales = new Map(
    (
      await repo.activeSales(
        tx,
        { variantIds: [...new Set(req.lines.map((l) => l.variantId))] },
        now,
        req.currency,
      )
    ).map((s) => [s.variantId, s]),
  );
  // Member prices only matter to a signed-in customer; guests never load them.
  const members = new Map(
    req.userId === null
      ? []
      : (
          await repo.memberPrices(
            tx,
            { variantIds: [...new Set(req.lines.map((l) => l.variantId))] },
            req.currency,
          )
        ).map((m) => [m.variantId, m.memberPriceCents]),
  );
  const key = req.userId || req.email ? customerKey(req.userId, req.email ?? '') : null;
  // One after the other: queries on one transaction share a connection anyway.
  const tiers = await repo.activeTiers(tx);
  const gift = await repo.activeGift(tx);
  const codeRow = req.code ? await repo.findCode(tx, req.code) : undefined;

  const serviceNotices: { key: ServiceNotice; refId?: string }[] = [];
  let code: repo.CodeRow | null = null;
  if (req.code) {
    // A personal code (a reward, a referral) belongs to one account: to anyone else it does not
    // exist, so its existence is not revealed either.
    const foreign = codeRow?.ownerUserId != null && codeRow.ownerUserId !== req.userId;
    if (!codeRow || !codeRow.active || codeRow.archivedAt !== null || foreign) {
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
    lines: req.lines.map((l) => {
      const sale = sales.get(l.variantId);
      const member = members.get(l.variantId);
      return {
        variantId: l.variantId,
        productId: l.productId,
        qty: l.quantity,
        baseCents: l.unitPriceCents,
        fixedPrice: l.isTrial,
        ...(member !== undefined && { memberCents: member }),
        ...(sale && { saleCents: sale.salePriceCents, onSale: true }),
      };
    }),
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
    credits: req.credits ?? [],
    roundUpDonation: req.roundUpDonation ?? false,
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
        referenceCents:
          l.priceSource === 'sale' ? (sales.get(l.variantId)?.referenceCents ?? null) : null,
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

// ---------- flash sales (step 18.6) ----------

const DAY_MS = 24 * 60 * 60 * 1000;
const OMNIBUS_DAYS = 30;

// EU Omnibus reference price for a sale starting at `startsAt`: the lowest price charged in the 30
// days before it. `history` is newest first and holds only prices strictly before `startsAt`
// (base and sale kinds), so the sale's own price can never be its own reference. The price in
// effect when the window opens counts too (a price set 90 days ago and never changed was charged
// the whole window). Null = no history, and then nothing may be struck through.
export function omnibusReference(history: repo.HistoryPoint[], startsAt: Date): number | null {
  const windowStart = startsAt.getTime() - OMNIBUS_DAYS * DAY_MS;
  const inWindow = history.filter((h) => h.validFrom.getTime() > windowStart);
  const inEffect = history.find((h) => h.validFrom.getTime() <= windowStart);
  const prices = [...inWindow, ...(inEffect ? [inEffect] : [])].map((h) => h.priceCents);
  return prices.length === 0 ? null : Math.min(...prices);
}

async function activate(tx: Tx, sale: repo.FlashSaleRow): Promise<void> {
  const items = await repo.listSaleItems(tx, [sale.id]);
  const history = await repo.priceHistoryBefore(
    tx,
    items.map((i) => i.variantId),
    sale.startsAt,
  );
  for (const item of items) {
    await repo.setReference(
      tx,
      item.id,
      omnibusReference(history.get(item.variantId) ?? [], sale.startsAt),
    );
  }
  // The sale price itself enters the history at the moment the sale starts: a later sale's
  // reference must see what this one charged.
  await repo.insertPriceHistory(
    tx,
    items.map((i) => ({
      variantId: i.variantId,
      priceCents: i.salePriceCents,
      kind: 'sale' as const,
      validFrom: sale.startsAt,
    })),
  );
}

// Lazy stand-in for the activate-sales job (the job runner arrives in phase 19): called at the
// start of cart loads, catalog reads and the banner. Each due sale is activated by exactly one
// caller (UPDATE ... RETURNING), in the same transaction that writes its reference prices and
// history rows, so no reader sees an active sale without them. With nothing due it costs one
// indexed SELECT.
export async function syncFlashSales(run: typeof db | Tx, now: Date = new Date()): Promise<void> {
  if (!(await repo.hasSalesToSync(run, now))) return;
  await run.transaction(async (tx) => {
    for (const sale of await repo.activateDueSales(tx, now)) await activate(tx, sale);
    // When a sale ends its variants are back at their regular price from `ends_at` on: record
    // that, or a later sale's Omnibus reference would treat the old sale price as still in effect.
    const ended = await repo.endDueSales(tx, now);
    const items = await repo.listSaleItems(
      tx,
      ended.map((s) => s.id),
    );
    const base = await repo.basePrices(
      tx,
      items.map((i) => i.variantId),
    );
    const endsAt = new Map(ended.map((s) => [s.id, s.endsAt]));
    await repo.insertPriceHistory(
      tx,
      items.flatMap((i) => {
        const priceCents = base.get(i.variantId);
        const validFrom = endsAt.get(i.saleId);
        return priceCents === undefined || !validFrom
          ? []
          : [{ variantId: i.variantId, priceCents, kind: 'base' as const, validFrom }];
      }),
    );
  });
}

export interface SaleOffers {
  // By product (the best offer, for a card) and by variant (for the detail page).
  byProduct: Map<string, SaleOffer>;
  byVariant: Map<string, SaleOffer>;
}

// Offers for a set of products, for catalog cards and the product page.
export async function saleOffersForProducts(
  productIds: string[],
  now: Date = new Date(),
): Promise<SaleOffers> {
  const rows = await repo.activeSales(db, { productIds }, now);
  const byVariant = new Map<string, SaleOffer>();
  const byProduct = new Map<string, SaleOffer>();
  for (const r of rows) {
    const offer: SaleOffer = {
      priceCents: r.salePriceCents,
      referenceCents: r.referenceCents,
      basePriceCents: r.basePriceCents,
      endsAt: r.endsAt.toISOString(),
    };
    byVariant.set(r.variantId, offer);
    const best = byProduct.get(r.productId);
    byProduct.set(
      r.productId,
      !best
        ? offer
        : {
            // The lowest sale price decides which variant's reference and base are shown; the
            // countdown shows the earliest end.
            ...(offer.priceCents < best.priceCents ? offer : best),
            endsAt: offer.endsAt < best.endsAt ? offer.endsAt : best.endsAt,
          },
    );
  }
  return { byProduct, byVariant };
}

export interface MemberPrices {
  // The lowest member price per product (for a card) and the price per variant (detail page).
  byProduct: Map<string, number>;
  byVariant: Map<string, number>;
}

// Callers hand the result to a response only for a signed-in viewer (see catalog/service.ts).
export async function memberPricesForProducts(productIds: string[]): Promise<MemberPrices> {
  const byVariant = new Map<string, number>();
  const byProduct = new Map<string, number>();
  for (const r of await repo.memberPrices(db, { productIds })) {
    byVariant.set(r.variantId, r.memberPriceCents);
    const best = byProduct.get(r.productId);
    if (best === undefined || r.memberPriceCents < best)
      byProduct.set(r.productId, r.memberPriceCents);
  }
  return { byProduct, byVariant };
}

export async function getBanner(now: Date = new Date()): Promise<BannerResponse['data']> {
  await syncFlashSales(db, now);
  // The banner announces a EUR-only sale: other stores show none.
  const sale = currentStore().currency === 'EUR' ? await repo.bannerSale(db, now) : undefined;
  return {
    sale: sale
      ? {
          id: sale.id,
          name: sale.name,
          startsAt: sale.startsAt.toISOString(),
          endsAt: sale.endsAt.toISOString(),
          status: sale.status === 'active' ? 'active' : 'scheduled',
        }
      : null,
    serverNow: now.toISOString(),
  };
}

export async function getRules(): Promise<PromotionRulesResponse['data']> {
  const [tiers, gift, methods] = await Promise.all([
    repo.activeTiers(db),
    repo.activeGift(db),
    listActiveShippingMethods(db),
  ]);
  return {
    tiers: tiers.map((t) => ({ minCents: t.minCents, percent: t.percent })),
    gift: gift
      ? {
          thresholdCents: gift.thresholdCents,
          productName: gift.productName,
          variantName: gift.variantName,
        }
      : null,
    freeDeliveryThresholdCents: estimateRule(methods)?.freeOverCents ?? null,
  };
}
