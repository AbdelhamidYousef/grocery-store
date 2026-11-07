import { describe, expect, it } from 'vitest';

import { buildQuickChips } from './quick-chips.ts';

const f = (value: string, count: number, label = value) => ({ value, count, label });

describe('buildQuickChips', () => {
  it('orders On sale, New, then the biggest brands, then the biggest health needs', () => {
    const chips = buildQuickChips({
      badge: [f('bestseller', 9), f('new', 4, 'New'), f('sale', 2, 'Sale')],
      brand: [f('a', 9, 'Aco'), f('b', 5, 'Bco'), f('c', 3, 'Cco')],
      tag: [f('dental', 6, 'Dental care'), f('joint', 1, 'Joint care')],
    });
    expect(chips.map((c) => `${c.kind}:${c.value}`)).toEqual([
      'badge:sale',
      'badge:new',
      'brand:a',
      'brand:b',
      'brand:c',
      'tag:dental',
      'tag:joint',
    ]);
    expect(chips[0]).toEqual({ kind: 'badge', value: 'sale', label: 'On sale', count: 2 });
  });

  it('caps brands and tags at three each, so at most eight chips', () => {
    const many = Array.from({ length: 12 }, (_, i) => f(`x${i}`, 20 - i));
    const chips = buildQuickChips({
      badge: [f('sale', 1), f('new', 1)],
      brand: many,
      tag: many,
    });
    expect(chips).toHaveLength(8);
    expect(chips.filter((c) => c.kind === 'brand')).toHaveLength(3);
  });

  it('never offers a value with no products, and may be empty', () => {
    expect(buildQuickChips({ badge: [f('sale', 0)], brand: [f('a', 0)], tag: [] })).toEqual([]);
  });
});
