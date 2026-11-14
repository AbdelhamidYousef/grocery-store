import type { User } from '@store/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { fetchMe } from '../../api/auth';
import { keys } from '../../lib/query-client';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  user: User | null;
  status: AuthStatus;
}

const AuthContext = createContext<AuthState | null>(null);

// Asks the API who we are once on boot (`GET /auth/me`; a 401 means "nobody", not an error) and
// shares the answer with the whole tree. The session lives in an httpOnly cookie the page cannot
// read, so asking the server is the only way to know. staleTime Infinity: login and logout write
// the cache directly, so a background refetch would only add a request that can disagree.
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = useQuery({
    queryKey: keys.me,
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: Infinity,
  });
  const value = useMemo<AuthState>(
    () => ({
      user: data ?? null,
      status: isPending ? 'loading' : data ? 'authenticated' : 'anonymous',
    }),
    [data, isPending],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

// For components that may render outside a provider (a card in a unit test): no provider means
// nobody is known to be signed in.
export function useIsSignedIn(): boolean {
  return useContext(AuthContext)?.user != null;
}

// Like `useAuth` but tolerant of a missing provider (a card or a price line rendered alone in a
// unit test): no provider means "not signed in", never a crash.
export function useAuthOptional(): AuthState {
  return useContext(AuthContext) ?? { user: null, status: 'anonymous' };
}
