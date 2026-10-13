import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PersonalDataError,
  SyntheticOnlyError,
  assertSynthetic,
  containsPersonalData,
  rejectPersonalData,
} from '../src/workflow/index.mjs';
import { isPersonalKey } from '../src/workflow/guards.mjs';

describe('guards: assertSynthetic', () => {
  it('accepts synthetic: true with a SYN- id', () => {
    assert.doesNotThrow(() => assertSynthetic({ synthetic: true, id: 'SYN-0001' }));
    assert.doesNotThrow(() => assertSynthetic({ synthetic: true })); // id optional for params objects
  });

  it('rejects anything not explicitly synthetic', () => {
    assert.throws(() => assertSynthetic({ synthetic: false, id: 'SYN-0001' }), SyntheticOnlyError);
    assert.throws(() => assertSynthetic({ id: 'SYN-0001' }), SyntheticOnlyError);
    assert.throws(() => assertSynthetic({ synthetic: 'true', id: 'SYN-0001' }), SyntheticOnlyError);
    assert.throws(() => assertSynthetic({ synthetic: 1, id: 'SYN-0001' }), SyntheticOnlyError);
    assert.throws(() => assertSynthetic(null), SyntheticOnlyError);
    assert.throws(() => assertSynthetic('SYN-0001'), SyntheticOnlyError);
  });

  it('rejects ids that do not start with SYN-', () => {
    assert.throws(() => assertSynthetic({ synthetic: true, id: 'CASE-0001' }), SyntheticOnlyError);
    assert.throws(() => assertSynthetic({ synthetic: true, id: 'syn-0001' }), SyntheticOnlyError);
    assert.throws(() => assertSynthetic({ synthetic: true, id: 1 }), SyntheticOnlyError);
  });

  it('quotes the pack rule', () => {
    assert.throws(() => assertSynthetic({}), /synthetic records before handling sensitive complaints/);
  });
});

describe('guards: rejectPersonalData on keys', () => {
  const keys = ['name', 'Name', 'fullName', 'phone', 'phone_number', 'mobile', 'email', 'aadhaar', 'aadhar',
    'uid', 'address', 'dob', 'dateOfBirth', 'voterId', 'epic', 'pan', 'PAN', 'Date-Of-Birth'];
  for (const key of keys) {
    it(`rejects key "${key}"`, () => {
      assert.throws(() => rejectPersonalData({ summary: 'synthetic', [key]: 'x' }), PersonalDataError);
    });
  }

  it('finds keys nested in objects and arrays and reports the path, not the value', () => {
    const err = assert.throws(
      () => rejectPersonalData({ a: { b: [{ ok: 1 }, { mobile: 'SECRET-VALUE' }] } }),
      PersonalDataError,
    );
    const e = /** @type {PersonalDataError} */ (
      (() => {
        try {
          rejectPersonalData({ a: { b: [{ ok: 1 }, { mobile: 'SECRET-VALUE' }] } });
        } catch (x) {
          return x;
        }
        return null;
      })()
    );
    assert.ok(e instanceof PersonalDataError);
    assert.equal(e.details.where, 'a.b[1].mobile');
    assert.doesNotMatch(e.message, /SECRET-VALUE/);
    assert.match(e.message, /Collect only necessary personal information/);
    assert.equal(err, undefined);
  });

  it('recognises common variants of personal-data keys, not only the canonical spellings', () => {
    const variants = ['whatsapp', 'WhatsApp_No', 'contactNo', 'contact', 'altPhone', 'tel', 'telNo', 'officerName', 'complainantName',
      'applicant_name', 'displayName', 'rationCardNo', 'passportNo', 'passport', 'bankAccount', 'accountNumber', 'ifsc', 'upiId', 'vid', 'drivingLicence'];
    for (const key of variants) {
      assert.throws(() => rejectPersonalData({ summary: 'synthetic', [key]: 'x' }), PersonalDataError, key);
      assert.equal(isPersonalKey(key), true, key);
    }
    assert.throws(() => rejectPersonalData({ contact: { whatsapp: 'x' } }), PersonalDataError);
    assert.equal(containsPersonalData({ complainantName: 'x', officerName: 'y' }), true);
  });

  it('keys ending in "name" that name a thing, not a person, stay allowed', () => {
    for (const key of ['hostname', 'filename', 'pathname', 'username', 'officeName', 'leadOfficeName', 'schemeName', 'issueName', 'eventName']) {
      assert.equal(isPersonalKey(key), false, key);
      assert.doesNotThrow(() => rejectPersonalData({ [key]: 'x' }), key);
    }
  });

  it('leaves engine vocabulary keys alone', () => {
    assert.doesNotThrow(() =>
      rejectPersonalData({
        id: 'SYN-0001', leadOffice: 'Office', toOffice: 'Other office', body: 'Vigilance body', issueId: '077',
        receivedAt: '2026-11-03', acknowledgedAt: '2026-11-16', hearingAt: '2026-12-15', reason: 'retaliation',
        participationRoute: 'individual-remedy', channel: 'digital', hostname: 'ignored', username: 'ignored',
      }),
    );
  });
});

describe('guards: rejectPersonalData on values', () => {
  it('rejects a 12-digit number (Aadhaar-like), plain or grouped', () => {
    assert.throws(() => rejectPersonalData({ summary: 'card 123456789012 shown' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ summary: 'card 1234 5678 9012 shown' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ summary: 'card 1234-5678-9012 shown' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ n: 123456789012 }), PersonalDataError);
    // Grouping with double spaces, dots or mixed separators is the same identifier.
    assert.throws(() => rejectPersonalData({ summary: 'card 1234  5678  9012 shown' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ summary: 'card 1234.5678.9012 shown' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ summary: 'card 1234 - 5678 - 9012 shown' }), PersonalDataError);
  });

  it('rejects a 16-digit number (Aadhaar VID-like), a PAN and a voter EPIC, with non-matching controls', () => {
    assert.throws(() => rejectPersonalData({ summary: 'VID 1234567890123456' }), /16-digit identifier/);
    assert.throws(() => rejectPersonalData({ summary: 'PAN ABCDE1234F on file' }), /PAN-like identifier/);
    assert.throws(() => rejectPersonalData({ summary: 'voter id ABC1234567' }), /EPIC-like identifier/);
    assert.throws(() => rejectPersonalData({ list: ['fine', 'XYZ9876543'] }), PersonalDataError);
    // Controls: synthetic references with a hyphen, lower case, and the wrong lengths.
    assert.doesNotThrow(() => rejectPersonalData({ text: 'SYN-0001 and REF-1234567 and REF-12345678' }));
    assert.doesNotThrow(() => rejectPersonalData({ text: 'abcde1234f is not a PAN as written' }));
    assert.doesNotThrow(() => rejectPersonalData({ text: 'ABCD1234F ABCDEF1234F ABCDE123F AB1234567 ABCD1234567' }));
    assert.doesNotThrow(() => rejectPersonalData({ text: 'fifteen digits 123456789012345 and seventeen 12345678901234567' }));
    assert.doesNotThrow(() => rejectPersonalData({ text: 'ward 14' }));
  });

  it('rejects a 10-digit mobile number starting 6-9', () => {
    assert.throws(() => rejectPersonalData({ summary: 'call 9876543210' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ summary: 'call 6000000000 now' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ list: ['fine', 'ring 7123456789'] }), PersonalDataError);
  });

  it('rejects the common grouped and prefixed mobile formats too', () => {
    const formats = ['ring 98765 43210', 'ring 98765-43210', 'ring 98765.43210', 'ring +91 98765 43210', 'ring +91-9876543210',
      'ring +919876543210', 'ring 0091 98765 43210', 'ring 09876543210', 'ring 0 98765 43210', 'ring 91 98765 43210'];
    for (const text of formats) {
      assert.throws(() => rejectPersonalData({ summary: text }), PersonalDataError, text);
      assert.equal(containsPersonalData({ nested: { list: [text] } }), true, text);
    }
    // Controls: lists of short numbers and adjacent dates never merge into a number.
    for (const text of ['issues 001 002 003 004', 'Rules 12 14 16 18 20 22', 'pin 400001 and 400002', 'between 2026-11-03 2026-11-10',
      'between 60000 and 70000 households', 'Rs 65000.00 was paid on 2026-11-03', '7 lakh = 700000', 'reference 1234567890', 'ring 5876543210']) {
      assert.doesNotThrow(() => rejectPersonalData({ text }), text);
    }
  });

  it('rejects an email address', () => {
    assert.throws(() => rejectPersonalData({ summary: 'write to someone@example.org please' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ summary: 'a.b-c+d@sub.example.co.in' }), PersonalDataError);
  });

  it('does not reject dates, ids, short numbers or 10-digit numbers starting 1-5', () => {
    assert.doesNotThrow(() => rejectPersonalData({ at: '2026-11-03', id: 'SYN-0001', count: 21, text: 'ward 14, lane 3' }));
    assert.doesNotThrow(() => rejectPersonalData({ text: 'reference 1234567890' }));
    assert.doesNotThrow(() => rejectPersonalData({ text: 'two dates 2026-11-03 and 2026-11-10' }));
    assert.doesNotThrow(() => rejectPersonalData({ text: 'eleven digits 12345678901' }));
    assert.doesNotThrow(() => rejectPersonalData({ text: 'thirteen digits 1234567890123' }));
    assert.doesNotThrow(() => rejectPersonalData({ text: 'not an email: user at example dot org' }));
  });

  it('returns the input when clean and reports the value kind without echoing it', () => {
    const input = { summary: 'synthetic' };
    assert.equal(rejectPersonalData(input), input);
    try {
      rejectPersonalData({ summary: 'ring 9876543210' });
      assert.fail('expected a throw');
    } catch (err) {
      assert.ok(err instanceof PersonalDataError);
      assert.doesNotMatch(err.message, /9876543210/);
      assert.match(err.message, /10-digit mobile number/);
      assert.equal(err.details.where, 'summary');
    }
  });

  it('containsPersonalData never throws', () => {
    assert.equal(containsPersonalData({ summary: 'clean synthetic text' }), false);
    assert.equal(containsPersonalData({ summary: 'ring 9876543210' }), true);
    assert.equal(containsPersonalData({ email: 'x' }), true);
    assert.equal(containsPersonalData(null), false);
  });
});
