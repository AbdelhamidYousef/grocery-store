import { describe, expect, it } from 'vitest';

import { emptyFlashForm, newItem, parseFlashForm, percentOff } from './flash-form';

const form = (over: Partial<ReturnType<typeof emptyFlashForm>> = {}) => ({
  name: 'Weekend Woof',
  startsAt: '2026-11-20T10:00',
  endsAt: '2026-11-21T10:00',
  items: [newItem('PW-ROPE-S', '8.99')],
  ...over,
});

describe('percentOff', () => {
  it('is whole percent of the regular price, on integer cents', () => {
    expect(percentOff(2000, 1500)).toBe(25);
    expect(percentOff(1099, 899)).toBe(18);
    expect(percentOff(0, 100)).toBe(0);
  });
});

describe('parseFlashForm', () => {
  it('turns euros into cents and the UTC inputs into ISO strings', () => {
    const r = parseFlashForm(form());
    expect(r).toEqual({
      ok: true,
      input: {
        name: 'Weekend Woof',
        startsAt: '2026-11-20T10:00:00.000Z',
        endsAt: '2026-11-21T10:00:00.000Z',
        items: [{ variant: 'PW-ROPE-S', salePriceCents: 899 }],
      },
    });
  });

  it('rejects an end before the start', () => {
    const r = parseFlashForm(form({ endsAt: '2026-11-19T10:00' }));
    expect(r).toMatchObject({ ok: false, errors: { endsAt: 'The end must be after the start' } });
  });

  it('flags a bad price, an empty SKU and a repeated SKU on their rows', () => {
    const r = parseFlashForm(
      form({
        items: [newItem('A', 'abc'), newItem('', '1'), newItem('a', '2'), newItem('B', '0')],
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors['items.0.salePriceCents']).toMatch(/euros/);
    expect(r.errors['items.1.variant']).toBe('Enter the SKU');
    expect(r.errors['items.2.variant']).toBe('This SKU is already in the sale');
    expect(r.errors['items.3.salePriceCents']).toBe('The sale price must be above 0');
  });

  it('needs a name and a start and end', () => {
    const r = parseFlashForm(form({ name: ' ', startsAt: '', endsAt: '' }));
    expect(r).toMatchObject({
      ok: false,
      errors: {
        name: 'Give the sale a name',
        startsAt: 'Pick when the sale starts',
        endsAt: 'Pick when the sale ends',
      },
    });
  });
});
