/**
 * Date arithmetic on ISO `YYYY-MM-DD` strings, computed in UTC.
 *
 * The pack's process targets mix calendar days ("routing within seven calendar
 * days") and working days ("within two working days with assistance"), so both
 * are provided. Weekend days and holidays come from the case's `calendar`.
 *
 * @module workflow/calendar
 */

import { ValidationError } from './errors.mjs';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/**
 * @typedef {object} WorkCalendar
 * @property {number[]} [weekendDays] JavaScript weekday numbers, 0 = Sunday ... 6 = Saturday
 * @property {string[]} [holidays] ISO dates that are not working days
 */

/** @type {Required<WorkCalendar>} */
export const DEFAULT_CALENDAR = Object.freeze({ weekendDays: [0, 6], holidays: [] });

/**
 * Is the value a well-formed, real ISO date string?
 * @param {unknown} value
 * @returns {value is string}
 */
export function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * Parse an ISO date into a UTC `Date` at midnight.
 * @param {string} value
 * @param {string} [label] name used in the error message
 * @returns {Date}
 */
export function parseDate(value, label = 'date') {
  if (!isIsoDate(value)) {
    throw new ValidationError(`${label} must be an ISO date string (YYYY-MM-DD), got ${JSON.stringify(value)}.`);
  }
  const [y, mo, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

/**
 * Format a `Date` as ISO `YYYY-MM-DD` in UTC.
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 0 || year > 9999) {
    throw new ValidationError('date is outside the supported range (years 0000-9999).');
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Today's date in UTC.
 * @returns {string}
 */
export function todayUtc() {
  return formatDate(new Date());
}

/**
 * Add `n` calendar days (negative allowed).
 * @param {string} date ISO date
 * @param {number} n
 * @returns {string}
 */
export function addCalendarDays(date, n) {
  const dt = parseDate(date);
  if (!Number.isInteger(n)) throw new ValidationError(`day count must be an integer, got ${JSON.stringify(n)}.`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return formatDate(dt);
}

/**
 * Normalise a partial calendar into a full one.
 * @param {WorkCalendar} [calendar]
 * @returns {Required<WorkCalendar>}
 */
export function normaliseCalendar(calendar = {}) {
  const weekendDays = Array.isArray(calendar.weekendDays) ? calendar.weekendDays : DEFAULT_CALENDAR.weekendDays;
  const holidays = Array.isArray(calendar.holidays) ? calendar.holidays : DEFAULT_CALENDAR.holidays;
  for (const w of weekendDays) {
    if (!Number.isInteger(w) || w < 0 || w > 6) {
      throw new ValidationError(`calendar.weekendDays must contain weekday numbers 0-6, got ${JSON.stringify(w)}.`);
    }
  }
  if (new Set(weekendDays).size >= 7) throw new ValidationError('calendar.weekendDays cannot cover every weekday.');
  for (const h of holidays) {
    if (!isIsoDate(h)) throw new ValidationError(`calendar.holidays must be ISO dates, got ${JSON.stringify(h)}.`);
  }
  return { weekendDays: [...weekendDays], holidays: [...holidays] };
}

/**
 * Is the date a working day under the calendar?
 * @param {string} date ISO date
 * @param {WorkCalendar} [calendar]
 * @returns {boolean}
 */
export function isWorkingDay(date, calendar) {
  const cal = normaliseCalendar(calendar);
  const dt = parseDate(date);
  if (cal.weekendDays.includes(dt.getUTCDay())) return false;
  if (cal.holidays.includes(date)) return false;
  return true;
}

/** Upper bound on day counts the engine will walk (about a century); larger inputs are mistakes. */
export const MAX_DAY_COUNT = 36_500;

/**
 * Add `n` working days: the result is the n-th working day strictly after
 * `date`. With `n === 0` the input date is returned unchanged.
 * @param {string} date ISO date
 * @param {number} n non-negative integer, at most MAX_DAY_COUNT
 * @param {WorkCalendar} [calendar]
 * @returns {string}
 */
export function addWorkingDays(date, n, calendar) {
  const cal = normaliseCalendar(calendar);
  if (!Number.isInteger(n) || n < 0) {
    throw new ValidationError(`working-day count must be a non-negative integer, got ${JSON.stringify(n)}.`);
  }
  if (n > MAX_DAY_COUNT) throw new ValidationError(`working-day count must be at most ${MAX_DAY_COUNT}, got ${n}.`);
  let current = parseDate(date);
  let remaining = n;
  while (remaining > 0) {
    current = new Date(current.getTime() + DAY_MS);
    const iso = formatDate(current);
    if (!cal.weekendDays.includes(current.getUTCDay()) && !cal.holidays.includes(iso)) remaining -= 1;
  }
  return formatDate(current);
}

/**
 * Whole days from `from` to `to` (positive when `to` is later).
 * @param {string} from ISO date
 * @param {string} to ISO date
 * @returns {number}
 */
export function daysBetween(from, to) {
  return Math.round((parseDate(to, 'to').getTime() - parseDate(from, 'from').getTime()) / DAY_MS);
}

/**
 * Lexicographic comparison works for ISO dates; this names the intent.
 * @param {string} a
 * @param {string} b
 * @returns {number} negative when a < b, 0 when equal, positive when a > b
 */
export function compareDates(a, b) {
  parseDate(a, 'a');
  parseDate(b, 'b');
  return a < b ? -1 : a > b ? 1 : 0;
}
