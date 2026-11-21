import type { PickLine } from '@store/shared';
import { describe, expect, it } from 'vitest';

import { buildPickList, isLineResolved, zoneOfStorage } from './pick-list.ts';

const line = (over: Partial<PickLine>): PickLine => ({
  itemId: 'i',
  orderNumber: 'GR-2026-000001',
  bag: 1,
  productName: 'Item',
  variantName: '1 kg',
  sku: 'SKU',
  imageUrl: null,
  quantity: 1,
  pickedQty: null,
  pickStatus: 'pending',
  weighed: false,
  pricePerKgCents: null,
  packedGrams: null,
  replaces: null,
  swapStatus: null,
  substitution: 'best_match',
  zone: 'ambient',
  aisle: 1,
  batches: [],
  resolved: false,
  ...over,
});

describe('buildPickList', () => {
  it('walks ambient, then chilled, then frozen, by aisle inside a zone', () => {
    const list = buildPickList([
      line({ itemId: '1', sku: 'ICE', productName: 'Ice cream', zone: 'frozen', aisle: 1 }),
      line({ itemId: '2', sku: 'MILK', productName: 'Milk', zone: 'chilled', aisle: 2 }),
      line({ itemId: '3', sku: 'PASTA', productName: 'Pasta', zone: 'ambient', aisle: 9 }),
      line({ itemId: '4', sku: 'RICE', productName: 'Rice', zone: 'ambient', aisle: 3 }),
      line({ itemId: '5', sku: 'EGGS', productName: 'Eggs', zone: 'chilled', aisle: 1 }),
    ]);
    expect(list.map((e) => e.productName)).toEqual(['Rice', 'Pasta', 'Eggs', 'Milk', 'Ice cream']);
  });

  it('puts a product with no aisle last in its zone, and breaks ties by name', () => {
    const list = buildPickList([
      line({ sku: 'B', productName: 'Beans', aisle: null }),
      line({ sku: 'Z', productName: 'Zucchini', aisle: 4 }),
      line({ sku: 'A', productName: 'Apples', aisle: 4 }),
    ]);
    expect(list.map((e) => e.productName)).toEqual(['Apples', 'Zucchini', 'Beans']);
  });

  it('merges one product across bags and says which bag each unit goes to', () => {
    const list = buildPickList([
      line({ itemId: 'a', orderNumber: 'GR-2026-000002', bag: 2, sku: 'M', quantity: 2 }),
      line({ itemId: 'b', orderNumber: 'GR-2026-000001', bag: 1, sku: 'M', quantity: 3 }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.totalQty).toBe(5);
    expect(list[0]?.remainingQty).toBe(5);
    expect(list[0]?.stops.map((s) => [s.bag, s.quantity])).toEqual([
      [1, 3],
      [2, 2],
    ]);
  });

  it('counts only unresolved lines as remaining', () => {
    const list = buildPickList([
      line({ itemId: 'a', sku: 'M', quantity: 2, resolved: true }),
      line({ itemId: 'b', sku: 'M', quantity: 3 }),
    ]);
    expect(list[0]?.remainingQty).toBe(3);
  });
});

describe('isLineResolved', () => {
  const base = {
    pickStatus: 'pending',
    pickedQty: null,
    weighed: false,
    packedGrams: null,
    swapStatus: null,
  } as const;
  it('needs a pick, and grams for a weighed line', () => {
    expect(isLineResolved(base)).toBe(false);
    expect(isLineResolved({ ...base, pickStatus: 'picked' })).toBe(true);
    expect(isLineResolved({ ...base, pickStatus: 'picked', weighed: true })).toBe(false);
    expect(isLineResolved({ ...base, pickStatus: 'picked', weighed: true, packedGrams: 480 })).toBe(
      true,
    );
  });
  it('settles a missing line and a refused replacement without grams', () => {
    expect(isLineResolved({ ...base, pickStatus: 'missing', weighed: true })).toBe(true);
    expect(isLineResolved({ ...base, swapStatus: 'rejected', weighed: true })).toBe(true);
  });
  it('still needs grams for a short weighed line', () => {
    expect(isLineResolved({ ...base, pickStatus: 'short', pickedQty: 1, weighed: true })).toBe(
      false,
    );
  });
});

describe('zoneOfStorage', () => {
  it('falls back to how the product is kept', () => {
    expect(zoneOfStorage('frozen')).toBe('frozen');
    expect(zoneOfStorage('chilled')).toBe('chilled');
    expect(zoneOfStorage('ambient')).toBe('ambient');
    expect(zoneOfStorage(undefined)).toBe('ambient');
  });
});
