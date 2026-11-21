import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { WebCart } from '../../api/cart';
import {
  fetchSubstitutes,
  fetchSubstitutionSettings,
  saveSubstitutionSettings,
  setAllSubstitutions,
  setLineSubstitution,
} from '../../api/substitutions';
import { useToast } from '../../components/ui/Toast';
import { useT } from '../../i18n';
import { keys } from '../../lib/query-client';
import { cartErrorMessage } from '../cart/queries';

// Same scope id as every other cart write (see features/cart/queries.ts): one at a time, in order.
const CART_SCOPE = { id: 'cart' } as const;

export function useSubstitutionActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const i18n = useT();
  const onSuccess = (cart: WebCart) => queryClient.setQueryData(keys.cart, cart);
  const onError = (error: unknown) => toast.show(cartErrorMessage(error, i18n), 'error');
  const line = useMutation({
    scope: CART_SCOPE,
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof setLineSubstitution>[1]) =>
      setLineSubstitution(id, input),
    onSuccess,
    onError,
  });
  const all = useMutation({
    scope: CART_SCOPE,
    mutationFn: setAllSubstitutions,
    onSuccess: (cart) => {
      onSuccess(cart);
      toast.show(i18n.t('subs.toast.all'), 'success');
    },
    onError,
  });
  return {
    pending: line.isPending || all.isPending,
    setLine: (id: string, input: Parameters<typeof setLineSubstitution>[1]) =>
      line.mutate({ id, ...input }),
    setAll: (substitution: 'best_match' | 'none') => all.mutate(substitution),
  };
}

export function useSubstitutes(slug: string, variantId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['substitutes', slug, variantId],
    queryFn: ({ signal }) => fetchSubstitutes(slug, variantId, signal),
    enabled,
    staleTime: 30_000,
  });
}

export function useSubstitutionSettings() {
  return useQuery({
    queryKey: keys.account.substitution,
    queryFn: ({ signal }) => fetchSubstitutionSettings(signal),
  });
}

export function useSaveSubstitutionSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveSubstitutionSettings,
    onSuccess: (settings) => queryClient.setQueryData(keys.account.substitution, settings),
  });
}
