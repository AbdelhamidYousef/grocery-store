import type { AdminShortfallInput, PickLineAction } from '@store/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchLineSubstitutes,
  fetchPickStores,
  fetchPicking,
  dispatchOrder,
  markPickLine,
  packOrder,
  recordLineShortfall,
} from '../../../api/picking';
import { keys } from '../../../lib/query-client';

// The packer works against a live shelf: orders arrive and answers come in while the page is open,
// so the list is re-read every 15 seconds and after every write.
const REFRESH_MS = 15_000;

export function usePickStores() {
  return useQuery({
    queryKey: keys.admin.pickStores,
    queryFn: ({ signal }) => fetchPickStores(signal),
    staleTime: 60_000,
  });
}

export function usePicking(slug: string | undefined, window: 'next' | 'all', order = '') {
  return useQuery({
    queryKey: keys.admin.picking(slug ?? '', window, order),
    queryFn: ({ signal }) => fetchPicking(slug ?? '', window, order || undefined, signal),
    enabled: !!slug,
    staleTime: 0,
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

function useRefreshPicking() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.admin.pickingAll });
}

export function useMarkLine() {
  const refresh = useRefreshPicking();
  return useMutation({
    mutationFn: (v: { number: string; itemId: string; input: PickLineAction }) =>
      markPickLine(v.number, v.itemId, v.input),
    onSettled: refresh,
  });
}

export function useRecordShortfall() {
  const refresh = useRefreshPicking();
  return useMutation({
    mutationFn: (v: { number: string; itemId: string; input: AdminShortfallInput }) =>
      recordLineShortfall(v.number, v.itemId, v.input),
    onSettled: refresh,
  });
}

export function useLineSubstitutes(number: string, itemId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.admin.lineSubstitutes(itemId),
    queryFn: ({ signal }) => fetchLineSubstitutes(number, itemId, signal),
    enabled,
    staleTime: 0,
  });
}

function useRefreshOrders() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.admin.pickingAll }),
      queryClient.invalidateQueries({ queryKey: keys.admin.orders }),
    ]);
}

export function usePackOrder() {
  const refresh = useRefreshOrders();
  return useMutation({ mutationFn: (number: string) => packOrder(number), onSettled: refresh });
}

export function useDispatchOrder() {
  const refresh = useRefreshOrders();
  return useMutation({ mutationFn: (number: string) => dispatchOrder(number), onSettled: refresh });
}
