import { useEffect, useState } from 'react';

// True once `active` has stayed true for `ms`. Used for "this is taking a while" copy: the free
// API host sleeps when idle and the first call after a nap can take 30 s or more, so a request
// that is merely slow should explain itself instead of looking broken.
export function useSlow(active: boolean, ms: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), ms);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, ms]);
  return slow;
}
