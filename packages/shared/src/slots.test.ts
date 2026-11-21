import { describe, expect, it } from 'vitest';

import {
  addDays,
  dateKeyIn,
  formatSlotLabel,
  formatSlotRange,
  isSlotClosed,
  isStoreOpen,
  slotCutoff,
  slotDayKind,
  slotDayKeys,
  slotsForDay,
  slotsForHorizon,
  zonedInstant,
} from './slots.ts';

const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

describe('slotsForDay', () => {
  it('builds 14 back-to-back one-hour slots for 08:00-22:00', () => {
    const slots = slotsForDay('2026-11-23');
    expect(slots).toHaveLength(14);
    // Berlin is UTC+1 in winter: 08:00 local is 07:00Z.
    expect(slots[0]!.startsAt.toISOString()).toBe('2026-11-23T07:00:00.000Z');
    expect(slots[13]!.endsAt.toISOString()).toBe('2026-11-23T21:00:00.000Z');
    slots.forEach((s, i) => {
      expect(s.endsAt.getTime() - s.startsAt.getTime()).toBe(HOUR);
      if (i > 0) expect(s.startsAt.getTime()).toBe(slots[i - 1]!.endsAt.getTime());
    });
  });

  it('honours the store hours and drops a window that would end after closing', () => {
    expect(slotsForDay('2026-11-23', '09:00', '12:30')).toHaveLength(3);
    expect(slotsForDay('2026-11-23', '10:00', '10:00')).toHaveLength(0);
  });

  it('is built from wall-clock times in summer too (UTC+2)', () => {
    expect(slotsForDay('2026-07-01')[0]!.startsAt.toISOString()).toBe('2026-07-01T06:00:00.000Z');
  });

  it('keeps 08:00 local on the spring change day (2027-03-28, a 23-hour day)', () => {
    const slots = slotsForDay('2027-03-28');
    expect(slots).toHaveLength(14);
    // 08:00 CEST (UTC+2) = 06:00Z; the clocks jumped at 02:00 CET, so the day before 08:00 is 07:00Z.
    expect(slots[0]!.startsAt.toISOString()).toBe('2027-03-28T06:00:00.000Z');
    expect(formatSlotRange(slots[0]!.startsAt, slots[0]!.endsAt)).toBe('08:00–09:00');
    expect(formatSlotRange(slots[13]!.startsAt, slots[13]!.endsAt)).toBe('21:00–22:00');
    expect(dateKeyIn(slots[0]!.startsAt)).toBe('2027-03-28');
  });

  it('keeps 08:00 local on the autumn change day (2026-10-25, a 25-hour day)', () => {
    const slots = slotsForDay('2026-10-25');
    expect(slots).toHaveLength(14);
    // 08:00 CET (UTC+1) = 07:00Z, after the clocks went back at 03:00 CEST.
    expect(slots[0]!.startsAt.toISOString()).toBe('2026-10-25T07:00:00.000Z');
    expect(formatSlotRange(slots[0]!.startsAt, slots[0]!.endsAt)).toBe('08:00–09:00');
  });

  it('builds windows across the change itself with the right lengths', () => {
    // A store open overnight: 00:00-06:00 on the spring change day has only 5 real hours.
    const spring = slotsForDay('2027-03-28', '00:00', '06:00');
    expect(spring).toHaveLength(6);
    const total = spring.reduce((n, s) => n + (s.endsAt.getTime() - s.startsAt.getTime()), 0);
    expect(total).toBe(5 * HOUR);
    // Autumn: the same wall hours cover 7 real hours.
    const autumn = slotsForDay('2026-10-25', '00:00', '06:00');
    const autumnTotal = autumn.reduce((n, s) => n + (s.endsAt.getTime() - s.startsAt.getTime()), 0);
    expect(autumnTotal).toBe(7 * HOUR);
  });
});

describe('days', () => {
  it('lists seven days starting with the shop-zone today, not the UTC one', () => {
    // 23:30Z on 22 Nov is already 00:30 on 23 Nov in Berlin.
    const keys = slotDayKeys(at('2026-11-22T23:30:00Z'));
    expect(keys[0]).toBe('2026-11-23');
    expect(keys).toHaveLength(7);
    expect(keys[6]).toBe('2026-11-29');
  });

  it('counts calendar days across a change day', () => {
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('creates 7 x 14 slots for the horizon, with the right count on a change day', () => {
    expect(slotsForHorizon(at('2026-11-23T10:00:00Z'))).toHaveLength(98);
    expect(slotsForHorizon(at('2027-03-26T10:00:00Z'))).toHaveLength(98);
  });

  it('zonedInstant moves a non-existent spring wall time one hour later', () => {
    // 02:30 on 2027-03-28 does not exist in Berlin; it lands on 03:30 CEST = 01:30Z.
    expect(zonedInstant('2027-03-28', 150).toISOString()).toBe('2027-03-28T01:30:00.000Z');
    // 02:30 on 2026-10-25 exists twice; the second (CET) is 01:30Z.
    expect(zonedInstant('2026-10-25', 150).toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });
});

describe('rules', () => {
  const start = at('2026-11-23T13:00:00Z'); // 14:00 Berlin
  it('closes a slot 60 minutes before it starts', () => {
    expect(slotCutoff(start).toISOString()).toBe('2026-11-23T12:00:00.000Z');
    expect(isSlotClosed(start, at('2026-11-23T11:59:59Z'))).toBe(false);
    expect(isSlotClosed(start, at('2026-11-23T12:00:00Z'))).toBe(true);
    expect(isSlotClosed(start, at('2026-11-23T14:00:00Z'))).toBe(true);
  });

  it('knows when a store is open by its local hours', () => {
    expect(isStoreOpen(at('2026-11-23T06:59:00Z'))).toBe(false); // 07:59
    expect(isStoreOpen(at('2026-11-23T07:00:00Z'))).toBe(true); // 08:00
    expect(isStoreOpen(at('2026-11-23T20:59:00Z'))).toBe(true); // 21:59
    expect(isStoreOpen(at('2026-11-23T21:00:00Z'))).toBe(false); // 22:00
    // Summer: 22:00 local is 20:00Z.
    expect(isStoreOpen(at('2026-07-01T19:59:00Z'))).toBe(true);
    expect(isStoreOpen(at('2026-07-01T20:00:00Z'))).toBe(false);
  });
});

describe('labels', () => {
  const now = at('2026-11-23T10:00:00Z'); // Mon 23 Nov, 11:00 Berlin
  const slot = (iso: string) => {
    const startsAt = at(iso);
    return { startsAt, endsAt: new Date(startsAt.getTime() + HOUR) };
  };

  it('says today, tomorrow or the weekday in the shop zone', () => {
    expect(slotDayKind(at('2026-11-23T13:00:00Z'), now)).toBe('today');
    expect(slotDayKind(at('2026-11-24T08:00:00Z'), now)).toBe('tomorrow');
    expect(slotDayKind(at('2026-11-26T08:00:00Z'), now)).toBe('later');
    // 00:30 Berlin on the 24th is already tomorrow although it is 23:30Z on the 23rd.
    expect(slotDayKind(at('2026-11-23T23:30:00Z'), now)).toBe('tomorrow');
  });

  it('formats the label in English and German with a 24-hour clock', () => {
    const s = slot('2026-11-23T13:00:00Z');
    expect(formatSlotLabel(s.startsAt, s.endsAt, now, 'en-IE')).toBe('Today 14:00–15:00');
    expect(formatSlotLabel(s.startsAt, s.endsAt, now, 'de-DE')).toBe('Heute 14:00–15:00');
    expect(formatSlotLabel(s.startsAt, s.endsAt, now, 'en-IE', undefined, 'sentence')).toBe(
      'today 14:00–15:00',
    );
    const t = slot('2026-11-24T08:00:00Z');
    expect(formatSlotLabel(t.startsAt, t.endsAt, now, 'en-IE')).toBe('Tomorrow 09:00–10:00');
    expect(formatSlotLabel(t.startsAt, t.endsAt, now, 'de-DE')).toBe('Morgen 09:00–10:00');
    const l = slot('2026-11-26T08:00:00Z');
    expect(formatSlotLabel(l.startsAt, l.endsAt, now, 'en-IE')).toMatch(
      /^Thu.*26.*Nov 09:00–10:00$/,
    );
  });
});
