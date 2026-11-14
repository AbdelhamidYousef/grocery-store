import { DEFAULT_STORE, isStoreCode, storeFromCode, storeFromLanguages } from '@store/shared';
import type { StoreView } from '@store/shared';

// How a URL becomes a store view. The storefront routes are written once, without a prefix, and
// the data router is given a `basename` of `/<store code>`: every <Link>, <Navigate> and
// `navigate()` in the app then gets the prefix for free, so no feature file needs to know about
// store views, and screens added later work without a change. This module decides the basename
// for the URL the page loaded with, and rewrites old unprefixed URLs (`/c/dogs`) to the
// remembered store before the router starts.

export interface EntryUrl {
  pathname: string;
  search: string;
  hash: string;
}

export interface StoreEntry {
  /** '' for admin and unknown prefixes, otherwise `/eu-en`. Passed to the router. */
  basename: string;
  /** Set when the address bar must first change (legacy URL or a prefixed admin URL). */
  replaceWith: string | null;
}

const LOOKS_LIKE_STORE = /^[a-z]{2}-[a-z]{2}$/;

function isAdminPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/');
}

/** The store view the visitor probably wants when the URL does not say: cookie, language, default. */
export function pickStore(remembered: string | null, languages: readonly string[]): StoreView {
  return storeFromCode(remembered) ?? storeFromLanguages(languages);
}

export function resolveEntry(
  url: EntryUrl,
  pick: () => StoreView = () => DEFAULT_STORE,
): StoreEntry {
  const { pathname, search, hash } = url;
  const segment = pathname.split('/')[1] ?? '';

  if (isStoreCode(segment)) {
    const rest = pathname.slice(segment.length + 1) || '/';
    // The admin lives at /admin, un-prefixed: a link from the storefront that landed on
    // /eu-en/admin is tidied on the next full load.
    if (isAdminPath(rest)) return { basename: '', replaceWith: `${rest}${search}${hash}` };
    return { basename: `/${segment}`, replaceWith: null };
  }
  if (isAdminPath(pathname)) return { basename: '', replaceWith: null };
  // `xx-yy` that is not a store: no basename, so it falls through to the not-found route
  // instead of being treated as a legacy path and redirected.
  if (LOOKS_LIKE_STORE.test(segment)) return { basename: '', replaceWith: null };

  const code = pick().code;
  const tail = pathname === '/' ? '' : pathname;
  return { basename: `/${code}`, replaceWith: `/${code}${tail}${search}${hash}` };
}

/** `/de-de/c/dogs?x=1` with the store swapped: the rest of the path and query are kept. */
export function swapStorePrefix(url: EntryUrl, basename: string, next: StoreView): string {
  const rest =
    basename && url.pathname.startsWith(basename)
      ? url.pathname.slice(basename.length)
      : url.pathname;
  const tail = rest === '/' || rest === '' ? '' : rest;
  return `/${next.code}${tail}${url.search}${url.hash}`;
}
