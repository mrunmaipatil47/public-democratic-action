// @ts-nocheck -- these tests deliberately pass invalid input to the engine to prove it refuses.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BoilerplateClosureError,
  HumanValidationRequiredError,
  IndependentVerifierRequiredError,
  InvalidTransitionError,
  MAX_LEGAL_DEADLINE_DAYS,
  NoInventedConsequenceError,
  PersonalDataError,
  PromiseNotRemedyError,
  ReferralNotResolutionError,
  STATES,
  SyntheticOnlyError,
  UnknownIssueError,
  UnverifiedTransferError,
  ValidationError,
  assessResponse,
  challengeClosure,
  close,
  createCase,
  deadlines,
  decide,
  decideAdmission,
  flagUrgent,
  getIssue,
  isSilent,
  issueReceipt,
  markProtected,
  onSilence,
  recordChange,
  recordHearing,
  referToVigilance,
  requestAdmission,
  respond,
  routeCase,
  scheduleHearing,
  status,
  suggestOwner,
  toPublicSummary,
  transfer,
} from '../src/workflow/index.mjs';

// November 2026: 02 Mon, 03 Tue, 04 Wed, 05 Thu, 06 Fri, 07 Sat, 08 Sun, 09 Mon, 10 Tue, 11 Wed.

/** @param {Record<string, unknown>} [overrides] */
function base(overrides = {}) {
  return createCase({
    id: 'SYN-9001',
    synthetic: true,
    participationRoute: 'individual-remedy',
    issueId: '077',
    channel: 'digital',
    receivedAt: '2026-11-02',
    summary: 'SYNTHETIC test case: a household in a test ward reports a denied ration entitlement.',
    consent: { attribution: 'anonymous' },
    ...overrides,
  });
}

const ROUTING = {
  at: '2026-11-05',
  leadOffice: 'Food and civil-supplies department (synthetic)',
  coOwners: ['Statutory grievance body (synthetic)'],
  applicableRules: ['Entitlement rules as cited (synthetic)'],
  validatedBy: 'human',
};

const GOOD_RESPONSE = {
  at: '2026-11-18',
  decision: 'action',
  evidence: ['Denial record (synthetic)', 'Delivery register (synthetic)'],
  jurisdiction: 'The district office holds the entitlement record (synthetic).',
  reasons:
    'The entitlement remains valid; the denial followed repeated authentication failures at the shop device. ' +
    'The office restores the entitlement and offers an alternative verification method.',
  challengeRoutes: ['A', 'R', 'J'],
};

const BOILERPLATE_RESPONSE = { at: '2026-11-18', decision: 'refusal', reasons: 'Noted and forwarded for necessary action.' };

function routed() {
  return routeCase(base(), ROUTING);
}

function responded() {
  return respond(routed(), GOOD_RESPONSE);
}

function completed() {
  return recordChange(responded(), { at: '2026-11-20', kind: 'completed', description: 'Entitlement restored (synthetic).' });
}

describe('createCase', () => {
  it('creates a received case with exactly one case-created event and safe defaults', () => {
    const k = base({ consent: undefined, issueId: '77' });
    assert.equal(k.state, 'received');
    assert.equal(k.issueId, '077');
    assert.equal(k.owner, null);
    assert.equal(k.closure, null);
    assert.equal(k.legalDeadlineDays, null);
    assert.deepEqual(k.consent, { attribution: 'anonymous' });
    assert.deepEqual(k.calendar, { weekendDays: [0, 6], holidays: [] });
    assert.deepEqual(k.flags, { protected: false, urgent: false });
    assert.equal(k.events.length, 1);
    assert.equal(k.events[0].type, 'case-created');
    assert.equal(k.events[0].actorRole, 'filer');
    assert.equal(k.events[0].at, '2026-11-02');
    for (const list of ['responses', 'changes', 'challenges', 'dissent', 'transfers', 'referrals']) {
      assert.deepEqual(k[list], []);
    }
  });

  it('uses the assistant role for assisted filings', () => {
    assert.equal(base({ channel: 'assisted' }).events[0].actorRole, 'assistant');
  });

  it('validates enums, dates and shapes with ValidationError', () => {
    assert.throws(() => base({ participationRoute: 'petition' }), ValidationError);
    assert.throws(() => base({ channel: 'fax' }), ValidationError);
    assert.throws(() => base({ receivedAt: '2 Nov 2026' }), ValidationError);
    assert.throws(() => base({ summary: '' }), ValidationError);
    assert.throws(() => base({ consent: { attribution: 'public' } }), ValidationError);
    assert.throws(() => base({ legalDeadlineDays: 0 }), ValidationError);
    assert.throws(() => base({ legalDeadlineDays: 2.5 }), ValidationError);
    assert.throws(() => base({ calendar: { weekendDays: [9] } }), ValidationError);
    // Out-of-range inputs are refused at creation with ValidationError, never a raw RangeError later.
    assert.throws(() => base({ legalDeadlineDays: 1e9 }), ValidationError);
    assert.throws(() => base({ legalDeadlineDays: MAX_LEGAL_DEADLINE_DAYS + 1 }), ValidationError);
    assert.equal(deadlines(base({ legalDeadlineDays: MAX_LEGAL_DEADLINE_DAYS })).responseDue, '2036-10-30');
    assert.throws(() => base({ channel: 'assisted', calendar: { weekendDays: [0, 1, 2, 3, 4, 5, 6] } }), ValidationError);
    assert.throws(() => base({ channel: 'assisted', calendar: { weekendDays: [0, 1, 2, 3, 4, 5, 6, 6] } }), ValidationError);
    assert.throws(() => base({ id: 'SYN-x', actorRole: 'minister' }), ValidationError);
  });
});

describe('error classes are thrown in their situations', () => {
  it('SyntheticOnlyError: synthetic flag, id prefix, and tampered cases', () => {
    assert.throws(() => base({ synthetic: false }), SyntheticOnlyError);
    assert.throws(() => base({ synthetic: undefined }), SyntheticOnlyError);
    assert.throws(() => base({ id: 'CASE-1' }), SyntheticOnlyError);
    const tampered = { ...base(), synthetic: false };
    assert.throws(() => issueReceipt(tampered, { at: '2026-11-02' }), SyntheticOnlyError);
    assert.throws(() => deadlines(tampered), SyntheticOnlyError);
    assert.throws(() => status(tampered, { now: '2026-11-02' }), SyntheticOnlyError);
    assert.throws(() => toPublicSummary(tampered, { now: '2026-11-02' }), SyntheticOnlyError);
  });

  it('PersonalDataError: keys and value patterns in any input', () => {
    assert.throws(() => base({ summary: 'call 9876543210 for details' }), PersonalDataError);
    assert.throws(() => base({ summary: 'synthetic', phone: '000' }), PersonalDataError);
    assert.throws(() => base({ consent: { attribution: 'named', name: 'x' } }), PersonalDataError);
    assert.throws(() => respond(routed(), { ...GOOD_RESPONSE, reasons: 'write to a@b.co' }), PersonalDataError);
    assert.throws(() => challengeClosure(responded(), { at: '2026-11-19', grounds: 'Aadhaar 123456789012' }), PersonalDataError);
    assert.throws(() => recordChange(responded(), { at: '2026-11-19', kind: 'promised', description: 'ok', dob: '1990' }), PersonalDataError);
  });

  it('PersonalDataError: grouped and prefixed mobile numbers are refused in every free-text field, not only the summary', () => {
    for (const number of ['98765 43210', '98765-43210', '+91 98765 43210', '09876543210']) {
      assert.throws(() => base({ summary: `SYNTHETIC: ring ${number}` }), PersonalDataError, number);
      assert.throws(() => routeCase(base(), { ...ROUTING, applicableRules: [`Rule 4; call ${number}`] }), PersonalDataError, number);
      assert.throws(() => routeCase(base(), { ...ROUTING, coOwners: [`Desk, ${number}`] }), PersonalDataError, number);
      assert.throws(() => respond(routed(), { ...GOOD_RESPONSE, reasons: `${GOOD_RESPONSE.reasons} Contact ${number}.` }), PersonalDataError, number);
      assert.throws(() => transfer(routed(), { at: '2026-11-06', toOffice: `Office B, ${number}`, verified: true, acknowledgedAt: '2026-11-06' }), PersonalDataError, number);
      assert.throws(() => challengeClosure(responded(), { at: '2026-11-19', grounds: `Call ${number} for the register.` }), PersonalDataError, number);
      assert.throws(() => referToVigilance(routed(), { at: '2026-11-06', body: `Vigilance desk ${number}` }), PersonalDataError, number);
    }
    // A record tampered with after creation is refused by the next call as well.
    const tampered = { ...routed(), owner: { ...routed().owner, applicableRules: ['Rule 4; call 98765 43210'] } };
    assert.throws(() => respond(tampered, GOOD_RESPONSE), PersonalDataError);
    assert.throws(() => status(tampered, { now: '2026-11-06' }), PersonalDataError);
  });

  it('PersonalDataError: a case record carrying personal data is refused by every call, not only at creation', () => {
    // Mirrors the tampered-synthetic test: the record is checked again on every call.
    const tampered = { ...base(), summary: 'ring 9876543210 or mail a@b.co' };
    assert.throws(() => issueReceipt(tampered, { at: '2026-11-02' }), PersonalDataError);
    assert.throws(() => routeCase(tampered, ROUTING), PersonalDataError);
    assert.throws(() => deadlines(tampered), PersonalDataError);
    assert.throws(() => status(tampered, { now: '2026-11-02' }), PersonalDataError);
    assert.throws(() => toPublicSummary(tampered, { now: '2026-11-02' }), PersonalDataError);
    assert.throws(() => onSilence(tampered, { now: '2026-11-30' }), PersonalDataError);
    const inEvents = { ...base(), events: [{ ...base().events[0], data: { phone: '9876543210' } }] };
    assert.throws(() => deadlines(inEvents), PersonalDataError);
    assert.throws(() => flagUrgent(inEvents, { at: '2026-11-03' }), PersonalDataError);
    const inOwner = { ...routed(), owner: { ...routed().owner, coOwners: ['someone@example.org'] } };
    assert.throws(() => respond(inOwner, GOOD_RESPONSE), PersonalDataError);
    assert.throws(() => status(inOwner, { now: '2026-11-06' }), PersonalDataError);
    // The guard does not get in the way of clean records.
    assert.equal(status(routed(), { now: '2026-11-06' }).state, 'routed');
  });

  it('UnknownIssueError: issue ids outside 001-100', () => {
    assert.throws(() => base({ issueId: '999' }), UnknownIssueError);
    assert.throws(() => base({ issueId: '000' }), UnknownIssueError);
    assert.throws(() => base({ issueId: 'ration' }), UnknownIssueError);
    assert.throws(() => suggestOwner('101'), UnknownIssueError);
    assert.throws(() => getIssue(undefined), UnknownIssueError);
  });

  it('HumanValidationRequiredError: routing without a human marker', () => {
    assert.throws(() => routeCase(base(), { ...ROUTING, validatedBy: 'ai' }), HumanValidationRequiredError);
    assert.throws(() => routeCase(base(), { ...ROUTING, validatedBy: 'system' }), HumanValidationRequiredError);
    assert.throws(() => routeCase(base(), { ...ROUTING, validatedBy: undefined }), HumanValidationRequiredError);
    assert.throws(() => routeCase(base(), { ...ROUTING, validatedBy: true }), HumanValidationRequiredError);
  });

  it('InvalidTransitionError: out-of-order steps', () => {
    assert.throws(() => respond(base(), GOOD_RESPONSE), InvalidTransitionError);
    assert.throws(() => close(base(), { at: '2026-11-03', reason: 'duplicate' }), InvalidTransitionError);
    assert.throws(() => decideAdmission(base({ participationRoute: 'systemic-review' }), { at: '2026-11-03', admitted: true, reasons: 'x' }), InvalidTransitionError);
    assert.throws(() => requestAdmission(routed(), { at: '2026-11-06' }), InvalidTransitionError); // individual-remedy
    assert.throws(() => scheduleHearing(routed(), { at: '2026-11-06', hearingAt: '2026-12-01' }), InvalidTransitionError);
    assert.throws(() => recordHearing(routed(), { at: '2026-11-06' }), InvalidTransitionError);
    assert.throws(() => decide(routed(), { at: '2026-11-06', decision: 'x', reasons: 'y' }), InvalidTransitionError);
    const withReceipt = issueReceipt(base(), { at: '2026-11-02' });
    assert.throws(() => issueReceipt(withReceipt, { at: '2026-11-03' }), InvalidTransitionError);
    assert.throws(() => challengeClosure(routed(), { at: '2026-11-06', grounds: 'nothing yet' }), InvalidTransitionError);
    const closed = close(completed(), { at: '2026-11-21', reason: 'action-completed' });
    assert.throws(() => respond(closed, { ...GOOD_RESPONSE, at: '2026-11-22' }), InvalidTransitionError);
    assert.throws(() => routeCase(responded(), { ...ROUTING, at: '2026-11-19' }), InvalidTransitionError);
  });

  it('UnverifiedTransferError: unverified or unacknowledged transfers', () => {
    assert.throws(() => transfer(routed(), { at: '2026-11-06', toOffice: 'Other office', verified: false, acknowledgedAt: '2026-11-06' }), UnverifiedTransferError);
    assert.throws(() => transfer(routed(), { at: '2026-11-06', toOffice: 'Other office', verified: 'yes', acknowledgedAt: '2026-11-06' }), UnverifiedTransferError);
    assert.throws(() => transfer(routed(), { at: '2026-11-06', toOffice: 'Other office', verified: true }), UnverifiedTransferError);
    assert.throws(() => transfer(routed(), { at: '2026-11-06', toOffice: 'Other office', verified: true, acknowledgedAt: '' }), UnverifiedTransferError);
    assert.throws(() => transfer(routed(), { at: '2026-11-06', toOffice: 'Other office' }), /do not call a referral a resolved problem/);
  });

  it('ValidationError: acknowledgedAt must fall between receivedAt and at', () => {
    const ok = { at: '2026-11-06', toOffice: 'Other office (synthetic)', verified: true };
    assert.throws(() => transfer(routed(), { ...ok, acknowledgedAt: '1999-01-01' }), ValidationError);
    assert.throws(() => transfer(routed(), { ...ok, acknowledgedAt: '2026-11-01' }), ValidationError); // before receivedAt
    assert.throws(() => transfer(routed(), { ...ok, acknowledgedAt: '2026-11-07' }), ValidationError); // after at
    assert.throws(() => transfer(routed(), { ...ok, acknowledgedAt: '2099-01-01' }), ValidationError);
    assert.equal(transfer(routed(), { ...ok, acknowledgedAt: '2026-11-02' }).transfers[0].acknowledgedAt, '2026-11-02'); // receivedAt itself
    assert.equal(transfer(routed(), { ...ok, acknowledgedAt: '2026-11-06' }).transfers[0].acknowledgedAt, '2026-11-06'); // at itself
  });

  it('BoilerplateClosureError: boilerplate, interim-only, transfer/referral reasons, and promises called completed', () => {
    const boiler = respond(routed(), BOILERPLATE_RESPONSE);
    assert.throws(() => close(boiler, { at: '2026-11-19', reason: 'refused-with-reasons' }), BoilerplateClosureError);
    assert.throws(() => close(responded(), { at: '2026-11-19', reason: 'transferred' }), BoilerplateClosureError);
    assert.throws(() => close(responded(), { at: '2026-11-19', reason: 'referred-to-vigilance' }), BoilerplateClosureError);
    assert.throws(() => close(responded(), { at: '2026-11-19', reason: 'forwarded for necessary action' }), BoilerplateClosureError);
    const promised = recordChange(responded(), { at: '2026-11-19', kind: 'promised', description: 'Will restore (synthetic).' });
    assert.throws(() => close(promised, { at: '2026-11-19', reason: 'action-completed' }), BoilerplateClosureError);
    const interim = respond(routed(), { ...GOOD_RESPONSE, decision: 'interim' });
    assert.throws(() => close(interim, { at: '2026-11-19', reason: 'withdrawn-by-filer' }), BoilerplateClosureError);
    assert.throws(() => close(responded(), { at: '2026-11-19', reason: 'refused-with-reasons' }), BoilerplateClosureError); // action, not refusal
    assert.throws(() => close(responded(), { at: '2026-11-19', reason: 'solved' }), ValidationError); // not an enum value
  });

  it('closure refusals lead with the pack rule that applies: wrong office for transfers, evidence of change for promises', () => {
    // Both are closure refusals (instanceof BoilerplateClosureError) but quote their own §5 / §2 bullet first.
    for (const reason of ['transferred', 'referred-to-vigilance', 'forwarded for necessary action']) {
      const err = /** @type {Error} */ ((() => { try { close(responded(), { at: '2026-11-19', reason }); } catch (e) { return e; } return null; })());
      assert.ok(err instanceof ReferralNotResolutionError, reason);
      assert.ok(err instanceof BoilerplateClosureError, reason);
      assert.match(err.message, /^Wrong office: coordinate a verified transfer; do not call a referral a resolved problem\./);
      assert.doesNotMatch(err.message, /^Boilerplate closure refused/);
    }
    const promised = recordChange(responded(), { at: '2026-11-19', kind: 'promised', description: 'Will restore (synthetic).' });
    assert.throws(() => close(promised, { at: '2026-11-19', reason: 'action-completed' }), PromiseNotRemedyError);
    // assert.throws tests a RegExp against "Name: message".
    assert.throws(() => close(promised, { at: '2026-11-19', reason: 'action-completed' }), /^PromiseNotRemedyError: Evidence of change: distinguish action promised, action completed and outcome independently verified\./);
    // The boilerplate case keeps the boilerplate bullet, and the §1 sentence closes every variant.
    const boiler = respond(routed(), BOILERPLATE_RESPONSE);
    assert.throws(() => close(boiler, { at: '2026-11-19', reason: 'refused-with-reasons' }), /^BoilerplateClosureError: Boilerplate closure refused: request case-specific reasons/);
    for (const fn of [() => close(boiler, { at: '2026-11-19', reason: 'refused-with-reasons' }), () => close(responded(), { at: '2026-11-19', reason: 'transferred' }), () => close(promised, { at: '2026-11-19', reason: 'action-completed' })]) {
      assert.throws(fn, /a promise labelled as a completed remedy \(/);
    }
  });

  it('IndependentVerifierRequiredError: verified changes need a verifier or reviewer', () => {
    const k = responded();
    assert.throws(() => recordChange(k, { at: '2026-11-19', kind: 'verified', description: 'x' }), IndependentVerifierRequiredError);
    assert.throws(() => recordChange(k, { at: '2026-11-19', kind: 'verified', description: 'x', verifier: 'lead-office' }), IndependentVerifierRequiredError);
    assert.throws(() => recordChange(k, { at: '2026-11-19', kind: 'verified', description: 'x', verifier: 'filer' }), IndependentVerifierRequiredError);
    assert.throws(() => recordChange(k, { at: '2026-11-19', kind: 'verified', description: 'x', verifier: 'supervisor' }), IndependentVerifierRequiredError);
    for (const verifier of ['verifier', 'reviewer']) {
      const v = recordChange(k, { at: '2026-11-19', kind: 'verified', description: 'Checked (synthetic).', verifier });
      assert.equal(v.changes[0].verifier, verifier);
      assert.equal(v.events.at(-1).actorRole, verifier);
    }
  });

  it('NoInventedConsequenceError: decisions and close reasons naming enforcement', () => {
    const heard = heardSystemic();
    const refusedDecisions = [
      'Impose a fine on the vendor', 'Order the removal of the officer', 'Hold a mandatory hearing', 'A penalty applies', 'Court order to follow',
      'Remove the officer from post', 'Suspend the clerk pending inquiry', 'Suspend the vendor licence', 'Dismissal of the erring officer',
      'Arrest the vendor', 'Prosecute the official', 'Initiate prosecution against the clerk', 'The department is ordered to pay compensation',
      'The panel fines the contractor', 'A fine of five hundred rupees', 'The member is removed from the roll', 'Compulsory hearing before the panel',
    ];
    for (const decision of refusedDecisions) {
      assert.throws(() => decide(heard, { at: '2026-12-16', decision, reasons: 'x' }), NoInventedConsequenceError, decision);
    }
    assert.throws(() => close(completed(), { at: '2026-11-21', reason: 'fine imposed' }), NoInventedConsequenceError);
    assert.throws(() => close(completed(), { at: '2026-11-21', reason: 'penalty' }), /No automatic fine, removal, court order or mandatory hearing is invented by this proposal\./);
    // "in order to" is ordinary English, not an order.
    const ok = decide(heard, { at: '2026-12-16', decision: 'Adopt alternative verification in order to restore access.', reasons: 'Evidence shows exclusion.' });
    assert.equal(ok.state, 'decided');
  });

  it('decide() accepts the pack\'s own remedy vocabulary (removal, remove, order, suspend) when no consequence is asserted', () => {
    const heard = heardSystemic();
    const allowed = [
      'Hazard removal at the site within 30 days; inspection report published.', // issue 025 possibleChange: "Inspection; hazard removal; lawful compensation"
      'Remove the step at the clinic entrance and install a ramp.',
      'Restore the pump to working order and publish the maintenance schedule.',
      'Publish the standing order on alternative verification.',
      'Suspend the device-based check at pilot outlets while alternatives are tested.',
      'Accessible support; remove exclusion; re-entry routes.', // issue 043 possibleChange
      'Dismiss the appeal; the exclusion is lawful and reversible.',
      'Refer the file to the prosecution and support agencies for their own lawful process.',
      'Remove the duplicate entries from the register and re-order the queue.',
    ];
    for (const decision of allowed) {
      assert.equal(decide(heard, { at: '2026-12-16', decision, reasons: 'Evidence shows exclusion (synthetic).' }).state, 'decided', decision);
    }
  });
});

describe('immutability and event discipline', () => {
  const ops = [
    ['issueReceipt', (k) => issueReceipt(k, { at: '2026-11-02' }), base],
    ['routeCase', (k) => routeCase(k, ROUTING), base],
    ['respond', (k) => respond(k, GOOD_RESPONSE), routed],
    ['transfer', (k) => transfer(k, { at: '2026-11-06', toOffice: 'Other office (synthetic)', verified: true, acknowledgedAt: '2026-11-06' }), routed],
    ['challengeClosure', (k) => challengeClosure(k, { at: '2026-11-19', grounds: 'No case-specific reasons.' }), responded],
    ['recordChange', (k) => recordChange(k, { at: '2026-11-19', kind: 'promised', description: 'x (synthetic)' }), responded],
    ['markProtected', (k) => markProtected(k, { at: '2026-11-03', reason: 'retaliation' }), base],
    ['referToVigilance', (k) => referToVigilance(k, { at: '2026-11-03', body: 'Vigilance body (synthetic)' }), base],
    ['flagUrgent', (k) => flagUrgent(k, { at: '2026-11-03' }), base],
    ['close', (k) => close(k, { at: '2026-11-21', reason: 'action-completed' }), completed],
    ['requestAdmission', (k) => requestAdmission(k, { at: '2026-11-06' }), () => routeCase(base({ participationRoute: 'systemic-review' }), ROUTING)],
  ];
  for (const [name, op, make] of ops) {
    it(`${name} never mutates its input and appends exactly one event`, () => {
      const input = make();
      const snapshot = structuredClone(input);
      const out = op(input);
      assert.deepEqual(input, snapshot, 'input was mutated');
      assert.notEqual(out, input);
      assert.equal(out.events.length, input.events.length + 1);
      assert.notEqual(out.events, input.events, 'events array is shared');
      out.events.push({ at: '2026-12-31', type: 'tamper', actorRole: 'system', data: {} });
      assert.equal(input.events.length, snapshot.events.length);
      const last = out.events.at(-2);
      for (const key of ['at', 'type', 'actorRole', 'data']) assert.ok(key in last, `event lacks ${key}`);
    });
  }

  it('events are chronological and never earlier than receipt', () => {
    assert.throws(() => issueReceipt(base(), { at: '2026-11-01' }), ValidationError);
    const k = routed();
    assert.throws(() => respond(k, { ...GOOD_RESPONSE, at: '2026-11-04' }), ValidationError);
    // onSilence() appends events too, so its `now` obeys the same rule.
    const lateRouted = routeCase(base({ channel: 'telephone' }), { ...ROUTING, at: '2026-11-20' }); // receipt overdue since 11-04
    assert.throws(() => onSilence(lateRouted, { now: '2026-11-10' }), ValidationError);
    assert.equal(onSilence(lateRouted, { now: '2026-11-20' }).events.length, lateRouted.events.length + 2);
  });
});

describe('deadlines', () => {
  it('digital receipt is due the same day; assisted receipt in two working days', () => {
    // Friday 2026-11-06
    const digital = deadlines(base({ receivedAt: '2026-11-06' }));
    assert.equal(digital.receiptDue, '2026-11-06');
    const assisted = deadlines(base({ receivedAt: '2026-11-06', channel: 'assisted' }));
    assert.equal(assisted.receiptDue, '2026-11-10'); // skips Saturday and Sunday
    for (const channel of ['offline', 'telephone', 'postal']) {
      assert.equal(deadlines(base({ receivedAt: '2026-11-06', channel })).receiptDue, '2026-11-10');
    }
  });

  it('holidays in the case calendar push the working-day receipt target', () => {
    const k = base({ receivedAt: '2026-11-06', channel: 'assisted', calendar: { holidays: ['2026-11-10'] } });
    assert.equal(deadlines(k).receiptDue, '2026-11-11');
    const two = base({ receivedAt: '2026-11-06', channel: 'postal', calendar: { weekendDays: [0, 6], holidays: ['2026-11-09', '2026-11-10'] } });
    assert.equal(deadlines(two).receiptDue, '2026-11-12');
  });

  it('routing is 7 calendar days and response 21 calendar days from receipt', () => {
    const d = deadlines(base({ receivedAt: '2026-11-06' }));
    assert.equal(d.routingDue, '2026-11-13');
    assert.equal(d.responseDue, '2026-11-27');
    assert.equal(d.admissionDue, undefined);
    assert.equal(d.hearingDue, undefined);
    assert.equal(d.decisionDue, undefined);
    assert.deepEqual(d.stages.map((s) => s.stage), ['receipt', 'routing', 'response']);
  });

  it('legalDeadlineDays overrides the 21-day response target and feeds owner.responseDueAt', () => {
    const k = base({ receivedAt: '2026-11-06', legalDeadlineDays: 30 });
    assert.equal(deadlines(k).responseDue, '2026-12-06');
    const r = routeCase(k, { ...ROUTING, at: '2026-11-09' });
    assert.equal(r.owner.responseDueAt, '2026-12-06');
    assert.equal(routed().owner.responseDueAt, '2026-11-23');
    const short = base({ receivedAt: '2026-11-06', legalDeadlineDays: 2 });
    assert.equal(deadlines(short).responseDue, '2026-11-08');
  });

  it('systemic review adds admission from receipt and hearing/decision from admission', () => {
    let k = routeCase(base({ participationRoute: 'systemic-review' }), ROUTING);
    let d = deadlines(k);
    assert.equal(d.admissionDue, '2026-12-02');
    assert.equal(d.hearingDue, undefined);
    assert.equal(d.decisionDue, undefined);
    k = requestAdmission(k, { at: '2026-11-06' });
    k = decideAdmission(k, { at: '2026-11-20', admitted: true, reasons: 'Recurring fault affecting many households (synthetic).' });
    d = deadlines(k);
    assert.equal(d.hearingDue, '2027-01-19'); // 2026-11-20 + 60
    assert.equal(d.decisionDue, '2027-02-18'); // 2026-11-20 + 90
    const declined = decideAdmission(requestAdmission(routeCase(base({ participationRoute: 'systemic-review' }), ROUTING), { at: '2026-11-06' }), { at: '2026-11-20', admitted: false, reasons: 'Individual matter (synthetic).' });
    assert.equal(declined.state, 'declined');
    assert.equal(deadlines(declined).hearingDue, undefined);
  });

  it('records satisfiedAt per stage', () => {
    const k = responded();
    const by = Object.fromEntries(deadlines(k).stages.map((s) => [s.stage, s.satisfiedAt]));
    assert.equal(by.receipt, null);
    assert.equal(by.routing, '2026-11-05');
    assert.equal(by.response, '2026-11-18');
    const interim = respond(routed(), { ...GOOD_RESPONSE, decision: 'interim' });
    assert.equal(Object.fromEntries(deadlines(interim).stages.map((s) => [s.stage, s.satisfiedAt])).response, null);
  });
});

describe('status and next actions', () => {
  it('reports overdue stages with days overdue, and not stages already satisfied', () => {
    const k = base({ receivedAt: '2026-11-02', channel: 'telephone' }); // receipt due 11-04, routing 11-09, response 11-23
    let st = status(k, { now: '2026-11-03' });
    assert.deepEqual(st.overdue, []);
    st = status(k, { now: '2026-11-10' });
    assert.deepEqual(st.overdue, [
      { stage: 'receipt', dueAt: '2026-11-04', daysOverdue: 6 },
      { stage: 'routing', dueAt: '2026-11-09', daysOverdue: 1 },
    ]);
    const late = routeCase(issueReceipt(k, { at: '2026-11-10' }), { ...ROUTING, at: '2026-11-10' });
    st = status(late, { now: '2026-11-30' });
    assert.deepEqual(st.overdue.map((o) => o.stage), ['response']);
    assert.equal(st.state, 'routed');
  });

  it('"Notify the responsible supervisor and enable review" when a response is overdue', () => {
    const st = status(routed(), { now: '2026-11-30' });
    assert.ok(st.nextActions.includes('Notify the responsible supervisor and enable review'));
  });

  it('"Request case-specific reasons, evidence and appeal information" when the latest response is boilerplate', () => {
    const st = status(respond(routed(), BOILERPLATE_RESPONSE), { now: '2026-11-19' });
    assert.ok(st.nextActions.includes('Request case-specific reasons, evidence and appeal information'));
    const good = status(responded(), { now: '2026-11-19' });
    assert.ok(!good.nextActions.includes('Request case-specific reasons, evidence and appeal information'));
  });

  it('"Coordinate a verified transfer; a referral is not a resolution" after a transfer that has not been re-routed', () => {
    const WRONG_OFFICE = 'Coordinate a verified transfer; a referral is not a resolution';
    const moved = transfer(routed(), { at: '2026-11-06', toOffice: 'Correct office (synthetic)', verified: true, acknowledgedAt: '2026-11-06' });
    assert.ok(status(moved, { now: '2026-11-06' }).nextActions.includes(WRONG_OFFICE));
    const rerouted = routeCase(moved, { ...ROUTING, at: '2026-11-07', leadOffice: 'Correct office (synthetic)' });
    assert.ok(!status(rerouted, { now: '2026-11-07' }).nextActions.includes(WRONG_OFFICE));
    assert.ok(!status(routed(), { now: '2026-11-06' }).nextActions.includes(WRONG_OFFICE));
    // A case that was never routed is silence, not wrong office: there is no office to transfer from.
    const never = status(base(), { now: '2026-11-15' });
    assert.ok(!never.nextActions.includes(WRONG_OFFICE));
    assert.deepEqual(never.nextActions, [
      'Notify the responsible supervisor and enable review',
      'Record overdue status safely; filing time is preserved',
      'Set a verified lead office, co-owners, applicable rules and an accountable response date',
    ]);
    assert.ok(status(base(), { now: '2026-11-05' }).nextActions.includes('Set a verified lead office, co-owners, applicable rules and an accountable response date'));
  });

  it('"Use protected referrals and appropriate rights/legal support; do not expose the person on a dashboard" first when protected', () => {
    const st = status(markProtected(base(), { at: '2026-11-03', reason: 'credible-harm' }), { now: '2026-11-03' });
    assert.equal(st.nextActions[0], 'Use protected referrals and appropriate rights/legal support; do not expose the person on a dashboard');
  });

  it('systemic next actions keep the pack\'s "retain lawful organising outside the platform" clause', () => {
    const open = status(routeCase(base({ participationRoute: 'systemic-review' }), ROUTING), { now: '2026-11-06' });
    assert.ok(open.nextActions.includes('Seek a hearing, representative scrutiny, eligible petition or audit review; retain lawful organising outside the platform'));
  });

  it('refusal with reasons points to the applicable remedy; vigilance referral keeps the allegation caveat', () => {
    const refused = respond(routed(), { ...GOOD_RESPONSE, decision: 'refusal' });
    assert.ok(status(refused, { now: '2026-11-19' }).nextActions.includes(
      'Use the applicable administrative, specialist or legal remedy after checking jurisdiction and deadlines'));
    const vig = referToVigilance(routed(), { at: '2026-11-06', body: 'Vigilance authority (synthetic)' });
    assert.ok(status(vig, { now: '2026-11-06' }).nextActions.some((a) => /allegations are not findings of guilt/.test(a)));
  });

  it('closed cases report nothing overdue', () => {
    const closed = close(completed(), { at: '2026-12-31', reason: 'action-completed' });
    assert.deepEqual(status(closed, { now: '2027-01-31' }).overdue, []);
  });
});

describe('assessResponse', () => {
  it('flags empty, short and stock-phrase reasons as boilerplate', () => {
    assert.equal(assessResponse({ decision: 'refusal' }).boilerplate, true);
    assert.ok(assessResponse({ decision: 'refusal' }).missing.includes('reasons'));
    assert.equal(assessResponse({ ...GOOD_RESPONSE, reasons: 'Disposed.' }).boilerplate, true);
    assert.ok(assessResponse({ ...GOOD_RESPONSE, reasons: 'Disposed.' }).missing.includes('case-specific-reasons'));
    const stock = 'Your complaint has been noted and forwarded to the concerned department for necessary action. The matter is disposed.';
    assert.ok(stock.split(/\s+/).length >= 12);
    assert.deepEqual(assessResponse({ ...GOOD_RESPONSE, reasons: stock }), { boilerplate: true, missing: ['case-specific-reasons'] });
    const stock2 = 'Dear applicant, your grievance has been taken on record and forwarded to the concerned authority for appropriate action. Necessary action will be taken. The matter is hereby closed.';
    assert.equal(assessResponse({ ...GOOD_RESPONSE, reasons: stock2 }).boilerplate, true);
  });

  it('flags missing evidence, jurisdiction or challenge routes', () => {
    assert.deepEqual(assessResponse({ ...GOOD_RESPONSE, evidence: [] }).missing, ['evidence']);
    assert.deepEqual(assessResponse({ ...GOOD_RESPONSE, jurisdiction: '' }).missing, ['jurisdiction']);
    assert.deepEqual(assessResponse({ ...GOOD_RESPONSE, challengeRoutes: [] }).missing, ['challengeRoutes']);
    assert.deepEqual(assessResponse({ ...GOOD_RESPONSE, challengeRoutes: ['X'] }).missing, ['challengeRoutes']);
    assert.deepEqual(assessResponse(BOILERPLATE_RESPONSE).missing, ['case-specific-reasons', 'evidence', 'jurisdiction', 'challengeRoutes']);
  });

  it('accepts a case-specific, complete response', () => {
    assert.deepEqual(assessResponse(GOOD_RESPONSE), { boilerplate: false, missing: [] });
    const withStock = { ...GOOD_RESPONSE, reasons: `${GOOD_RESPONSE.reasons} The earlier request was noted and forwarded for necessary action.` };
    assert.equal(assessResponse(withStock).boilerplate, false);
  });

  it('respond stores the assessment and rejects unknown route codes', () => {
    const k = respond(routed(), BOILERPLATE_RESPONSE);
    assert.equal(k.responses[0].assessment.boilerplate, true);
    assert.equal(k.events.at(-1).data.assessment.boilerplate, true);
    assert.throws(() => respond(routed(), { ...GOOD_RESPONSE, challengeRoutes: ['Z'] }), ValidationError);
    assert.throws(() => respond(routed(), { ...GOOD_RESPONSE, decision: 'maybe' }), ValidationError);
  });
});

describe('transfers never close', () => {
  it('records the transfer and leaves state and closure untouched', () => {
    for (const make of [routed, responded]) {
      const k = make();
      const t = transfer(k, { at: '2026-11-19', toOffice: 'Correct office (synthetic)', verified: true, acknowledgedAt: '2026-11-19' });
      assert.equal(t.state, k.state);
      assert.equal(t.closure, null);
      assert.equal(t.transfers.length, 1);
      assert.deepEqual(t.transfers[0], { at: '2026-11-19', fromOffice: ROUTING.leadOffice, toOffice: 'Correct office (synthetic)', verified: true, acknowledgedAt: '2026-11-19' });
      assert.equal(t.events.at(-1).type, 'transfer-recorded');
      assert.equal(t.owner.leadOffice, ROUTING.leadOffice, 'ownership changes only through human-validated routing');
    }
    const re = routeCase(transfer(routed(), { at: '2026-11-06', toOffice: 'Correct office (synthetic)', verified: true, acknowledgedAt: '2026-11-06' }), { ...ROUTING, at: '2026-11-07', leadOffice: 'Correct office (synthetic)' });
    assert.equal(re.owner.leadOffice, 'Correct office (synthetic)');
    assert.equal(re.owner.responseDueAt, '2026-11-23', 'filing time preserved on re-routing');
    assert.equal(re.events.at(-1).data.previousLeadOffice, ROUTING.leadOffice);
  });

  it('records a transfer before routing, with fromOffice null', () => {
    const t = transfer(base(), { at: '2026-11-03', toOffice: 'Correct office (synthetic)', verified: true, acknowledgedAt: '2026-11-03' });
    assert.equal(t.state, 'received');
    assert.equal(t.owner, null);
    assert.deepEqual(t.transfers[0], { at: '2026-11-03', fromOffice: null, toOffice: 'Correct office (synthetic)', verified: true, acknowledgedAt: '2026-11-03' });
    assert.ok(status(t, { now: '2026-11-03' }).nextActions.includes('Coordinate a verified transfer; a referral is not a resolution'));
  });

  it('re-routes after a response once a verified transfer is on the record; the state and the response date are unchanged', () => {
    const WRONG_OFFICE = 'Coordinate a verified transfer; a referral is not a resolution';
    const CORRECT = { at: '2026-11-20', toOffice: 'Correct office (synthetic)', verified: true, acknowledgedAt: '2026-11-20' };
    // Pack §5 Wrong office realistically begins with an interim "we are checking jurisdiction" answer.
    const interim = respond(routed(), { ...GOOD_RESPONSE, decision: 'interim' });
    assert.throws(() => routeCase(interim, { ...ROUTING, at: '2026-11-19', leadOffice: 'Correct office (synthetic)' }), InvalidTransitionError, 'no transfer on the record yet');
    assert.throws(() => routeCase(interim, { ...ROUTING, at: '2026-11-19', leadOffice: 'Correct office (synthetic)' }), /needs a verified transfer on the record/);
    const moved = transfer(interim, CORRECT);
    assert.ok(status(moved, { now: '2026-11-20' }).nextActions.includes(WRONG_OFFICE));
    const re = routeCase(moved, { ...ROUTING, at: '2026-11-21', leadOffice: 'Correct office (synthetic)' });
    assert.equal(re.state, 'responded', 'a re-route after a response does not rewind the state');
    assert.equal(re.owner.leadOffice, 'Correct office (synthetic)');
    assert.equal(re.owner.responseDueAt, '2026-11-23', 'the response target still counts from filing');
    assert.equal(re.events.at(-1).type, 'case-routed');
    assert.equal(re.events.at(-1).data.previousLeadOffice, ROUTING.leadOffice);
    assert.equal(re.events.at(-1).data.afterTransfer, true);
    assert.equal(re.responses.length, 1, 'the interim response stays on the record');
    assert.ok(!status(re, { now: '2026-11-21' }).nextActions.includes(WRONG_OFFICE));
    assert.throws(() => routeCase(re, { ...ROUTING, at: '2026-11-22', leadOffice: 'Third office (synthetic)' }), InvalidTransitionError, 'one re-route per verified transfer');
    // The receiving office then answers and the case closes normally.
    const answered = respond(re, { ...GOOD_RESPONSE, at: '2026-11-22', jurisdiction: 'The correct office holds the record (synthetic).' });
    assert.equal(answered.responses.at(-1).actorRole, 'lead-office');
    const done = recordChange(answered, { at: '2026-11-23', kind: 'completed', description: 'Entitlement restored (synthetic).' });
    assert.equal(close(done, { at: '2026-11-24', reason: 'action-completed' }).state, 'closed');
    // The same after a final response, and on the systemic path, where the state is left alone too.
    const afterFinal = routeCase(transfer(responded(), CORRECT), { ...ROUTING, at: '2026-11-21', leadOffice: 'Correct office (synthetic)' });
    assert.equal(afterFinal.state, 'responded');
    assert.equal(afterFinal.owner.leadOffice, 'Correct office (synthetic)');
    const pending = requestAdmission(routeCase(base({ participationRoute: 'systemic-review' }), ROUTING), { at: '2026-11-06' });
    const rePending = routeCase(transfer(pending, { ...CORRECT, at: '2026-11-07', acknowledgedAt: '2026-11-07' }), { ...ROUTING, at: '2026-11-08', leadOffice: 'Correct office (synthetic)' });
    assert.equal(rePending.state, 'admission-pending');
    assert.equal(rePending.owner.leadOffice, 'Correct office (synthetic)');
    // From received or routed the re-route still lands in "routed", as before.
    assert.equal(routeCase(transfer(routed(), { ...CORRECT, at: '2026-11-06', acknowledgedAt: '2026-11-06' }), { ...ROUTING, at: '2026-11-07', leadOffice: 'Correct office (synthetic)' }).state, 'routed');
    assert.equal(routeCase(transfer(base(), { ...CORRECT, at: '2026-11-03', acknowledgedAt: '2026-11-03' }), { ...ROUTING, at: '2026-11-04', leadOffice: 'Correct office (synthetic)' }).state, 'routed');
  });

  it('close() refuses while a verified transfer awaits re-routing, except a withdrawal by the filer', () => {
    const WRONG_OFFICE = 'Coordinate a verified transfer; a referral is not a resolution';
    const CORRECT = { at: '2026-11-21', toOffice: 'Correct office (synthetic)', verified: true, acknowledgedAt: '2026-11-21' };
    const moved = transfer(completed(), CORRECT);
    assert.ok(status(moved, { now: '2026-11-22' }).nextActions.includes(WRONG_OFFICE));
    assert.throws(() => close(moved, { at: '2026-11-22', reason: 'action-completed' }), ReferralNotResolutionError);
    assert.throws(() => close(moved, { at: '2026-11-22', reason: 'duplicate' }), /a verified transfer is pending; route the case to the receiving office/);
    assert.throws(() => close(moved, { at: '2026-11-22', reason: 'action-completed' }), BoilerplateClosureError, 'still a closure refusal');
    // A jurisdiction refusal followed by a transfer is the §1 "endless transfer / unexplained closure" pattern.
    const refusal = respond(routed(), { ...GOOD_RESPONSE, decision: 'refusal', jurisdiction: 'The billing authority holds it (synthetic).' });
    const refusalMoved = transfer(refusal, { ...CORRECT, at: '2026-11-19', acknowledgedAt: '2026-11-19' });
    assert.throws(() => close(refusalMoved, { at: '2026-11-20', reason: 'refused-with-reasons' }), ReferralNotResolutionError);
    // Once the receiving office is named the closure rules apply as usual.
    const re = routeCase(moved, { ...ROUTING, at: '2026-11-22', leadOffice: 'Correct office (synthetic)' });
    assert.equal(close(re, { at: '2026-11-23', reason: 'action-completed' }).state, 'closed');
    // The filer can always withdraw.
    const withdrawn = close(moved, { at: '2026-11-22', reason: 'withdrawn-by-filer' });
    assert.equal(withdrawn.state, 'closed');
    assert.equal(withdrawn.events.at(-1).actorRole, 'filer');
    // A pending transfer on a closed case (after withdrawal) cannot be routed: the case is closed.
    assert.throws(() => routeCase(withdrawn, { ...ROUTING, at: '2026-11-23', leadOffice: 'Correct office (synthetic)' }), InvalidTransitionError);
  });

  it('rejects a transfer to the same office and from a closed case', () => {
    assert.throws(() => transfer(routed(), { at: '2026-11-06', toOffice: ROUTING.leadOffice, verified: true, acknowledgedAt: '2026-11-06' }), ValidationError);
    const closed = close(completed(), { at: '2026-11-21', reason: 'action-completed' });
    assert.throws(() => transfer(closed, { at: '2026-11-22', toOffice: 'Other', verified: true, acknowledgedAt: '2026-11-22' }), InvalidTransitionError);
  });
});

describe('closure and challenge', () => {
  it('closes on a reasoned response and records the closure', () => {
    const k = close(completed(), { at: '2026-11-21', reason: 'action-completed' });
    assert.equal(k.state, 'closed');
    assert.deepEqual(k.closure, { at: '2026-11-21', reason: 'action-completed' });
    assert.equal(k.events.at(-1).type, 'case-closed');
    assert.equal(k.events.at(-1).data.fromState, 'responded');
    const refusal = respond(routed(), { ...GOOD_RESPONSE, decision: 'refusal' });
    assert.equal(close(refusal, { at: '2026-11-19', reason: 'refused-with-reasons' }).state, 'closed');
    assert.equal(close(responded(), { at: '2026-11-19', reason: 'withdrawn-by-filer' }).events.at(-1).actorRole, 'filer');
    assert.equal(close(responded(), { at: '2026-11-19', reason: 'duplicate' }).state, 'closed');
  });

  it('challengeClosure preserves the challenge, reopens, and records case-specific-reasons-requested', () => {
    const closed = close(completed(), { at: '2026-11-21', reason: 'action-completed' });
    const c = challengeClosure(closed, { at: '2026-11-25', grounds: 'The entitlement was not actually restored (synthetic).' });
    assert.equal(c.state, 'responded');
    assert.equal(c.closure, null);
    assert.equal(c.challenges.length, 1);
    assert.deepEqual(c.challenges[0], { at: '2026-11-25', grounds: 'The entitlement was not actually restored (synthetic).', reopened: true });
    assert.equal(c.events.at(-1).type, 'case-specific-reasons-requested');
    assert.deepEqual(c.events.at(-1).data.previousClosure, { at: '2026-11-21', reason: 'action-completed' });
    // the closure stays in the event log
    assert.ok(c.events.some((e) => e.type === 'case-closed'));
    // a challenge to an unclosed refusal is preserved without reopening
    const open = challengeClosure(respond(routed(), BOILERPLATE_RESPONSE), { at: '2026-11-19', grounds: 'No reasons given.' });
    assert.equal(open.state, 'responded');
    assert.equal(open.challenges[0].reopened, false);
  });

  it('a reopened case cannot be re-closed on the same response; a new reasoned response must address the challenge', () => {
    const closed = close(completed(), { at: '2026-11-21', reason: 'action-completed' });
    const reopened = challengeClosure(closed, { at: '2026-11-22', grounds: 'The entitlement was not actually restored (synthetic).' });
    assert.throws(() => close(reopened, { at: '2026-11-22', reason: 'action-completed' }), BoilerplateClosureError);
    assert.throws(() => close(reopened, { at: '2026-11-25', reason: 'withdrawn-by-filer' }), /a challenge is pending/);
    const answered = respond(reopened, {
      ...GOOD_RESPONSE,
      at: '2026-11-26',
      evidence: ['Second delivery register check (synthetic)'],
      reasons: 'The register shows the entitlement was issued at the following distribution; the earlier gap is explained by a stock delay at the shop.',
    });
    assert.equal(close(answered, { at: '2026-11-27', reason: 'action-completed' }).state, 'closed');
    // A challenge to an open refusal is pending in the same way until a new response is recorded.
    const refusal = respond(routed(), { ...GOOD_RESPONSE, decision: 'refusal' });
    const challenged = challengeClosure(refusal, { at: '2026-11-19', grounds: 'The cited rule does not apply (synthetic).' });
    assert.throws(() => close(challenged, { at: '2026-11-20', reason: 'refused-with-reasons' }), BoilerplateClosureError);
  });
});

/** A systemic case taken through to "heard". */
function heardSystemic() {
  let k = routeCase(base({ participationRoute: 'systemic-review', issueId: '092' }), ROUTING);
  k = respond(k, { ...GOOD_RESPONSE, at: '2026-11-06' });
  k = requestAdmission(k, { at: '2026-11-07', grounds: 'Recurring fault (synthetic).' });
  k = decideAdmission(k, { at: '2026-11-20', admitted: true, reasons: 'Recurring fault affecting many households (synthetic).' });
  k = scheduleHearing(k, { at: '2026-11-21', hearingAt: '2026-12-15' });
  k = recordHearing(k, {
    at: '2026-12-15',
    evidence: ['Failure logs (synthetic)'],
    counterarguments: ['Override increases leakage risk (synthetic).'],
    agreement: ['Alternative verification at every outlet.'],
    dissent: ['Withdraw the device check entirely (synthetic).', 'Pilot is too small (synthetic).'],
  });
  return k;
}

describe('systemic path', () => {
  it('walks received -> routed -> responded -> admission-pending -> admitted -> hearing-scheduled -> heard -> decided -> closed', () => {
    let k = routeCase(base({ participationRoute: 'systemic-review', issueId: '092' }), ROUTING);
    k = respond(k, { ...GOOD_RESPONSE, at: '2026-11-06' });
    assert.equal(k.state, 'responded');
    k = requestAdmission(k, { at: '2026-11-07' });
    assert.equal(k.state, 'admission-pending');
    const interim = respond(k, { ...GOOD_RESPONSE, at: '2026-11-08', decision: 'interim' });
    assert.equal(interim.state, 'admission-pending', 'a response during the systemic path does not change state');
    k = decideAdmission(k, { at: '2026-11-20', admitted: true, reasons: 'Recurring fault (synthetic).' });
    assert.equal(k.state, 'admitted');
    // hearingAt earlier than at is a date error, checked while the case is still "admitted".
    assert.throws(() => scheduleHearing(k, { at: '2026-11-21', hearingAt: '2026-11-20' }), ValidationError);
    k = scheduleHearing(k, { at: '2026-11-21', hearingAt: '2026-12-15' });
    assert.equal(k.state, 'hearing-scheduled');
    assert.throws(() => scheduleHearing(k, { at: '2026-11-21', hearingAt: '2026-12-16' }), InvalidTransitionError);
    k = recordHearing(k, { at: '2026-12-15', dissent: 'One group dissents (synthetic).' });
    assert.equal(k.state, 'heard');
    assert.deepEqual(k.dissent, [{ at: '2026-12-15', text: 'One group dissents (synthetic).' }]);
    k = decide(k, { at: '2026-12-20', decision: 'Adopt alternative verification; review implementation in 90 days.', reasons: 'Exclusion is shown (synthetic).' });
    assert.equal(k.state, 'decided');
    const promised = recordChange(k, { at: '2026-12-20', kind: 'promised', description: 'Roll-out (synthetic).' });
    assert.throws(() => close(promised, { at: '2026-12-21', reason: 'action-completed' }), BoilerplateClosureError);
    const done = recordChange(promised, { at: '2027-01-10', kind: 'completed', description: 'Rolled out (synthetic).' });
    assert.equal(close(done, { at: '2027-01-11', reason: 'action-completed' }).state, 'closed');
  });

  it('closes on a systemic decision or a reasoned refusal of admission without a separate lead-office response', () => {
    const systemic = () => routeCase(base({ participationRoute: 'systemic-review', issueId: '092' }), ROUTING);
    let k = requestAdmission(systemic(), { at: '2026-11-06' });
    k = decideAdmission(k, { at: '2026-11-20', admitted: true, reasons: 'Recurring fault affecting many households (synthetic).' });
    k = scheduleHearing(k, { at: '2026-11-21', hearingAt: '2026-12-15' });
    k = recordHearing(k, { at: '2026-12-15', evidence: ['Failure logs (synthetic)'] });
    k = decide(k, { at: '2026-12-20', decision: 'Adopt alternative verification at all pilot outlets.', reasons: 'Exclusion is shown (synthetic).' });
    assert.equal(k.responses.length, 0);
    // The decision satisfies the response stage: a decided case is not silence.
    const st = status(k, { now: '2026-12-23' });
    assert.deepEqual(st.overdue.map((o) => o.stage), ['receipt']);
    assert.ok(!st.nextActions.includes('Give a reasoned response: evidence, jurisdiction, proposed action or refusal, and how to challenge it'));
    assert.equal(deadlines(k).stages.find((s) => s.stage === 'response').satisfiedAt, '2026-12-20');
    // Still a promise until completion is recorded.
    const promised = recordChange(k, { at: '2026-12-20', kind: 'promised', description: 'Roll-out (synthetic).' });
    assert.throws(() => close(promised, { at: '2026-12-21', reason: 'action-completed' }), BoilerplateClosureError);
    const done = recordChange(promised, { at: '2027-01-10', kind: 'completed', description: 'Rolled out (synthetic).' });
    const verified = recordChange(done, { at: '2027-01-20', kind: 'verified', verifier: 'verifier', description: 'Checked at every outlet (synthetic).' });
    assert.equal(close(verified, { at: '2027-01-21', reason: 'action-completed' }).state, 'closed');
    // An interim-only lead-office response does not block closure once the panel has decided.
    const interimThenDecided = close(
      recordChange(respond(k, { ...GOOD_RESPONSE, at: '2026-12-21', decision: 'interim' }), { at: '2027-01-10', kind: 'completed', description: 'Rolled out (synthetic).' }),
      { at: '2027-01-11', reason: 'action-completed' },
    );
    assert.equal(interimThenDecided.state, 'closed');
    // A boilerplate lead-office response still blocks closure: case-specific reasons are owed.
    const boiler = respond(k, { ...BOILERPLATE_RESPONSE, at: '2026-12-21' });
    assert.throws(() => close(recordChange(boiler, { at: '2027-01-10', kind: 'completed', description: 'x' }), { at: '2027-01-11', reason: 'action-completed' }), BoilerplateClosureError);
    // Declined admission with public reasons closes as refused-with-reasons.
    const declined = decideAdmission(requestAdmission(systemic(), { at: '2026-11-06' }), { at: '2026-11-20', admitted: false, reasons: 'Individual matter (synthetic).' });
    assert.equal(declined.responses.length, 0);
    assert.equal(close(declined, { at: '2026-11-21', reason: 'refused-with-reasons' }).state, 'closed');
    assert.throws(() => close(declined, { at: '2026-11-21', reason: 'action-completed' }), BoilerplateClosureError);
    assert.deepEqual(status(declined, { now: '2026-11-30' }).overdue.map((o) => o.stage), ['receipt']);
    // The individual route is unchanged: no response, no closure.
    assert.throws(() => close({ ...responded(), responses: [], state: 'responded' }, { at: '2026-11-19', reason: 'duplicate' }), BoilerplateClosureError);
  });

  it('preserves every dissent entry and requires public reasons for admission decisions', () => {
    const k = heardSystemic();
    assert.equal(k.dissent.length, 2);
    assert.equal(k.events.at(-1).data.counterarguments.length, 1);
    const pending = requestAdmission(routeCase(base({ participationRoute: 'systemic-review' }), ROUTING), { at: '2026-11-06' });
    assert.throws(() => decideAdmission(pending, { at: '2026-11-07', admitted: false, reasons: '' }), ValidationError);
    assert.throws(() => decideAdmission(pending, { at: '2026-11-07', admitted: 'yes', reasons: 'x' }), ValidationError);
  });
});

describe('protection, vigilance and urgency', () => {
  it('markProtected hides the case from public summaries and records a protected referral', () => {
    const k = markProtected(routed(), { at: '2026-11-06', reason: 'retaliation' });
    assert.equal(k.flags.protected, true);
    assert.equal(k.referrals.length, 1);
    assert.equal(k.referrals[0].kind, 'protected');
    assert.match(k.referrals[0].note, /do not expose the person on a dashboard/);
    assert.equal(toPublicSummary(k, { now: '2026-11-06' }), null);
    assert.notEqual(toPublicSummary(routed(), { now: '2026-11-06' }), null);
    assert.throws(() => markProtected(routed(), { at: '2026-11-06', reason: 'other' }), ValidationError);
  });

  it('referToVigilance records the allegation caveat and is never a resolution', () => {
    const k = referToVigilance(routed(), { at: '2026-11-06', body: 'Competent vigilance authority (synthetic)' });
    assert.equal(k.referrals[0].kind, 'vigilance');
    assert.equal(k.referrals[0].note, 'Allegations are not findings of guilt.');
    assert.equal(k.events.at(-1).data.isResolution, false);
    assert.equal(k.state, 'routed');
  });

  it('flagUrgent records the emergency-services notice', () => {
    const k = flagUrgent(base(), { at: '2026-11-02' });
    assert.equal(k.flags.urgent, true);
    assert.equal(k.referrals[0].kind, 'emergency');
    assert.match(k.referrals[0].note, /not an emergency responder/);
  });
});

describe('toPublicSummary', () => {
  it('exposes only the six safe keys and never free text, owner names or the case id', () => {
    const withReceipt = routeCase(issueReceipt(base(), { at: '2026-11-02' }), ROUTING);
    const k = challengeClosure(recordChange(respond(withReceipt, GOOD_RESPONSE), { at: '2026-11-19', kind: 'promised', description: 'x (synthetic)' }), { at: '2026-11-20', grounds: 'y' });
    const pub = toPublicSummary(k, { now: '2026-11-30' });
    assert.deepEqual(Object.keys(pub).sort(), ['changeCounts', 'hasPreservedChallenge', 'issueId', 'overdueStages', 'participationRoute', 'state']);
    assert.deepEqual(pub, {
      issueId: '077',
      participationRoute: 'individual-remedy',
      state: 'responded',
      overdueStages: [],
      changeCounts: { promised: 1, completed: 0, verified: 0 },
      hasPreservedChallenge: true,
    });
    const text = JSON.stringify(pub);
    assert.doesNotMatch(text, /SYN-/);
    assert.doesNotMatch(text, /household/);
    assert.doesNotMatch(text, /Food and civil-supplies/);
  });

  it('lists overdue stages', () => {
    assert.deepEqual(toPublicSummary(base(), { now: '2026-11-30' }).overdueStages, ['receipt', 'routing', 'response']);
  });
});

describe('onSilence', () => {
  it('appends supervisor-notified and review-enabled with filingTimePreserved when overdue and silent', () => {
    const k = base({ channel: 'telephone' });
    const out = onSilence(k, { now: '2026-11-10' });
    assert.equal(out.events.length, k.events.length + 2);
    const [notified, enabled] = out.events.slice(-2);
    assert.equal(notified.type, 'supervisor-notified');
    assert.equal(notified.data.filingTimePreserved, true);
    assert.equal(notified.data.receivedAt, '2026-11-02');
    assert.deepEqual(notified.data.stages, ['receipt', 'routing']);
    assert.equal(enabled.type, 'review-enabled');
    assert.equal(enabled.data.filingTimePreserved, true);
    assert.equal(notified.actorRole, 'system');
    assert.equal(out.state, 'received');
    assert.equal(k.events.length, 1, 'input untouched');
  });

  it('treats an interim-only response as silence on the final response, like status() does', () => {
    const withReceipt = routeCase(issueReceipt(base(), { at: '2026-11-02' }), ROUTING);
    const interim = respond(withReceipt, { ...GOOD_RESPONSE, decision: 'interim' }); // response due 2026-11-23
    assert.equal(onSilence(interim, { now: '2026-11-20' }), interim, 'nothing overdue yet');
    assert.deepEqual(status(interim, { now: '2026-11-20' }).overdue, []);
    const st = status(interim, { now: '2027-03-01' });
    assert.deepEqual(st.overdue.map((o) => o.stage), ['response']);
    assert.ok(st.nextActions.includes('Notify the responsible supervisor and enable review'));
    const out = onSilence(interim, { now: '2027-03-01' });
    assert.equal(out.events.length, interim.events.length + 2);
    assert.equal(out.events.at(-2).type, 'supervisor-notified');
    assert.deepEqual(out.events.at(-2).data.stages, ['response']);
    assert.equal(out.events.at(-1).type, 'review-enabled');
    assert.equal(out.events.at(-1).data.filingTimePreserved, true);
    // A final response ends the silence.
    const final = respond(interim, { ...GOOD_RESPONSE, at: '2026-11-25' });
    assert.equal(onSilence(final, { now: '2027-03-01' }), final);
  });

  it('agrees with status(): the supervisor-notice actions appear exactly when onSilence() would append events', () => {
    const SILENCE = 'Notify the responsible supervisor and enable review';
    const RECORD = 'Record overdue status safely; filing time is preserved';
    const systemic = () => routeCase(base({ participationRoute: 'systemic-review', issueId: '092' }), ROUTING);
    const admittedAfterFinal = decideAdmission(requestAdmission(respond(systemic(), { ...GOOD_RESPONSE, at: '2026-11-06' }), { at: '2026-11-07' }), { at: '2026-11-08', admitted: true, reasons: 'Recurring fault (synthetic).' });
    const fixtures = [
      [base({ channel: 'telephone' }), '2026-11-10', true], // receipt and routing overdue, nothing answered
      [base(), '2026-11-02', false], // nothing overdue yet (a digital receipt is due the same day)
      [routed(), '2026-11-30', true], // response overdue
      [respond(routed(), { ...GOOD_RESPONSE, decision: 'interim' }), '2027-03-01', true], // interim only is silence on the final response
      [responded(), '2026-12-31', false], // final response; the unissued receipt is overdue but it is not silence
      [admittedAfterFinal, '2027-03-01', false], // final response; receipt, hearing and decision overdue
      [requestAdmission(systemic(), { at: '2026-11-06' }), '2027-03-01', true], // no response, admission overdue
      [close(completed(), { at: '2026-11-21', reason: 'action-completed' }), '2027-01-31', false], // closed
    ];
    for (const [k, now, expected] of fixtures) {
      const st = status(k, { now });
      const appended = onSilence(k, { now }).events.length - k.events.length;
      assert.equal(isSilent(k, now), expected, `isSilent ${k.state} at ${now}`);
      assert.equal(st.nextActions.includes(SILENCE), expected, `status ${k.state} at ${now}`);
      assert.equal(st.nextActions.includes(RECORD), expected, `status record ${k.state} at ${now}`);
      assert.equal(appended, expected ? 2 : 0, `onSilence ${k.state} at ${now}`);
    }
  });

  it('a final response with an overdue stage lists the stage without the silence actions', () => {
    const OVERDUE = 'Record overdue status safely; a response exists but a process target was missed';
    const r = responded(); // no receipt was ever issued
    const st = status(r, { now: '2026-12-31' });
    assert.deepEqual(st.overdue.map((o) => o.stage), ['receipt']);
    assert.ok(!st.nextActions.includes('Notify the responsible supervisor and enable review'));
    assert.ok(!st.nextActions.includes('Record overdue status safely; filing time is preserved'));
    assert.ok(st.nextActions.includes(OVERDUE));
    assert.equal(onSilence(r, { now: '2026-12-31' }), r);
    // Nothing overdue: no overdue action either.
    const tidy = respond(routeCase(issueReceipt(base(), { at: '2026-11-02' }), ROUTING), GOOD_RESPONSE);
    assert.deepEqual(status(tidy, { now: '2026-11-19' }).overdue, []);
    assert.ok(!status(tidy, { now: '2026-11-19' }).nextActions.includes(OVERDUE));
    assert.ok(!status(issueReceipt(base(), { at: '2026-11-02' }), { now: '2026-11-03' }).nextActions.includes(OVERDUE));
    // While silent, the silence pair is shown and the plain overdue action is not.
    const silent = status(routed(), { now: '2026-11-30' });
    assert.ok(silent.nextActions.includes('Notify the responsible supervisor and enable review'));
    assert.ok(!silent.nextActions.includes(OVERDUE));
    // Systemic: a final response and admission, hearing and decision long overdue.
    let k = respond(routeCase(base({ participationRoute: 'systemic-review', issueId: '092' }), ROUTING), { ...GOOD_RESPONSE, at: '2026-11-06' });
    k = decideAdmission(requestAdmission(k, { at: '2026-11-07' }), { at: '2026-11-08', admitted: true, reasons: 'Recurring fault (synthetic).' });
    const late = status(k, { now: '2027-03-01' });
    assert.deepEqual(late.overdue.map((o) => o.stage), ['receipt', 'hearing', 'decision']);
    assert.ok(!late.nextActions.includes('Notify the responsible supervisor and enable review'));
    assert.ok(late.nextActions.includes(OVERDUE));
    assert.equal(onSilence(k, { now: '2027-03-01' }), k);
  });

  it('is a no-op when nothing is overdue, when a response exists, or when already notified', () => {
    const k = base({ channel: 'telephone' });
    assert.equal(onSilence(k, { now: '2026-11-03' }), k);
    const r = responded();
    assert.equal(onSilence(r, { now: '2026-12-31' }), r);
    const once = onSilence(k, { now: '2026-11-10' });
    assert.equal(onSilence(once, { now: '2026-11-12' }), once, 'same overdue stages: no second notice');
    const again = onSilence(once, { now: '2026-11-30' });
    assert.equal(again.events.length, once.events.length + 2, 'a newly overdue stage triggers a fresh notice');
    assert.deepEqual(again.events.at(-2).data.stages, ['response']);
  });
});

describe('suggestOwner', () => {
  it('is advisory and mirrors the issue card', () => {
    const s = suggestOwner('077');
    assert.deepEqual(s.indicative, getIssue('077').answer);
    assert.equal(s.requiresHumanValidation, true);
    assert.match(s.note, /Owners require current state\/sector validation/);
    assert.deepEqual(Object.keys(s).sort(), ['indicative', 'note', 'requiresHumanValidation']);
  });
});

describe('state enum', () => {
  it('lists the ten states from the contract', () => {
    assert.deepEqual([...STATES], ['received', 'routed', 'responded', 'admission-pending', 'admitted', 'declined', 'hearing-scheduled', 'heard', 'decided', 'closed']);
  });
});
