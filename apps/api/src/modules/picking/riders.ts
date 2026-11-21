// Made-up first names for the simulated riders. The same order always gets the same rider.
export const RIDER_NAMES = [
  'Mara',
  'Jonas',
  'Leyla',
  'Tomas',
  'Ines',
  'Karim',
  'Sofie',
  'Dario',
  'Nele',
  'Emre',
] as const;

export function riderFor(orderId: string): string {
  let hash = 0;
  for (const ch of orderId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return RIDER_NAMES[hash % RIDER_NAMES.length] ?? RIDER_NAMES[0];
}
