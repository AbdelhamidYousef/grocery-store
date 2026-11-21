import { describe, expect, it } from 'vitest';

import { aisleLayout } from './aisles.ts';
import { departmentSeeds } from './catalogue.ts';

const subcategories = departmentSeeds.flatMap((d) => d.children.map((c) => c.slug));

describe('aisleLayout', () => {
  it('gives every subcategory exactly one aisle in every store', () => {
    for (const store of [0, 1, 2, 3]) {
      const layout = aisleLayout(store);
      expect(layout.map((a) => a.subcategorySlug).sort()).toEqual([...subcategories].sort());
    }
  });

  it('numbers aisles from 1 inside a zone without gaps', () => {
    for (const zone of ['ambient', 'chilled', 'frozen'] as const) {
      const nums = aisleLayout(2)
        .filter((a) => a.zone === zone)
        .map((a) => a.aisle)
        .sort((x, y) => x - y);
      expect(nums.length).toBeGreaterThan(0);
      expect(nums).toEqual(nums.map((_, i) => i + 1));
    }
  });

  it('keeps cold food in the cold zones', () => {
    const zoneOf = (slug: string) => aisleLayout(0).find((a) => a.subcategorySlug === slug)?.zone;
    const dept = (d: string) => departmentSeeds.find((x) => x.slug === d)?.children ?? [];
    for (const c of dept('dairy-eggs')) expect(zoneOf(c.slug)).toBe('chilled');
    for (const c of dept('frozen')) expect(zoneOf(c.slug)).toBe('frozen');
    for (const c of dept('pantry')) expect(zoneOf(c.slug)).toBe('ambient');
  });

  it('is the same layout for the same store and a different one for another', () => {
    expect(aisleLayout(1)).toEqual(aisleLayout(1));
    expect(aisleLayout(1)).not.toEqual(aisleLayout(0));
  });
});
