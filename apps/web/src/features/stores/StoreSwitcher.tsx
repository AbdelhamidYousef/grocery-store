import { STORES, storeFromCode } from '@store/shared';
import { useLocation } from 'react-router-dom';

import { cn } from '../../lib/cn';
import { writeStoreCookie } from '../../lib/store-cookie';
import { swapStorePrefix } from '../../lib/store-entry';
import { track } from '../../lib/track';

import { useStore } from './StoreContext';

// Moves the shopper to the same page in another store view and remembers the choice. A full page
// load, not a client-side navigation: the prefix is the router's basename (fixed per page load)
// and a new store view means a new language and currency, so every query should start fresh.
function reload(url: string): void {
  window.location.assign(url);
}

export function StoreSwitcher({
  testId = 'store-switcher',
  className,
  onNavigate = reload,
}: {
  testId?: string;
  className?: string;
  /** Test seam: where to go instead of a real page load. */
  onNavigate?: (url: string) => void;
}) {
  const current = useStore();
  // `useLocation` is already relative to the basename, so it is the "rest of the path".
  const location = useLocation();

  return (
    <select
      aria-label="Country and language"
      data-testid={testId}
      value={current.code}
      onChange={(event) => {
        const next = storeFromCode(event.target.value);
        if (!next || next.code === current.code) return;
        writeStoreCookie(next);
        track({ name: 'store_switched', from: current.code, to: next.code });
        onNavigate(swapStorePrefix(location, '', next));
      }}
      className={cn(
        'min-h-11 rounded-control border border-line bg-surface px-2 font-semibold text-ink',
        className,
      )}
    >
      {STORES.map((store) => (
        <option key={store.code} value={store.code}>
          {store.label}
        </option>
      ))}
    </select>
  );
}
