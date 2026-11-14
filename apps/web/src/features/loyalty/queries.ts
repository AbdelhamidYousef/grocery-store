import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  donatePoints,
  fetchCharityTotal,
  fetchMyCodes,
  fetchPoints,
  fetchRewards,
  redeemReward,
} from '../../api/loyalty';
import { keys } from '../../lib/query-client';
import { useAuthOptional } from '../auth/AuthProvider';

// The balance, tier and last 50 rows. Only asked for a signed-in shopper (a guest would get a 401
// the app would read as an expired session).
export function usePoints() {
  const { user } = useAuthOptional();
  return useQuery({
    queryKey: keys.points,
    queryFn: ({ signal }) => fetchPoints(signal),
    enabled: user !== null,
  });
}

// The shop window: public, the same for everyone.
export const useRewards = () =>
  useQuery({ queryKey: keys.rewards, queryFn: ({ signal }) => fetchRewards(signal) });

export function useMyCodes() {
  const { user } = useAuthOptional();
  return useQuery({
    queryKey: keys.myCodes,
    queryFn: ({ signal }) => fetchMyCodes(signal),
    enabled: user !== null,
  });
}

// Spending points changes the balance and adds a code: refresh both.
export function useRedeemReward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: redeemReward,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.points }),
        queryClient.invalidateQueries({ queryKey: keys.myCodes }),
      ]),
  });
}

// The shelter's running total (public). A failure only hides the line: nothing depends on it.
export const useCharityTotal = () =>
  useQuery({
    queryKey: keys.charityTotal,
    queryFn: ({ signal }) => fetchCharityTotal(signal),
    staleTime: 60_000,
  });

export function useDonatePoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: donatePoints,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.points }),
        queryClient.invalidateQueries({ queryKey: keys.charityTotal }),
      ]),
  });
}
