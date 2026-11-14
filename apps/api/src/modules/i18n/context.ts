import { AsyncLocalStorage } from 'node:async_hooks';

import { DEFAULT_STORE, storeFromCode, type StoreView } from '@store/shared';
import type { RequestHandler } from 'express';

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
