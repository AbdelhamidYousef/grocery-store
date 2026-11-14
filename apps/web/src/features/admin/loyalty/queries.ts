import type { AdminPointsAdjust, AdminRewardInput } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  adjustPoints,
  createAdminReward,
  deleteAdminReward,
  fetchAdminRewards,
  updateAdminReward,
} from '../../../api/loyalty';
import { keys } from '../../../lib/query-client';

export const useAdminRewards = () =>
  useQuery({
    queryKey: keys.adminRewards,
    queryFn: ({ signal }) => fetchAdminRewards(signal),
    staleTime: 0,
  });

// The public shop window changes with every write, so it is refreshed too.
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.adminRewards }),
      queryClient.invalidateQueries({ queryKey: keys.rewards }),
    ]);
}

export function useSaveReward() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | undefined; input: AdminRewardInput }) =>
      id ? updateAdminReward(id, input) : createAdminReward(input),
    onSuccess: refresh,
  });
}

export function useDeleteReward() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: deleteAdminReward, onSuccess: refresh });
}

export const useAdjustPoints = () =>
  useMutation({ mutationFn: (input: AdminPointsAdjust) => adjustPoints(input) });
