import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { fetchHealth } from '../../api/health';
import { keys } from '../../lib/query-client';
import { TEST_IDS } from '../../lib/test-ids';

// Polling pace: a calm check every 30 s while all is well, a quick one every 5 s once it is not,
// so the banner disappears soon after the server is back without hammering a struggling one.
export const HEALTHY_POLL_MS = 30_000;
export const DOWN_POLL_MS = 5_000;

// A thin strip above the header when the API does not answer (it is down, restarting, or the
// shopper's connection dropped). Only an ANSWERED failure counts: while the first request is
// still in flight (a free-tier server waking up takes a while) nothing is shown, so a slow start
// does not flash a scary banner. It recovers by itself, and on recovery re-runs the queries that
// failed in the meantime, so a page that showed "We could not load..." fills in without a click.
export function ApiStatusBanner() {
  const queryClient = useQueryClient();
  const { isError } = useQuery({
    queryKey: keys.health,
    queryFn: ({ signal }) => fetchHealth(signal),
    // No retries: this query IS the retry loop. Not cached afterwards: a stale "ok" is useless.
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (query) => (query.state.status === 'error' ? DOWN_POLL_MS : HEALTHY_POLL_MS),
  });

  const wasDown = useRef(false);
  useEffect(() => {
    if (isError) {
      wasDown.current = true;
    } else if (wasDown.current) {
      wasDown.current = false;
      void queryClient.refetchQueries({
        predicate: (q) => q.state.status === 'error' && q.queryKey[0] !== keys.health[0],
      });
    }
  }, [isError, queryClient]);

  if (!isError) return null;
  return (
    <div
      role="status"
      data-testid={TEST_IDS.apiDownBanner}
      className="border-b-2 border-ink bg-danger-soft px-4 py-2 text-center font-semibold text-danger"
    >
      We cannot reach the shop&apos;s server right now. Your cart is safe. We keep trying, and this
      message disappears by itself when it is back.
    </div>
  );
}
