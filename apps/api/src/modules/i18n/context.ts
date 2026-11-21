import { AsyncLocalStorage } from 'node:async_hooks';

import { DEFAULT_STORE, postcodeSchema, storeFromCode, type StoreView } from '@store/shared';
import type { RequestHandler } from 'express';

import { DEFAULT_DELIVERY_STORE_ID, lookupPostcode } from '../delivery/areas.ts';

// The store view of the request in flight, so the catalogue services can read the language
// without every function in between passing it along. Set once, by `storeViewContext`.
const storage = new AsyncLocalStorage<StoreView>();

export function currentStore(): StoreView {
  return storage.getStore() ?? DEFAULT_STORE;
}

/** Translation language of the current request: `de`, `fr`, or `en` (the base columns). */
export function currentLang(): string {
  return currentStore().lang;
}

// `X-Store-View: de-de` (set by the web client from the URL; a header rather than a query
// parameter so the cache key stays the plain URL plus `Vary`). A missing or unknown code is not an
// error: the default store answers, so an old client keeps working.
export const storeViewContext: RequestHandler = (req, res, next) => {
  res.vary('X-Store-View');
  const store = storeFromCode(req.get('x-store-view')?.trim().toLowerCase()) ?? DEFAULT_STORE;
  storage.run(store, next);
};

// ---------- delivery: where the shopper's bag will be packed ----------

export interface DeliveryContext {
  /** The postcode the shopper chose, only when we deliver there; null otherwise. */
  postcode: string | null;
  served: boolean;
  area: { slug: string; name: string } | null;
  /** The dark store whose shelves the request reads: the area's store, or the default (Mitte). */
  storeId: string;
}

const NOT_CHOSEN: DeliveryContext = {
  postcode: null,
  served: false,
  area: null,
  storeId: DEFAULT_DELIVERY_STORE_ID,
};

const deliveryStorage = new AsyncLocalStorage<DeliveryContext>();

export function currentDelivery(): DeliveryContext {
  return deliveryStorage.getStore() ?? NOT_CHOSEN;
}

/** The dark store the current request reads stock from. */
export function currentStoreId(): string {
  return currentDelivery().storeId;
}

// `X-Postcode: 10115` (set by the web client, like `X-Store-View`). It only picks which store's
// stock the catalogue shows. The server never trusts it for money or stock moves: checkout uses
// the postcode of the delivery address. Missing, malformed or unserved: browse the default store.
export const deliveryContext: RequestHandler = async (req, res, next) => {
  res.vary('X-Postcode');
  try {
    const raw = req.get('x-postcode')?.trim();
    const parsed = raw ? postcodeSchema.safeParse(raw) : undefined;
    const row = parsed?.success ? await lookupPostcode(parsed.data) : undefined;
    const ctx: DeliveryContext = row
      ? {
          postcode: row.code,
          served: true,
          area: { slug: row.areaSlug, name: row.areaName },
          storeId: row.storeId,
        }
      : NOT_CHOSEN;
    deliveryStorage.run(ctx, next);
  } catch (err) {
    next(err);
  }
};
