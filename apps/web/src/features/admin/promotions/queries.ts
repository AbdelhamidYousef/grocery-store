import type { AdminBulkTierInput, AdminDiscountCodeInput, AdminGiftRuleInput } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  clearAdminGift,
  createAdminCode,
  createAdminTier,
  deleteAdminCode,
  deleteAdminTier,
  fetchAdminCodes,
  fetchAdminGift,
  fetchAdminTiers,
  setAdminGift,
  updateAdminCode,
  updateAdminTier,
} from '../../../api/admin-promotions';
import { keys } from '../../../lib/query-client';

// Never "fresh" (like the other admin hooks). A rule change also changes what carts show, so the
// cart cache is marked stale too.
const FRESH = 0;

export const useAdminCodes = () =>
  useQuery({
    queryKey: keys.admin.promotions.codes,
    queryFn: ({ signal }) => fetchAdminCodes(signal),
    staleTime: FRESH,
  });
export const useAdminTiers = () =>
  useQuery({
    queryKey: keys.admin.promotions.tiers,
    queryFn: ({ signal }) => fetchAdminTiers(signal),
    staleTime: FRESH,
  });
export const useAdminGift = () =>
  useQuery({
    queryKey: keys.admin.promotions.gift,
    queryFn: ({ signal }) => fetchAdminGift(signal),
    staleTime: FRESH,
  });

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] }),
      queryClient.invalidateQueries({ queryKey: keys.cart }),
    ]);
}

export function useSaveCode() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | undefined; input: AdminDiscountCodeInput }) =>
      id ? updateAdminCode(id, input) : createAdminCode(input),
    onSuccess: refresh,
  });
}
export function useDeleteCode() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: deleteAdminCode, onSuccess: refresh });
}
export function useSaveTier() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | undefined; input: AdminBulkTierInput }) =>
      id ? updateAdminTier(id, input) : createAdminTier(input),
    onSuccess: refresh,
  });
}
export function useDeleteTier() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: deleteAdminTier, onSuccess: refresh });
}
export function useSetGift() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: AdminGiftRuleInput) => setAdminGift(input),
    onSuccess: refresh,
  });
}
export function useClearGift() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: clearAdminGift, onSuccess: refresh });
}
