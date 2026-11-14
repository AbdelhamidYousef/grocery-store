import { describe, expect, it } from 'vitest';

import {
  addBusinessDays,
  defaultDeliveryRules,
  estimateDelivery,
  formatCountdown,
  formatDeliveryDay,
  isBusinessDay,
  nextBusinessDay,
  STORE_HOLIDAYS,
} from './delivery.ts';

const standard = defaultDeliveryRules(3, 5);
const express = defaultDeliveryRules(1, 2);
const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;
const MIN = 60_000;

// Amsterdam is UTC+1 in winter (CET) and UTC+2 in summer (CEST): 10:40 CET is 09:40Z.
describe('estimateDelivery: the cutoff', () => {
  it('ships today before the cutoff on a business day, and counts down to it', () => {
    // Wed 4 Nov 2026, 10:40 in Amsterdam.
    const e = estimateDelivery(at('2026-11-04T09:40:00Z'), standard);
    expect(e).toMatchObject({ dispatchDate: '2026-11-04', dispatchesToday: true });
    expect(e.msToCutoff).toBe(4 * HOUR + 20 * MIN);
    // Wed 4 Nov + 3 business days is Mon 9 Nov (Thu, Fri, Mon); + 5 is Wed 11 Nov.
    expect(e.arrivesFrom).toBe('2026-11-09');
    expect(e.arrivesTo).toBe('2026-11-11');
  });

  it('treats 14:59:59 as before and 15:00:00 as after the cutoff', () => {
    expect(estimateDelivery(at('2026-11-04T13:59:59Z'), standard).dispatchesToday).toBe(true);
    const after = estimateDelivery(at('2026-11-04T14:00:00Z'), standard);
    expect(after.dispatchesToday).toBe(false);
    expect(after.dispatchDate).toBe('2026-11-05');
    expect(after.msToCutoff).toBeNull();
  });

  it('moves a Friday-after-cutoff order to Monday', () => {
    // Fri 6 Nov 2026, 16:00 Amsterdam.
    const e = estimateDelivery(at('2026-11-06T15:00:00Z'), express);
    expect(e.dispatchDate).toBe('2026-11-09');
    expect(e.arrivesFrom).toBe('2026-11-10');
    expect(e.arrivesTo).toBe('2026-11-11');
  });

  it('ships a weekend order on Monday with no countdown', () => {
    for (const iso of ['2026-11-07T09:00:00Z', '2026-11-08T09:00:00Z']) {
      const e = estimateDelivery(at(iso), standard);
      expect(e).toMatchObject({ dispatchDate: '2026-11-09', dispatchesToday: false });
      expect(e.msToCutoff).toBeNull();
    }
  });

  it('uses the store zone, not the machine or the visitor: 23:30Z Sunday is already Monday morning in Amsterdam', () => {
    // 2026-11-08T23:30Z = Mon 9 Nov 00:30 CET: a business day before the cutoff.
    const e = estimateDelivery(at('2026-11-08T23:30:00Z'), standard);
    expect(e).toMatchObject({ dispatchDate: '2026-11-09', dispatchesToday: true });
    expect(e.msToCutoff).toBe(14 * HOUR + 30 * MIN);
  });
});

describe('estimateDelivery: holidays', () => {
  it('skips a holiday as a dispatch day', () => {
    // Fri 25 Dec 2026 (holiday), 10:00 Amsterdam: next business day is Mon 28 Dec.
    const e = estimateDelivery(at('2026-12-25T09:00:00Z'), standard);
    expect(e).toMatchObject({ dispatchDate: '2026-12-28', dispatchesToday: false });
  });

  it('skips holidays and the weekend after the cutoff on Christmas Eve', () => {
    // Thu 24 Dec 2026, 16:00: 25 and 26 are holidays, then the weekend.
    const e = estimateDelivery(at('2026-12-24T15:00:00Z'), express);
    expect(e.dispatchDate).toBe('2026-12-28');
    expect(e.arrivesFrom).toBe('2026-12-29');
  });

  it('skips holidays while the parcel is in transit', () => {
    // Wed 23 Dec before the cutoff, 1 to 2 business days: Thu 24, then Mon 28.
    const e = estimateDelivery(at('2026-12-23T09:00:00Z'), express);
    expect(e.dispatchDate).toBe('2026-12-23');
    expect(e.arrivesFrom).toBe('2026-12-24');
    expect(e.arrivesTo).toBe('2026-12-28');
  });

  it('knows the listed holidays are not business days', () => {
    for (const day of STORE_HOLIDAYS) expect(isBusinessDay(day, STORE_HOLIDAYS)).toBe(false);
    expect(isBusinessDay('2026-11-04', STORE_HOLIDAYS)).toBe(true);
  });
});

describe('estimateDelivery: daylight saving', () => {
  it('counts down to 15:00 local on both sides of the autumn change (CEST then CET)', () => {
    // Fri 23 Oct 2026 12:00 CEST (UTC+2) = 10:00Z; cutoff 13:00Z.
    expect(estimateDelivery(at('2026-10-23T10:00:00Z'), standard).msToCutoff).toBe(3 * HOUR);
    // Mon 26 Oct 2026 12:00 CET (UTC+1) = 11:00Z; cutoff 14:00Z. The clocks went back on the 25th.
    expect(estimateDelivery(at('2026-10-26T11:00:00Z'), standard).msToCutoff).toBe(3 * HOUR);
  });

  it('counts down to 15:00 local on both sides of the spring change (CET then CEST)', () => {
    // Fri 26 Mar 2027 12:00 CET = 11:00Z; Tue 30 Mar 2027 12:00 CEST = 10:00Z (Mon 29 is a holiday).
    expect(estimateDelivery(at('2027-03-26T11:00:00Z'), standard).msToCutoff).toBe(3 * HOUR);
    expect(estimateDelivery(at('2027-03-30T10:00:00Z'), standard).msToCutoff).toBe(3 * HOUR);
  });

  it('a Saturday-evening order just before the spring change still ships Tuesday (Monday is a holiday)', () => {
    const e = estimateDelivery(at('2027-03-27T21:00:00Z'), standard);
    expect(e.dispatchDate).toBe('2027-03-30');
  });

  it('names the zone abbreviation that is in force at the cutoff', () => {
    expect(estimateDelivery(at('2026-11-04T09:40:00Z'), standard).cutoffLabel).toBe(
      'Cutoff 15:00 CET',
    );
    expect(estimateDelivery(at('2026-07-01T08:00:00Z'), standard).cutoffLabel).toBe(
      'Cutoff 15:00 CEST',
    );
  });
});

describe('estimateDelivery: purity', () => {
  it('answers the same for the same clock, and changes only when the clock does', () => {
    const now = at('2026-11-04T09:40:00Z');
    expect(estimateDelivery(now, standard)).toEqual(estimateDelivery(now, standard));
    const later = estimateDelivery(at('2026-11-04T09:41:00Z'), standard);
    expect(later.msToCutoff).toBe(4 * HOUR + 19 * MIN);
  });

  it('does not depend on the process time zone', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Auckland';
      const a = estimateDelivery(at('2026-11-04T09:40:00Z'), standard);
      process.env.TZ = 'America/Los_Angeles';
      expect(estimateDelivery(at('2026-11-04T09:40:00Z'), standard)).toEqual(a);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('business day helpers', () => {
  it('walks forward over weekends and holidays', () => {
    expect(nextBusinessDay('2026-11-06', [])).toBe('2026-11-09');
    expect(nextBusinessDay('2026-11-06', ['2026-11-09'])).toBe('2026-11-10');
    expect(addBusinessDays('2026-11-04', 0, [])).toBe('2026-11-04');
    expect(addBusinessDays('2026-11-04', 5, [])).toBe('2026-11-11');
  });
});

describe('words', () => {
  it('writes days the same way everywhere', () => {
    expect(formatDeliveryDay('2026-11-04')).toBe('Wed 4 Nov');
    expect(formatDeliveryDay('2026-12-28')).toBe('Mon 28 Dec');
  });

  it('writes a countdown in whole minutes, rounded down', () => {
    expect(formatCountdown(3 * HOUR + 20 * MIN)).toBe('3h 20m');
    expect(formatCountdown(3 * HOUR + 20 * MIN + 59_000)).toBe('3h 20m');
    expect(formatCountdown(45 * MIN)).toBe('45m');
    expect(formatCountdown(HOUR)).toBe('1h 0m');
    expect(formatCountdown(59_999)).toBe('under a minute');
    expect(formatCountdown(0)).toBe('under a minute');
    expect(formatCountdown(-5)).toBe('under a minute');
  });
});

describe('STORE_HOLIDAYS: 2027 Dutch holidays', () => {
  it("has King's Day on 27 April (26 April is a Monday working day), Ascension and Whit Monday", () => {
    expect(STORE_HOLIDAYS).toEqual(
      expect.arrayContaining(['2027-04-27', '2027-05-05', '2027-05-06', '2027-05-17']),
    );
    expect(STORE_HOLIDAYS).not.toContain('2027-04-26');
    expect(isBusinessDay('2027-04-26', STORE_HOLIDAYS)).toBe(true);
    expect(isBusinessDay('2027-04-27', STORE_HOLIDAYS)).toBe(false);
  });
});
