// The postcode the shopper chose: kept in memory (read on every API call) and in local storage (so
// it survives a reload). The server only uses it to pick which dark store's stock to show; checkout
// uses the postcode of the delivery address instead. Storage can be blocked or throw (private
// windows), so every access is wrapped and the memory copy keeps working without it.
export const POSTCODE_KEY = 'grocery_postcode';
export const POSTCODE_PATTERN = /^\d{5}$/;

let memory: string | null | undefined;

export function readPostcode(): string | null {
  if (memory !== undefined) return memory;
  try {
    const stored = window.localStorage.getItem(POSTCODE_KEY);
    memory = stored && POSTCODE_PATTERN.test(stored) ? stored : null;
  } catch {
    memory = null;
  }
  return memory;
}

export function writePostcode(code: string | null): void {
  memory = code;
  try {
    if (code) window.localStorage.setItem(POSTCODE_KEY, code);
    else window.localStorage.removeItem(POSTCODE_KEY);
  } catch {
    // Not remembered across reloads; the memory copy still serves this page.
  }
}

/** `X-Postcode` for every API call, only when one is chosen. */
export function postcodeHeader(): Record<string, string> {
  const code = readPostcode();
  return code ? { 'X-Postcode': code } : {};
}

/** Forgets the in-memory copy (tests: one test must not see another's choice). */
export function resetPostcodeMemory(): void {
  memory = undefined;
}
