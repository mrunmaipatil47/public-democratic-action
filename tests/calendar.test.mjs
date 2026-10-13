import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_DAY_COUNT,
  ValidationError,
  addCalendarDays,
  addWorkingDays,
  compareDates,
  daysBetween,
  formatDate,
  isIsoDate,
  isWorkingDay,
  normaliseCalendar,
  parseDate,
} from '../src/workflow/index.mjs';

// November 2026: 02 Mon, 06 Fri, 07 Sat, 08 Sun, 09 Mon, 10 Tue, 11 Wed.

describe('calendar: parsing and formatting', () => {
  it('accepts real ISO dates and rejects malformed or impossible ones', () => {
    assert.equal(isIsoDate('2026-11-03'), true);
    assert.equal(isIsoDate('2026-02-29'), false); // 2026 is not a leap year
    assert.equal(isIsoDate('2026-13-01'), false);
    assert.equal(isIsoDate('03/11/2026'), false);
    assert.equal(isIsoDate('2026-1-3'), false);
    assert.equal(isIsoDate(20261103), false);
    assert.equal(isIsoDate(null), false);
  });

  it('parseDate is UTC midnight and formatDate round-trips', () => {
    const d = parseDate('2026-11-03');
    assert.equal(d.getUTCHours(), 0);
    assert.equal(d.getUTCDate(), 3);
    assert.equal(formatDate(d), '2026-11-03');
  });

  it('takes years 0000-0099 literally, matching the 0000-9999 range formatDate() promises', () => {
    // Date.UTC() would map 99 to 1999; the engine must not.
    assert.equal(isIsoDate('0099-12-31'), true);
    assert.equal(isIsoDate('0100-01-01'), true);
    assert.equal(isIsoDate('0000-01-01'), true);
    assert.equal(isIsoDate('0099-02-29'), false); // 99 is not a leap year
    assert.equal(isIsoDate('0000-02-29'), true); // year 0 is (divisible by 400)
    assert.equal(isIsoDate('0050-13-01'), false);
    const d = parseDate('0099-12-31');
    assert.equal(d.getUTCFullYear(), 99);
    assert.equal(formatDate(d), '0099-12-31');
    assert.equal(formatDate(parseDate('0000-01-01')), '0000-01-01');
    assert.equal(addCalendarDays('0099-12-31', 1), '0100-01-01');
    assert.equal(addCalendarDays('0100-01-01', -1), '0099-12-31');
    assert.equal(daysBetween('0099-12-31', '0100-01-01'), 1);
    assert.throws(() => addCalendarDays('0000-01-01', -1), ValidationError); // below the range
  });

  it('parseDate throws ValidationError naming the label', () => {
    assert.throws(() => parseDate('2026-02-30', 'receivedAt'), (err) => err instanceof ValidationError && /receivedAt/.test(err.message));
  });
});

describe('calendar: calendar days', () => {
  it('adds across month and year boundaries', () => {
    assert.equal(addCalendarDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addCalendarDays('2026-11-02', 21), '2026-11-23');
    assert.equal(addCalendarDays('2026-11-02', 30), '2026-12-02');
  });

  it('accepts negative and zero offsets', () => {
    assert.equal(addCalendarDays('2026-11-02', -2), '2026-10-31');
    assert.equal(addCalendarDays('2026-11-02', 0), '2026-11-02');
  });

  it('rejects non-integer offsets', () => {
    assert.throws(() => addCalendarDays('2026-11-02', 1.5), ValidationError);
  });

  it('throws ValidationError, not a raw RangeError, when the result leaves the supported range', () => {
    assert.throws(() => addCalendarDays('2026-11-02', 1e9), ValidationError);
    assert.throws(() => addCalendarDays('2026-11-02', 1e15), ValidationError);
    assert.throws(() => addCalendarDays('2026-11-02', 3_000_000), ValidationError); // year > 9999
    assert.throws(() => addCalendarDays('2026-11-02', -1_000_000), ValidationError); // year < 0
    assert.throws(() => formatDate(new Date(NaN)), ValidationError);
    assert.equal(addCalendarDays('2026-11-02', 2_000_000), '7502-08-27'); // 2,000,000 days is about 5,476 years
  });
});

describe('calendar: working days', () => {
  it('skips the default weekend (Saturday and Sunday)', () => {
    // Friday + 2 working days = Tuesday
    assert.equal(addWorkingDays('2026-11-06', 2), '2026-11-10');
    // Thursday + 2 working days = Monday
    assert.equal(addWorkingDays('2026-11-05', 2), '2026-11-09');
    // Monday + 2 working days = Wednesday
    assert.equal(addWorkingDays('2026-11-02', 2), '2026-11-04');
  });

  it('skips holidays as well as weekends', () => {
    assert.equal(addWorkingDays('2026-11-06', 2, { holidays: ['2026-11-10'] }), '2026-11-11');
    assert.equal(addWorkingDays('2026-11-06', 2, { holidays: ['2026-11-09', '2026-11-10'] }), '2026-11-12');
  });

  it('returns the input for zero working days', () => {
    assert.equal(addWorkingDays('2026-11-07', 0), '2026-11-07');
  });

  it('honours a custom weekend', () => {
    // Friday-Saturday weekend: Thursday + 1 working day = Sunday
    assert.equal(addWorkingDays('2026-11-05', 1, { weekendDays: [5, 6] }), '2026-11-08');
  });

  it('isWorkingDay reflects weekends and holidays', () => {
    assert.equal(isWorkingDay('2026-11-07'), false);
    assert.equal(isWorkingDay('2026-11-08'), false);
    assert.equal(isWorkingDay('2026-11-09'), true);
    assert.equal(isWorkingDay('2026-11-09', { holidays: ['2026-11-09'] }), false);
  });

  it('rejects negative counts and a weekend covering every day', () => {
    assert.throws(() => addWorkingDays('2026-11-02', -1), ValidationError);
    assert.throws(() => addWorkingDays('2026-11-02', 1, { weekendDays: [0, 1, 2, 3, 4, 5, 6] }), ValidationError);
  });

  it('caps the working-day count so the walk is bounded', () => {
    assert.equal(MAX_DAY_COUNT, 36_500);
    assert.throws(() => addWorkingDays('2026-11-02', MAX_DAY_COUNT + 1), ValidationError);
    assert.throws(() => addWorkingDays('2026-11-02', 2_000_000), ValidationError);
    assert.equal(addWorkingDays('2026-11-02', MAX_DAY_COUNT), '2166-09-29'); // 36,500 working days is about 140 years
  });

  it('normaliseCalendar fills defaults and validates', () => {
    assert.deepEqual(normaliseCalendar(), { weekendDays: [0, 6], holidays: [] });
    assert.deepEqual(normaliseCalendar({ holidays: ['2026-11-10'] }), { weekendDays: [0, 6], holidays: ['2026-11-10'] });
    assert.throws(() => normaliseCalendar({ weekendDays: [7] }), ValidationError);
    assert.throws(() => normaliseCalendar({ holidays: ['tomorrow'] }), ValidationError);
    // Every weekday as a weekend is refused at normalisation, so createCase() rejects it up front.
    assert.throws(() => normaliseCalendar({ weekendDays: [0, 1, 2, 3, 4, 5, 6] }), /cannot cover every weekday/);
    assert.throws(() => normaliseCalendar({ weekendDays: [6, 5, 4, 3, 2, 1, 0, 0] }), ValidationError);
    assert.deepEqual(normaliseCalendar({ weekendDays: [0, 0, 0, 0, 0, 0, 0] }).weekendDays, [0, 0, 0, 0, 0, 0, 0]); // duplicates of one day are not every day
    assert.deepEqual(normaliseCalendar({ weekendDays: [0, 1, 2, 3, 4, 5] }).weekendDays, [0, 1, 2, 3, 4, 5]);
  });
});

describe('calendar: differences and comparison', () => {
  it('daysBetween is signed', () => {
    assert.equal(daysBetween('2026-11-02', '2026-11-23'), 21);
    assert.equal(daysBetween('2026-11-23', '2026-11-02'), -21);
    assert.equal(daysBetween('2026-11-02', '2026-11-02'), 0);
    assert.equal(daysBetween('2026-11-30', '2026-12-01'), 1);
  });

  it('compareDates orders ISO dates', () => {
    assert.equal(compareDates('2026-11-02', '2026-11-03'), -1);
    assert.equal(compareDates('2026-11-03', '2026-11-03'), 0);
    assert.equal(compareDates('2026-12-01', '2026-11-30'), 1);
    assert.throws(() => compareDates('2026-11-02', 'later'), ValidationError);
  });
});
