import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';

import { fetchPostcode } from '../../api/delivery';
import { useT } from '../../i18n';
import { POSTCODE_PATTERN, readPostcode, writePostcode } from '../../lib/postcode';
import { keys } from '../../lib/query-client';

export interface DeliveryValue {
  /** The postcode the shopper chose (also when we do not deliver there); null before a choice. */
  postcode: string | null;
  /** True once the API confirmed that this postcode is inside a delivery area. */
  served: boolean;
  /** The area and the store of a served postcode. */
  area: { slug: string; name: string } | null;
  store: { slug: string; name: string } | null;
  /** `loading` while the postcode is being checked, `error` when the check itself failed. */
  status: 'none' | 'loading' | 'ready' | 'error';
  setPostcode: (code: string) => void;
  clear: () => void;
}

const NONE: DeliveryValue = {
  postcode: null,
  served: false,
  area: null,
  store: null,
  status: 'none',
  setPostcode: () => undefined,
  clear: () => undefined,
};

const DeliveryContext = createContext<DeliveryValue>(NONE);

/** The shopper's delivery postcode and what it means (area, store). Without a provider: nothing chosen. */
export function useDelivery(): DeliveryValue {
  return useContext(DeliveryContext);
}

// Queries that must not be refetched when the postcode changes: the postcode lookups themselves
// and everything that never reads a shelf.
const UNSCOPED_ROOTS = new Set(['delivery', 'admin', 'me', 'account', 'session-expired', 'health']);

// Where the shopper's postcode lives. `?postcode=10115` in the URL wins (so a shared link shows the
// same shop) and is remembered; otherwise the remembered one is used. Every API call sends it as
// `X-Postcode` (see api/client.ts), which only decides whose shelves the catalogue shows: checkout
// uses the postcode of the delivery address. Changing it refetches what is on screen.
export function DeliveryProvider({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const fromUrl = params.get('postcode');
  const urlCode = fromUrl && POSTCODE_PATTERN.test(fromUrl) ? fromUrl : null;
  const [postcode, setCode] = useState<string | null>(() => {
    const initial = urlCode ?? readPostcode();
    // The URL choice is remembered at once, so the first API call of this page already sends it.
    if (urlCode) writePostcode(urlCode);
    return initial;
  });
  const previous = useRef(postcode);

  const apply = useCallback(
    (next: string | null) => {
      writePostcode(next);
      setCode(next);
    },
    [setCode],
  );

  // A new `?postcode=` in the URL (the hero box, a pasted link) is a new choice.
  useEffect(() => {
    if (urlCode && urlCode !== previous.current) apply(urlCode);
  }, [urlCode, apply]);

  // The shelves differ per store: when the postcode changes, what is on screen is stale.
  useEffect(() => {
    if (previous.current === postcode) return;
    previous.current = postcode;
    void queryClient.invalidateQueries({
      predicate: (q) => !UNSCOPED_ROOTS.has(String(q.queryKey[0])),
    });
  }, [postcode, queryClient]);

  const lookup = useQuery({
    queryKey: keys.delivery.postcode(postcode ?? ''),
    queryFn: ({ signal }) => fetchPostcode(postcode ?? '', signal),
    enabled: postcode !== null,
    staleTime: 5 * 60_000,
  });

  const setPostcode = useCallback(
    (code: string) => {
      if (POSTCODE_PATTERN.test(code)) apply(code);
    },
    [apply],
  );
  const clear = useCallback(() => apply(null), [apply]);

  const value = useMemo<DeliveryValue>(() => {
    const data = lookup.data;
    const served = data?.served === true;
    return {
      postcode,
      served,
      area: data?.served ? data.area : null,
      store: data?.served ? data.store : null,
      status:
        postcode === null
          ? 'none'
          : lookup.isError
            ? 'error'
            : lookup.isPending
              ? 'loading'
              : 'ready',
      setPostcode,
      clear,
    };
  }, [postcode, lookup.data, lookup.isError, lookup.isPending, setPostcode, clear]);

  return <DeliveryContext.Provider value={value}>{children}</DeliveryContext.Provider>;
}

/**
 * "Sold out", or "Sold out at Mitte" once a postcode is chosen: the shelf that is empty belongs to
 * the shopper's store, and another store may still have it.
 */
export function useSoldOutLabel(): (plainLabel: string) => string {
  const { t } = useT();
  const { area } = useDelivery();
  return (plainLabel) => (area ? t('delivery.soldOutAt', { area: area.name }) : plainLabel);
}
