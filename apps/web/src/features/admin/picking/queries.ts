import type { AdminShortfallInput, PickLineAction } from '@store/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchLineSubstitutes,
  fetchPickStores,
  fetchPicking,
  markPickLine,
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

export function usePicking(slug: string | undefined, window: 'next' | 'all') {
  return useQuery({
    queryKey: keys.admin.picking(slug ?? '', window),
    queryFn: ({ signal }) => fetchPicking(slug ?? '', window, signal),
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
