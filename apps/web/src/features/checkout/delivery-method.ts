import type { StringKey, TFunction } from '../../i18n';

const KEYS: Record<string, StringKey> = {
  slot: 'checkout.method.slot',
  express: 'checkout.method.express',
};

/** The delivery kind in the shopper's language; a method with no entry keeps its stored name. */
export function deliveryMethodName(method: { code: string; name: string }, t: TFunction): string {
  const key = KEYS[method.code];
  return key ? t(key) : method.name;
}
