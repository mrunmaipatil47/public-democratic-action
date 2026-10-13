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
  'phone', 'phoneno', 'phonenumber', 'telephone', 'telephoneno', 'telephonenumber', 'tel', 'telno',
  'mobile', 'mobileno', 'mobilenumber', 'altphone', 'alternatephone', 'alternatenumber',
  'contact', 'contactno', 'contactnumber', 'contactdetails', 'whatsapp', 'whatsappno', 'whatsappnumber',
  'email', 'emailid', 'emailaddress',
  'aadhaar', 'aadhaarno', 'aadhaarnumber', 'aadhar', 'aadharno', 'aadharnumber', 'uid', 'uidai', 'vid',
  'address', 'homeaddress', 'residentialaddress', 'postaladdress',
  'dob', 'dateofbirth', 'birthdate',
  'voterid', 'voteridno', 'voteridnumber', 'epic', 'epicno', 'epicnumber',
  'pan', 'panno', 'pannumber',
  'passport', 'passportno', 'passportnumber', 'rationcard', 'rationcardno', 'rationcardnumber',
  'drivinglicence', 'drivinglicense', 'dlno',
  'bankaccount', 'bankaccountno', 'bankaccountnumber', 'accountno', 'accountnumber', 'ifsc', 'ifsccode', 'upi', 'upiid',
]);

/**
 * A key ending in "name" names a person unless it is one of these, which name
 * a thing (a file, a host, an office, a scheme, an engine object).
 */
const NAME_KEYS_ALLOWED = new Set([
  'hostname', 'filename', 'pathname', 'dirname', 'basename', 'username',
  'classname', 'tagname', 'typename', 'fieldname', 'keyname', 'eventname',
  'officename', 'leadofficename', 'bodyname', 'departmentname', 'schemename',
  'issuename', 'domainname', 'routename', 'scenarioname',
]);

/**
 * Value patterns: [description, regex]. Values are never echoed in error messages.
 *
 * Digit groups may be separated by spaces, dots or hyphens where Indian usage
 * groups them: an Aadhaar as 4-4-4 and a mobile number as 5-5, optionally
 * behind a +91, 0091 or trunk-0 prefix. Separators are matched in place, never
 * collapsed out of the text first, so lists of short numbers ("issues 001 002
 * 003 004", two adjacent dates) do not merge into a false identifier.
 */
const VALUE_PATTERNS = /** @type {const} */ ([
  ['12-digit identifier (Aadhaar-like)', /(?<![\d])\d{12}(?![\d])/],
  ['12-digit identifier (Aadhaar-like, grouped)', /(?<![\d])\d{4}[\s.-]+\d{4}[\s.-]+\d{4}(?![\d])/],
  ['16-digit identifier (Aadhaar VID-like)', /(?<![\d])\d{16}(?![\d])/],
  ['10-digit mobile number (starting 6-9)', /(?<![\d])(?:(?:\+|00)?91[\s.-]?|0)?[6-9]\d{4}[\s.-]?\d{5}(?![\d])/],
  ['PAN-like identifier (5 letters, 4 digits, 1 letter)', /(?<![A-Z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])/],
  ['voter EPIC-like identifier (3 letters, 7 digits)', /(?<![A-Z0-9])[A-Z]{3}\d{7}(?![A-Z0-9])/],
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
 * Does the key, after normalisation, signal personal data? Exact matches on
 * `PERSONAL_KEYS`, plus any key ending in "name" that is not on the allow-list
 * of things-not-persons.
 * @param {string} key
 * @returns {boolean}
 */
export function isPersonalKey(key) {
  const norm = normaliseKey(key);
  if (PERSONAL_KEYS.has(norm)) return true;
  return norm.endsWith('name') && !NAME_KEYS_ALLOWED.has(norm);
}

/**
 * Walk an object and throw `PersonalDataError` on a personal-data key or a
 * value that looks like a 12-digit (or 16-digit VID) identifier, a 10-digit
 * mobile number starting 6-9 (plain, grouped 5-5 or with a +91/0 prefix), a
 * PAN, a voter EPIC, or an email address. Returns the input unchanged when
 * clean.
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
      if (isPersonalKey(key)) throw new PersonalDataError(here, `key "${key}"`);
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
