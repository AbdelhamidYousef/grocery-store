import { useEffect, useState } from 'react';

// The value, but only after it has stopped changing for `ms`. The setState sits inside the timer
// callback (not the effect body), and the cleanup cancels the pending update when the value
// changes again: that is the whole debounce.
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
