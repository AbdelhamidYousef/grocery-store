import type { User } from '@store/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { login, logout, register } from '../../api/auth';
import { keys } from '../../lib/query-client';

// After a login or registration the API has already merged the guest cart into the user's, so the
// cached cart (the guest one) is stale: refetch it. The user comes straight from the response and
// is written into the cache, which flips the header and the guards without another request.
function useSignedIn() {
  const queryClient = useQueryClient();
  return (user: User) => {
    queryClient.setQueryData(keys.me, user);
    return queryClient.invalidateQueries({ queryKey: keys.cart });
  };
}

export function useLogin() {
  const signedIn = useSignedIn();
  return useMutation({ mutationFn: login, onSuccess: signedIn });
}

export function useRegister() {
  const signedIn = useSignedIn();
  return useMutation({ mutationFn: register, onSuccess: signedIn });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(keys.me, null);
      // Another person may sit down at this browser: drop everything that belonged to the account.
      queryClient.removeQueries({ queryKey: keys.account.all });
      queryClient.removeQueries({ queryKey: keys.admin.all });
      queryClient.removeQueries({ queryKey: keys.cartNotices });
      return queryClient.invalidateQueries({ queryKey: keys.cart });
    },
  });
}
