import { describe, expect, it } from 'vitest';

import {
  bpToPercent,
  gramsToKg,
  kgToGrams,
  percentToBp,
  toForm,
  toInput,
  type ContentForm,
} from './content-form';

describe('percent and basis points', () => {
  it('converts typed percent to integer basis points without floats', () => {
    expect(percentToBp('26.5')).toBe(2650);
    expect(percentToBp('26,50')).toBe(2650);
    expect(percentToBp('0.07')).toBe(7);
    expect(percentToBp('100')).toBe(10000);
    // 19.99 * 100 is 1998.9999999999998 in floating point; the text route never sees that.
    expect(percentToBp('19.99')).toBe(1999);
  });

  it('refuses above 100, three decimals, negatives and text', () => {
    for (const bad of ['100.01', '101', '1.234', '-1', 'abc', '', '5%']) {
      expect(percentToBp(bad)).toBeNull();
    }
  });

  it('shows basis points the way a person writes them', () => {
    expect(bpToPercent(2650)).toBe('26.5');
    expect(bpToPercent(2600)).toBe('26');
    expect(bpToPercent(7)).toBe('0.07');
    expect(bpToPercent(10000)).toBe('100');
  });
});

describe('kilograms and grams', () => {
  it('converts typed kg to grams from the text', () => {
    expect(kgToGrams('7.5')).toBe(7500);
    expect(kgToGrams('7,25')).toBe(7250);
    expect(kgToGrams('0.001')).toBe(1);
    expect(kgToGrams('12')).toBe(12000);
    expect(kgToGrams('1.1')).toBe(1100);
  });
  it('refuses garbage', () => {
    for (const bad of ['', 'x', '-1', '1.2345', '1000']) expect(kgToGrams(bad)).toBeNull();
  });
  it('round-trips', () => {
    for (const g of [0, 1, 500, 5000, 7500, 45123]) expect(kgToGrams(gramsToKg(g))).toBe(g);
  });
});

const empty = (over: Partial<ContentForm> = {}): ContentForm => ({
  specs: [],
  faqs: [],
  feeding: [],
  constituents: [],
  deliveryNote: '',
  sizeGuideId: '',
  relations: [],
  ...over,
});

describe('toInput', () => {
  it('builds integers for the API and null for empty optional fields', () => {
    const { input, errors } = toInput(
      empty({
        specs: [{ label: ' Origin ', value: 'Nowhere' }],
        feeding: [
          { minKg: '0', maxKg: '5', dailyG: '40', lifeStage: 'any' },
          { minKg: '5', maxKg: '10.5', dailyG: '70', lifeStage: 'any' },
        ],
        constituents: [
          {
            variantId: 'v1',
            protein: '26.5',
            fat: '',
            fibre: '',
            ash: '',
            moisture: '',
            kcal: '365',
          },
        ],
      }),
    );
    expect(errors).toEqual({});
    expect(input.specs).toEqual([{ label: 'Origin', value: 'Nowhere' }]);
    expect(input.feedingTable).toEqual([
      { petWeightGMin: 0, petWeightGMax: 5000, dailyG: 40, lifeStage: 'any' },
      { petWeightGMin: 5000, petWeightGMax: 10500, dailyG: 70, lifeStage: 'any' },
    ]);
    expect(input.constituents).toEqual([
      {
        variantId: 'v1',
        values: [
          { key: 'protein', valueBp: 2650 },
          { key: 'kcal', valueBp: 365 },
        ],
      },
    ]);
    expect(input.deliveryNote).toBeNull();
    expect(input.sizeGuideId).toBeNull();
  });

  it('reports a gap and an overlap on the row that causes them', () => {
    const gap = toInput(
      empty({
        feeding: [
          { minKg: '0', maxKg: '5', dailyG: '40', lifeStage: 'any' },
          { minKg: '6', maxKg: '10', dailyG: '70', lifeStage: 'any' },
        ],
      }),
    );
    expect(gap.errors['feeding.1.minKg']).toBe('Gap between 5 kg and 6 kg');
    const overlap = toInput(
      empty({
        feeding: [
          { minKg: '0', maxKg: '5', dailyG: '40', lifeStage: 'any' },
          { minKg: '4', maxKg: '10', dailyG: '70', lifeStage: 'any' },
        ],
      }),
    );
    expect(overlap.errors['feeding.1.minKg']).toMatch(/^Overlaps/);
  });

  it('reports every bad field at once, keyed by input', () => {
    const { errors } = toInput(
      empty({
        specs: [
          { label: 'A', value: '' },
          { label: 'a', value: 'x' },
        ],
        faqs: [{ question: '', answer: 'x' }],
        feeding: [{ minKg: '5', maxKg: '3', dailyG: '0', lifeStage: 'any' }],
        constituents: [
          {
            variantId: 'v',
            protein: '120',
            fat: '',
            fibre: '',
            ash: '',
            moisture: '',
            kcal: '9001',
          },
        ],
      }),
    );
    expect(errors).toMatchObject({
      'specs.0.value': 'Required',
      'specs.1.label': 'This label is used twice',
      'faqs.0.question': 'Required',
      'feeding.0.maxKg': 'Must be above the lower weight',
      'feeding.0.dailyG': 'Whole grams, at least 1',
      'constituents.0.protein': '0 to 100, up to 2 decimals',
      'constituents.0.kcal': 'Whole number up to 9000',
    });
  });

  it('round-trips what the API stored', () => {
    const form = toForm({
      specs: [{ label: 'Origin', value: 'x' }],
      faqs: [{ id: 'f1', question: 'Q?', answer: 'A.' }],
      feedingTable: [{ petWeightGMin: 0, petWeightGMax: 5000, dailyG: 40, lifeStage: 'adult' }],
      constituents: [
        {
          variantId: 'v1',
          values: [
            { key: 'protein', valueBp: 2650 },
            { key: 'kcal', valueBp: 365 },
          ],
        },
        { variantId: 'v2', values: [] },
      ],
      deliveryNote: 'Note',
      sizeGuideId: 'g1',
      relations: [{ relatedId: 'p2', relatedName: 'Ball', kind: 'bought_together' }],
    });
    expect(form.constituents[0]).toMatchObject({ protein: '26.5', fat: '', kcal: '365' });
    expect(form.feeding[0]).toEqual({ minKg: '0', maxKg: '5', dailyG: '40', lifeStage: 'adult' });
    const back = toInput(form);
    expect(back.errors).toEqual({});
    expect(back.input.constituents?.[0]?.values).toEqual([
      { key: 'protein', valueBp: 2650 },
      { key: 'kcal', valueBp: 365 },
    ]);
    expect(back.input.deliveryNote).toBe('Note');
    expect(back.input.relations).toEqual([{ relatedId: 'p2', kind: 'bought_together' }]);
  });
});
