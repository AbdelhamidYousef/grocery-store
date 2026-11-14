import { describe, expect, it } from 'vitest';

import { nextTierFor, normalizeEmail, pointsForCents, tierFor } from './loyalty.ts';

describe('tierFor', () => {
  it.each([
    [0, 'pup'],
    [499, 'pup'],
    [500, 'good_dog'],
    [1999, 'good_dog'],
    [2000, 'top_dog'],
    [99999, 'top_dog'],
  ])('%i lifetime points is %s', (points, tier) => {
    expect(tierFor(points).id).toBe(tier);
  });
});

describe('nextTierFor', () => {
  it('says how far the next tier is, and nothing at the top', () => {
    expect(nextTierFor(0)).toMatchObject({ tier: { id: 'good_dog' }, pointsNeeded: 500 });
    expect(nextTierFor(499)?.pointsNeeded).toBe(1);
    expect(nextTierFor(500)).toMatchObject({ tier: { id: 'top_dog' }, pointsNeeded: 1500 });
    expect(nextTierFor(2000)).toBeNull();
  });
});

describe('pointsForCents', () => {
  it('is 1 point per whole euro at the base rate', () => {
    expect(pointsForCents(0)).toBe(0);
    expect(pointsForCents(99)).toBe(0);
    expect(pointsForCents(100)).toBe(1);
    expect(pointsForCents(2350)).toBe(23);
  });
  it('raises the rate with the tier and drops the fraction', () => {
    expect(pointsForCents(2350, 'good_dog')).toBe(28); // 23 x 1.25 = 28.75
    expect(pointsForCents(2350, 'top_dog')).toBe(34); // 23 x 1.5 = 34.5
    expect(pointsForCents(10_000, 'good_dog')).toBe(125);
    expect(pointsForCents(10_000, 'top_dog')).toBe(150);
  });
  it('refuses fractional or negative cents', () => {
    expect(() => pointsForCents(1.5)).toThrow(RangeError);
    expect(() => pointsForCents(-1)).toThrow(RangeError);
  });
});

describe('normalizeEmail', () => {
  it('lower-cases and drops a +tag', () => {
    expect(normalizeEmail('Ada+Shop@Example.com')).toBe('ada@example.com');
  });
  it('ignores dots and the googlemail alias for Gmail only', () => {
    expect(normalizeEmail('jo.smith@gmail.com')).toBe('josmith@gmail.com');
    expect(normalizeEmail('jo.smith+x@googlemail.com')).toBe('josmith@gmail.com');
    expect(normalizeEmail('jo.smith@example.com')).toBe('jo.smith@example.com');
  });
  it('keeps different mailboxes different', () => {
    expect(normalizeEmail('a@example.com')).not.toBe(normalizeEmail('b@example.com'));
  });
});
