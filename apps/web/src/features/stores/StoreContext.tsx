import { DEFAULT_STORE, storeFromCode } from '@store/shared';
import type { StoreView } from '@store/shared';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { Outlet, useHref } from 'react-router-dom';

interface StoreContextValue {
  store: StoreView;
  /** '/eu-en' under a store prefix, '' on the admin and unknown paths. */
  basePath: string;
}

const StoreContext = createContext<StoreContextValue>({ store: DEFAULT_STORE, basePath: '' });

export function useStore(): StoreView {
  return useContext(StoreContext).store;
}

/**
 * Turns an app path into the full browser path (`/products/x` -> `/eu-en/products/x`). Only for
 * URLs built by hand (share links, canonical URLs, `window.location`); <Link> and `navigate()`
 * already add the prefix through the router's basename.
 */
export function useStorePath(): (path: string) => string {
  const { basePath } = useContext(StoreContext);
  return useCallback((path: string) => `${basePath}${path === '/' ? '' : path}` || '/', [basePath]);
}

// The router's basename is the single source of truth for the prefix; `useHref('/')` hands it back
// ('/eu-en', or '/' with no basename), so the layout needs no separate parsing of the URL.
export function StoreLayout() {
  const root = useHref('/');
  const code = root.split('/')[1] ?? '';
  const known = storeFromCode(code);
  const value = useMemo<StoreContextValue>(
    () => ({ store: known ?? DEFAULT_STORE, basePath: known ? `/${known.code}` : '' }),
    [known],
  );

  const locale = value.store.locale;
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [locale]);

  return (
    <StoreContext.Provider value={value}>
      <Outlet />
    </StoreContext.Provider>
  );
}
