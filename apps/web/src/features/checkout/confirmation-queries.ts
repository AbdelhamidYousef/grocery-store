import type { OrderStatus } from '@store/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { fetchOrderStatus, fetchPlacedOrder } from '../../api/checkout';
import { ApiError } from '../../api/client';
import { keys } from '../../lib/query-client';

// ---------- the confirmation page ----------

export const POLL_EVERY_MS = 2_000;
export const POLL_FOR_MS = 30_000;

// While the webhook has not arrived the order is `pending_payment`; anything else is settled as
// far as this page is concerned (paid, cancelled, ...), so polling stops.
export const isPendingStatus = (status: OrderStatus | undefined) =>
  status === undefined || status === 'pending_payment';

// Polls the status endpoint every 2 s until the order leaves `pending_payment` or 30 s have
// passed (then the page says "still confirming" and the email will follow). `startedAt` is passed
// in so the deadline survives re-renders.
export function useOrderStatus(number: string, startedAt: number) {
  return useQuery({
    queryKey: keys.order.status(number),
    queryFn: ({ signal }) => fetchOrderStatus(number, signal),
    refetchInterval: (query) =>
      !isPendingStatus(query.state.data?.status) || Date.now() - startedAt >= POLL_FOR_MS
        ? false
        : POLL_EVERY_MS,
    // A 404 means "not your order in this browser": polling will not change that.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
    staleTime: 0,
    gcTime: 0,
  });
}

export function usePlacedOrder(number: string) {
  return useQuery({
    queryKey: keys.order.detail(number),
    queryFn: ({ signal }) => fetchPlacedOrder(number, signal),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

// Once the order is paid the server has converted the cart, so the cached cart (and the header
// badge) is stale: refetch it, and the order list of a signed-in shopper has a new row. Runs once
// per mount of the confirmation page.
export function useRefreshAfterPaid(paid: boolean) {
  const queryClient = useQueryClient();
  const done = useRef(false);
  useEffect(() => {
    if (!paid || done.current) return;
    done.current = true;
    void queryClient.invalidateQueries({ queryKey: keys.cart });
    void queryClient.invalidateQueries({ queryKey: keys.account.orders });
  }, [paid, queryClient]);
}
