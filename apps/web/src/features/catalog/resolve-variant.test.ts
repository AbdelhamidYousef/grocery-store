import { describe, expect, it } from 'vitest';

import { makeVariant } from '../../test/fixtures';

import {
  defaultVariant,
  findVariant,
  optionStatus,
  optionValues,
  selectionOf,
  variantFromSku,
} from './resolve-variant';

const v = (sku: string, color: string, size: string, extra = {}) =>
  makeVariant({ id: sku, sku, options: { color, size }, ...extra });

const variants = [
  v('RED-S', 'red', 'S'),
  v('RED-L', 'red', 'L', { available: false }),
  v('BLUE-S', 'blue', 'S', { isDefault: true }),
  // No blue-large combination exists.
];

describe('resolve-variant', () => {
  it('prefers the default flag, then the first purchasable, then the first', () => {
    expect(defaultVariant(variants)?.sku).toBe('BLUE-S');
    expect(defaultVariant([v('A', 'r', 'S', { available: false }), v('B', 'r', 'M')])?.sku).toBe(
      'B',
    );
    expect(defaultVariant([v('A', 'r', 'S', { available: false })])?.sku).toBe('A');
    expect(defaultVariant([])).toBeUndefined();
  });

  it('lists option values from the data, sorting known sizes', () => {
    expect(optionValues(variants, 'color')).toEqual(['red', 'blue']);
    expect(optionValues(variants, 'size')).toEqual(['S', 'L']);
    const unordered = [v('1', 'r', 'L'), v('2', 'r', 'S'), v('3', 'r', 'M')];
    expect(optionValues(unordered, 'size')).toEqual(['S', 'M', 'L']);
  });

  it('lists a full pack before its free sample, whatever order the data has', () => {
    const packs = [
      makeVariant({ id: 't', sku: 'T', options: { pack: 'trial' } }),
      makeVariant({ id: 'f', sku: 'F', options: { pack: 'full' } }),
    ];
    expect(optionValues(packs, 'pack')).toEqual(['full', 'trial']);
  });

  it('works for any option keys, not just colour and size', () => {
    const flavours = [
      makeVariant({ sku: 'A', options: { flavour: 'beef', pack: '150g' } }),
      makeVariant({ sku: 'B', options: { flavour: 'salmon', pack: '150g' } }),
    ];
    expect(optionValues(flavours, 'flavour')).toEqual(['beef', 'salmon']);
    expect(findVariant(flavours, { flavour: 'salmon', pack: '150g' })?.sku).toBe('B');
  });

  it('resolves a full selection to a variant, or nothing for a missing combination', () => {
    expect(findVariant(variants, { color: 'red', size: 'L' })?.sku).toBe('RED-L');
    expect(findVariant(variants, { color: 'blue', size: 'L' })).toBeUndefined();
  });

  it('reports what picking an option would lead to', () => {
    const selection = selectionOf(variants[2] as never, ['color', 'size']);
    expect(selection).toEqual({ color: 'blue', size: 'S' });
    expect(optionStatus(variants, selection, 'color', 'red')).toBe('available');
    expect(optionStatus(variants, selection, 'size', 'L')).toBe('unavailable');
    expect(optionStatus(variants, { color: 'red', size: 'S' }, 'size', 'L')).toBe('sold-out');
  });

  it('falls back to the default when the sku in the url is unknown', () => {
    expect(variantFromSku(variants, 'RED-S')?.sku).toBe('RED-S');
    expect(variantFromSku(variants, 'NOPE')?.sku).toBe('BLUE-S');
    expect(variantFromSku(variants, null)?.sku).toBe('BLUE-S');
  });
});
