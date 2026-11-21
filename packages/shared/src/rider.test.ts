import { describe, expect, it } from 'vitest';

import { riderProgress } from './rider.ts';

const at = (hhmm: string) => new Date(`2026-11-21T${hhmm}:00.000Z`);

describe('riderProgress', () => {
  it('takes the time to the end of the window, but at most 30 minutes', () => {
    const p = riderProgress(at('12:00'), at('15:00'), at('12:00'));
    expect(p.arrivesAt).toEqual(at('12:30'));
    expect(p.fraction).toBe(0);
    expect(p.minutesAway).toBe(30);
    expect(p.arrived).toBe(false);
  });

  it('arrives at the end of the window when that is within 10 to 30 minutes', () => {
    expect(riderProgress(at('13:50'), at('14:10'), at('13:50')).arrivesAt).toEqual(at('14:10'));
  });

  it('never rides less than 10 minutes, also when the window is over', () => {
    expect(riderProgress(at('14:55'), at('15:00'), at('14:55')).arrivesAt).toEqual(at('15:05'));
    expect(riderProgress(at('15:30'), at('15:00'), at('15:30')).arrivesAt).toEqual(at('15:40'));
  });

  it('moves along the ride and rounds the minutes left up', () => {
    const p = riderProgress(at('12:00'), at('15:00'), at('12:18'));
    expect(p.fraction).toBeCloseTo(0.6);
    expect(p.minutesAway).toBe(12);
    const q = riderProgress(at('12:00'), at('15:00'), new Date(at('12:18').getTime() + 1_000));
    expect(q.minutesAway).toBe(12);
  });

  it('has arrived exactly at the arrival time and stays arrived', () => {
    const p = riderProgress(at('12:00'), at('15:00'), at('12:30'));
    expect(p).toMatchObject({ fraction: 1, minutesAway: 0, arrived: true });
    expect(riderProgress(at('12:00'), at('15:00'), at('18:00')).arrived).toBe(true);
  });

  it('is at the start before the hand-over (a clock that is a little behind)', () => {
    const p = riderProgress(at('12:00'), at('15:00'), at('11:59'));
    expect(p.fraction).toBe(0);
    expect(p.arrived).toBe(false);
  });
});
