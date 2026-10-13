import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PersonalDataError,
  SyntheticOnlyError,
  assertSynthetic,
  containsPersonalData,
  rejectPersonalData,
} from '../src/workflow/index.mjs';

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
  });

  it('rejects a 10-digit mobile number starting 6-9', () => {
    assert.throws(() => rejectPersonalData({ summary: 'call 9876543210' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ summary: 'call 6000000000 now' }), PersonalDataError);
    assert.throws(() => rejectPersonalData({ list: ['fine', 'ring 7123456789'] }), PersonalDataError);
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
