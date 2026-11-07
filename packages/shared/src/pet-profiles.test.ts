import { describe, expect, it } from 'vitest';

import { ageStageFor, monthsSince, petAgeMonths, petToFilters } from './pet-profiles.ts';
import { PetInputSchema } from './schemas/pet-profiles.ts';

const NOW = new Date('2026-11-07T12:00:00Z');

describe('monthsSince', () => {
  it('counts whole months and waits for the day of the month', () => {
    expect(monthsSince('2026-10-07', NOW)).toBe(1);
    expect(monthsSince('2026-10-08', NOW)).toBe(0);
    expect(monthsSince('2025-11-07', NOW)).toBe(12);
    expect(monthsSince('2025-11-08', NOW)).toBe(11);
  });
  it('never goes negative and rejects impossible dates', () => {
    expect(monthsSince('2027-01-01', NOW)).toBe(0);
    expect(monthsSince('2026-02-30', NOW)).toBeNull();
    expect(monthsSince('not a date', NOW)).toBeNull();
  });
});

describe('petAgeMonths', () => {
  it('prefers the birthday over the rough age', () => {
    expect(petAgeMonths({ species: 'dog', birthday: '2025-11-07', approxAgeMonths: 90 }, NOW)).toBe(
      12,
    );
    expect(petAgeMonths({ species: 'dog', approxAgeMonths: 90 }, NOW)).toBe(90);
    expect(petAgeMonths({ species: 'dog' }, NOW)).toBeNull();
  });
});

describe('ageStageFor', () => {
  it.each([
    ['dog', 0, 'puppy'],
    ['dog', 11, 'puppy'],
    ['dog', 12, 'adult'],
    ['dog', 95, 'adult'],
    ['dog', 96, 'senior'],
    ['cat', 11, 'kitten'],
    ['cat', 12, 'adult'],
    ['cat', 131, 'adult'],
    ['cat', 132, 'senior'],
    ['small', 47, 'adult'],
    ['small', 48, 'senior'],
  ] as const)('%s at %i months is %s', (species, months, stage) => {
    expect(ageStageFor(species, months)).toBe(stage);
  });
  it('has no stage for species without stages, or an unknown age', () => {
    for (const species of ['bird', 'fish', 'reptile'] as const)
      expect(ageStageFor(species, 30)).toBeUndefined();
    expect(ageStageFor('dog', null)).toBeUndefined();
  });
});

describe('petToFilters', () => {
  it('turns a puppy into pet + age stage (with the all-ages products)', () => {
    expect(petToFilters({ species: 'dog', birthday: '2026-06-01', size: 'm' }, NOW)).toEqual({
      attr: { pet: ['dog'], ageStage: ['puppy', 'all'] },
      size: 'm',
    });
  });
  it.each(['bird', 'fish', 'reptile'] as const)('%s filters by species only', (species) => {
    expect(petToFilters({ species, approxAgeMonths: 20 }, NOW)).toEqual({
      attr: { pet: [species] },
    });
  });
  it('maps small pets (attribute value "small") and seniors', () => {
    expect(petToFilters({ species: 'small', approxAgeMonths: 60 }, NOW).attr).toEqual({
      pet: ['small'],
      ageStage: ['senior', 'all'],
    });
  });
  it('leaves the age out when it is unknown', () => {
    expect(petToFilters({ species: 'cat' }, NOW).attr).toEqual({ pet: ['cat'] });
  });
});

describe('PetInputSchema', () => {
  it('trims, nulls empty optionals and accepts a valid pet', () => {
    expect(
      PetInputSchema.parse({ name: ' Biscuit ', species: 'dog', birthday: '', size: 'm' }),
    ).toEqual({
      name: 'Biscuit',
      species: 'dog',
      birthday: null,
      approxAgeMonths: undefined,
      size: 'm',
    });
  });
  it('rejects a future birthday, a bad species and an empty name', () => {
    expect(
      PetInputSchema.safeParse({ name: 'A', species: 'dog', birthday: '2999-01-01' }).success,
    ).toBe(false);
    expect(PetInputSchema.safeParse({ name: 'A', species: 'horse' }).success).toBe(false);
    expect(PetInputSchema.safeParse({ name: ' ', species: 'dog' }).success).toBe(false);
  });
});
