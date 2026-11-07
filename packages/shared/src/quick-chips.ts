import type { Facets } from './schemas/catalog.ts';

// The quick-filter chips above a product list (phase 15): what is worth one click here, in the
// order it should be shown. Pure and shared so the API can send the list ready-made and a test
// can pin the ordering rule without a database.
export type QuickChipKind = 'badge' | 'brand' | 'tag';

export interface QuickChip {
  kind: QuickChipKind;
  /** The URL value: a badge slug (`sale`), a brand slug or a health-need slug. */
  value: string;
  label: string;
  count: number;
}

// Badges that are shopping intents rather than product facts ("Eco" and "Low stock" are neither
// something a shopper starts with; "Bestseller" is on the homepage already).
const CHIP_BADGES = ['sale', 'new'] as const;
export const MAX_BRAND_CHIPS = 3;
export const MAX_TAG_CHIPS = 3;

/**
 * Order: On sale, New, then the biggest brands, then the biggest health needs. Only values that
 * exist in the current scope (count > 0), so a chip never leads to an empty list; the facet
 * lists arrive sorted by count already. At most 2 + 3 + 3 = 8 chips, however large the catalogue.
 */
export function buildQuickChips(facets: Pick<Facets, 'badge' | 'brand' | 'tag'>): QuickChip[] {
  const chips: QuickChip[] = [];
  for (const slug of CHIP_BADGES) {
    const badge = facets.badge.find((b) => b.value === slug && b.count > 0);
    if (badge) {
      chips.push({
        kind: 'badge',
        value: slug,
        label: slug === 'sale' ? 'On sale' : 'New',
        count: badge.count,
      });
    }
  }
  const take = (kind: QuickChipKind, list: Facets['brand'], max: number) => {
    for (const f of list.filter((x) => x.count > 0).slice(0, max)) {
      chips.push({ kind, value: f.value, label: f.label ?? f.value, count: f.count });
    }
  };
  take('brand', facets.brand, MAX_BRAND_CHIPS);
  take('tag', facets.tag, MAX_TAG_CHIPS);
  return chips;
}
