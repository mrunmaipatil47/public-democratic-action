/**
 * Guards that keep the engine synthetic and free of personal data.
 *
 * Pack §9: "Test the process with synthetic records before handling sensitive
 * complaints." Pack §2: "collect only necessary personal information".
 *
 * @module workflow/guards
 */

import { PersonalDataError, SyntheticOnlyError } from './errors.mjs';

/** Keys that signal personal data, compared after lower-casing and stripping non-alphanumerics. */
const PERSONAL_KEYS = new Set([
  'name', 'fullname', 'firstname', 'lastname', 'surname', 'fathername', 'mothername', 'spousename',
  'phone', 'phoneno', 'phonenumber', 'telephone', 'mobile', 'mobileno', 'mobilenumber', 'contactnumber',
  'email', 'emailid', 'emailaddress',
  'aadhaar', 'aadhaarno', 'aadhaarnumber', 'aadhar', 'aadharno', 'aadharnumber', 'uid', 'uidai',
  'address', 'homeaddress', 'residentialaddress', 'postaladdress',
  'dob', 'dateofbirth', 'birthdate',
  'voterid', 'voteridno', 'voteridnumber', 'epic', 'epicno', 'epicnumber',
  'pan', 'panno', 'pannumber',
]);

/** Value patterns: [description, regex]. Values are never echoed in error messages. */
const VALUE_PATTERNS = /** @type {const} */ ([
  ['12-digit identifier (Aadhaar-like)', /(?<![\d])\d{12}(?![\d])/],
  ['12-digit identifier (Aadhaar-like, grouped)', /(?<![\d])\d{4}[ -]\d{4}[ -]\d{4}(?![\d])/],
  ['10-digit mobile number (starting 6-9)', /(?<![\d])[6-9]\d{9}(?![\d])/],
  ['email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
]);

/**
 * @param {string} key
 * @returns {string}
 */
function normaliseKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Throw unless the record is explicitly synthetic: `synthetic === true` and,
 * when an id is present, an id starting with `SYN-`.
 * @param {unknown} record
 * @returns {void}
 */
export function assertSynthetic(record) {
  if (record === null || typeof record !== 'object') {
    throw new SyntheticOnlyError('the record is not an object');
  }
  const rec = /** @type {Record<string, unknown>} */ (record);
  if (rec.synthetic !== true) {
    throw new SyntheticOnlyError(`synthetic is ${JSON.stringify(rec.synthetic)}, not true`);
  }
  if (rec.id !== undefined && !(typeof rec.id === 'string' && rec.id.startsWith('SYN-'))) {
    throw new SyntheticOnlyError('the id does not start with "SYN-"');
  }
}

/**
 * The guard every function applies to a case record it is handed: the record
 * must be synthetic (`assertSynthetic`) and must carry no personal-data
 * pattern anywhere in it (`rejectPersonalData`). Checking the whole record on
 * every call, not only at creation, means a case tampered with after
 * `createCase()` is refused by the next transition, by `deadlines()`,
 * `status()`, `onSilence()` and `toPublicSummary()` alike.
 * @template T
 * @param {T} record
 * @returns {T}
 */
export function assertSafeRecord(record) {
  assertSynthetic(record);
  return rejectPersonalData(record, 'case');
}

/**
 * Walk an object and throw `PersonalDataError` on a personal-data key or a
 * value that looks like a 12-digit number, a 10-digit mobile number starting
 * 6-9, or an email address. Returns the input unchanged when clean.
 * @template T
 * @param {T} obj
 * @param {string} [path] prefix used in error messages
 * @returns {T}
 */
export function rejectPersonalData(obj, path = '') {
  const seen = new WeakSet();
  /**
   * @param {unknown} value
   * @param {string} where
   */
  function visit(value, where) {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
      const text = String(value);
      for (const [kind, re] of VALUE_PATTERNS) {
        if (re.test(text)) throw new PersonalDataError(where || '(root)', kind);
      }
      return;
    }
    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${where}[${i}]`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const here = where ? `${where}.${key}` : key;
      if (PERSONAL_KEYS.has(normaliseKey(key))) throw new PersonalDataError(here, `key "${key}"`);
      visit(child, here);
    }
  }
  visit(obj, path);
  return obj;
}

/**
 * Convenience: does the object contain a personal-data pattern? Never throws.
 * @param {unknown} obj
 * @returns {boolean}
 */
export function containsPersonalData(obj) {
  try {
    rejectPersonalData(obj);
    return false;
  } catch (err) {
    if (err instanceof PersonalDataError) return true;
    throw err;
  }
}
