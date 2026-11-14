import { describe, expect, it } from 'vitest';

import { addMonths, isBirthdayToday, lifeStagesDue } from './pet-messages.ts';

describe('isBirthdayToday', () => {
  it('matches month and day in a later year', () => {
    expect(isBirthdayToday('2022-03-18', '2026-03-18')).toBe(true);
    expect(isBirthdayToday('2022-03-18', '2026-03-19')).toBe(false);
  });
  it('is not a birthday on the day of birth, or before it', () => {
    expect(isBirthdayToday('2026-03-18', '2026-03-18')).toBe(false);
    expect(isBirthdayToday('2026-03-18', '2025-03-18')).toBe(false);
  });
  it('treats 29 Feb as 28 Feb in common years and 29 Feb in leap years', () => {
    expect(isBirthdayToday('2020-02-29', '2027-02-28')).toBe(true);
    expect(isBirthdayToday('2020-02-29', '2027-03-01')).toBe(false);
    expect(isBirthdayToday('2020-02-29', '2028-02-29')).toBe(true);
    expect(isBirthdayToday('2020-02-29', '2028-02-28')).toBe(false);
  });
});

describe('addMonths', () => {
  it('clamps to the end of a shorter month and crosses years', () => {
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 12)).toBe('2027-11-15');
    expect(addMonths('2026-10-15', 6)).toBe('2027-04-15');
  });
});

describe('lifeStagesDue', () => {
  it('fires on the milestone day for 8 weeks, 6 months and 12 months', () => {
    expect(lifeStagesDue('2026-09-01', '2026-10-27')).toEqual(['life_stage_8w']);
    expect(lifeStagesDue('2026-05-14', '2026-11-14')).toEqual(['life_stage_6m']);
    expect(lifeStagesDue('2025-11-14', '2026-11-14')).toEqual(['life_stage_12m']);
  });
  it('is quiet before the milestone and after the grace week', () => {
    expect(lifeStagesDue('2026-09-01', '2026-10-26')).toEqual([]);
    expect(lifeStagesDue('2026-09-01', '2026-11-03')).toEqual([]);
  });
  it('still sends a milestone that a job missed by a few days', () => {
    expect(lifeStagesDue('2026-09-01', '2026-10-30')).toEqual(['life_stage_8w']);
  });
  it('a pet born on 31 Aug reaches 6 months on 28 Feb', () => {
    expect(lifeStagesDue('2026-08-31', '2027-02-28')).toEqual(['life_stage_6m']);
  });
});
