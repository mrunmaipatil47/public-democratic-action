/**
 * The synthetic case: creation and every transition.
 *
 * All functions are pure. They never mutate the input case; each returns a
 * fresh `structuredClone` with exactly one event appended. The engine records,
 * reminds and escalates review. It never invents an enforcement consequence.
 *
 * @module workflow/case
 */

import { compareDates, normaliseCalendar, parseDate } from './calendar.mjs';
import { ROUTE_CODES, getIssue, normaliseIssueId } from './data.mjs';
import { deadlines } from './deadlines.mjs';
import {
  BoilerplateClosureError,
  HumanValidationRequiredError,
  IndependentVerifierRequiredError,
  InvalidTransitionError,
  NoInventedConsequenceError,
  UnverifiedTransferError,
  ValidationError,
} from './errors.mjs';
import { assertSafeRecord, assertSynthetic, rejectPersonalData } from './guards.mjs';
import { findEvent, lastEventIndex, latestResponse, systemicOutcomeAt } from './inspect.mjs';
import { NOTES } from './vocabulary.mjs';

/** @typedef {import('./types.mjs').Case} Case */
/** @typedef {import('./types.mjs').CaseEvent} CaseEvent */
/** @typedef {import('./types.mjs').ActorRole} ActorRole */
/** @typedef {import('./types.mjs').CaseState} CaseState */
/** @typedef {import('./types.mjs').ResponseInput} ResponseInput */
/** @typedef {import('./types.mjs').ResponseAssessment} ResponseAssessment */

export const PARTICIPATION_ROUTES = Object.freeze(/** @type {const} */ (['individual-remedy', 'systemic-review', 'policy-or-law']));
export const CHANNELS = Object.freeze(/** @type {const} */ (['assisted', 'offline', 'telephone', 'postal', 'digital']));
export const ATTRIBUTIONS = Object.freeze(/** @type {const} */ (['anonymous', 'organisation', 'named']));
export const STATES = Object.freeze(/** @type {const} */ ([
  'received', 'routed', 'responded', 'admission-pending', 'admitted', 'declined',
  'hearing-scheduled', 'heard', 'decided', 'closed',
]));
export const ACTOR_ROLES = Object.freeze(/** @type {const} */ ([
  'filer', 'assistant', 'intake', 'lead-office', 'supervisor', 'reviewer', 'hearing-panel', 'verifier', 'system',
]));
export const RESPONSE_DECISIONS = Object.freeze(/** @type {const} */ (['action', 'refusal', 'interim']));
export const CHANGE_KINDS = Object.freeze(/** @type {const} */ (['promised', 'completed', 'verified']));
export const INDEPENDENT_VERIFIERS = Object.freeze(/** @type {const} */ (['verifier', 'reviewer']));
export const CLOSE_REASONS = Object.freeze(/** @type {const} */ (['action-completed', 'refused-with-reasons', 'withdrawn-by-filer', 'duplicate']));
export const PROTECTION_REASONS = Object.freeze(/** @type {const} */ (['retaliation', 'credible-harm']));

/** Stock phrases that, with nothing else, make a response boilerplate. */
export const STOCK_PHRASES = Object.freeze([
  'disposed', 'disposed of', 'disposed off', 'noted', 'taken on record', 'forwarded', 'forwarded for necessary action',
  'forwarded to the concerned department', 'forwarded to concerned department', 'forwarded to the concerned authority',
  'concerned department', 'concerned authority', 'for necessary action', 'necessary action', 'necessary action taken',
  'necessary action will be taken', 'appropriate action', 'suitable action', 'action taken', 'needful',
  'under consideration', 'under process', 'under examination', 'being examined', 'will be looked into', 'looked into',
  'no action required', 'closed', 'resolved', 'matter closed', 'referred', 'transferred',
]);

/** Words ignored when checking whether anything case-specific remains after stock phrases are removed. */
const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'your', 'our', 'this', 'that', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'be',
  'and', 'or', 'of', 'to', 'for', 'in', 'on', 'by', 'it', 'its', 'as', 'at', 'with', 'matter', 'case', 'complaint',
  'grievance', 'request', 'application', 'issue', 'hereby', 'please', 'kindly', 'note', 'thank', 'you', 'regards',
  'sir', 'madam', 'dear', 'applicant', 'complainant', 'accordingly', 'hence', 'therefore', 'same', 'now',
]);

/**
 * Phrases that assert an enforcement consequence (pack §5 closing line: "No
 * automatic fine, removal, court order or mandatory hearing is invented by
 * this proposal"). The rules match the consequence, not the bare word: "hazard
 * removal", "remove the step", "working order", "a standing order", "suspend
 * the device check" and "dismiss the appeal" are ordinary remedy vocabulary
 * from the issue cards and stay allowed; "removal of the officer", "suspend
 * the clerk", "a fine of", "court order" and "mandatory hearing" are refused.
 */
const PERSON_OR_LICENCE =
  String.raw`(?:of\s+|against\s+)?(?:the\s+|an?\s+|this\s+|that\s+|any\s+|every\s+|all\s+|each\s+|such\s+)?` +
  String.raw`(?:responsible\s+|concerned\s+|erring\s+|accused\s+|named\s+|defaulting\s+|senior\s+|junior\s+)?` +
  String.raw`(?:officer|officers|official|officials|clerk|clerks|employee|employees|staff|head|heads|incumbent|incumbents` +
  String.raw`|member|members|minister|ministers|person|persons|people|individual|individuals|vendor|vendors|contractor` +
  String.raw`|contractors|supplier|suppliers|operator|operators|accused|licen[cs]e|licen[cs]es|permit|permits|registration)\b`;
const FROM_POST = String.raw`\s+from\s+(?:office|post|service|duty|position|the\s+post|the\s+service|the\s+roll|the\s+rolls)\b`;
const CONSEQUENCE_PATTERN = new RegExp(
  [
    // fines and penalties
    String.raw`\bimpos\w*\s+(?:(?:a|an|the|any|such|automatic)\s+)?(?:fine|penalt)`,
    String.raw`\bfine[sd]?\s+(?:of|on|against|imposed|levied|payable|for)\b`,
    String.raw`\bfines?\s+${PERSON_OR_LICENCE}`,
    String.raw`\bfined\b`,
    String.raw`\bpenalt(?:y|ies)\b`,
    String.raw`\bpenali[sz]\w*`,
    // court orders and other compulsory orders
    String.raw`\bcourt\s+orders?\b`,
    String.raw`\bordered\s+(?:to|the|an?)\b`,
    String.raw`\b(?:binding|enforceable|compulsory|mandatory)\s+orders?\b`,
    // removal, suspension or dismissal of a person or a licence
    String.raw`\bremov(?:e|es|ed|al|ing)\s+${PERSON_OR_LICENCE}`,
    String.raw`\bremov(?:e|es|ed|al|ing)${FROM_POST}`,
    String.raw`\bsuspen(?:d|ds|ded|ding|sion)\s+${PERSON_OR_LICENCE}`,
    String.raw`\bsuspen(?:d|ds|ded|ding|sion)${FROM_POST}`,
    String.raw`\bdismiss(?:|es|ed|al|ing)\s+${PERSON_OR_LICENCE}`,
    String.raw`\bdismiss(?:|es|ed|al|ing)${FROM_POST}`,
    // hearings that compel attendance
    String.raw`\b(?:mandatory|compulsory)\s+hearings?\b`,
    // arrest and prosecution
    String.raw`\barrest(?:|s|ed|ing)\s+${PERSON_OR_LICENCE}`,
    String.raw`\bprosecut(?:e|es|ed|ing|ion)\s+${PERSON_OR_LICENCE}`,
    String.raw`\b(?:initiate|launch|order|begin|start)\w*\s+(?:a\s+|the\s+)?prosecution\b`,
  ].join('|'),
  'i',
);

const MIN_SPECIFIC_WORDS = 12;

/** Upper bound for a governing-law response deadline (ten years); larger values are mistakes. */
export const MAX_LEGAL_DEADLINE_DAYS = 3650;

// ---------------------------------------------------------------------------
// Small validation helpers
// ---------------------------------------------------------------------------

/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} label
 * @returns {string}
 */
function requireEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(`${label} must be one of ${allowed.join(', ')}; got ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string[]}
 */
function optionalTextList(value, label) {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item, i) => requireText(item, `${label}[${i}]`));
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requireDate(value, label) {
  parseDate(/** @type {string} */ (value), label);
  return /** @type {string} */ (value);
}

/**
 * @param {unknown} value
 * @param {ActorRole} fallback
 * @returns {ActorRole}
 */
function actorRoleOr(value, fallback) {
  if (value === undefined) return fallback;
  return /** @type {ActorRole} */ (requireEnum(value, ACTOR_ROLES, 'actorRole'));
}

/**
 * Throw when free text asserts an enforcement consequence.
 *
 * Scope: this guard is applied where the *process itself* would be producing
 * the consequence: the hearing panel's `decide()` text and the `close()`
 * reason. It is deliberately not applied to `respond()`, `recordChange()` or
 * `decideAdmission()`, which record what a lead office or reviewer reports
 * under existing law; an office stating that a competent authority imposed a
 * lawful fine is recorded, not invented. See `CONSEQUENCE_PATTERN` for what
 * counts as a consequence.
 * @param {string} text
 * @param {string} field
 */
export function assertNoInventedConsequence(text, field) {
  if (CONSEQUENCE_PATTERN.test(text)) throw new NoInventedConsequenceError(field);
}

/**
 * Validate an incoming params object: must be an object, must carry a valid
 * `at`, must not carry personal data.
 * @param {unknown} params
 * @param {string} fn
 * @returns {Record<string, any>}
 */
function requireParams(params, fn) {
  if (params === null || typeof params !== 'object') {
    throw new ValidationError(`${fn}() needs a params object.`);
  }
  rejectPersonalData(params, 'params');
  return /** @type {Record<string, any>} */ (params);
}

/**
 * Common preamble for every transition: the case record is synthetic and free
 * of personal data, the params carry no personal data, and `at` is a valid,
 * chronological date.
 * @param {Case} kase
 * @param {unknown} params
 * @param {string} fn
 * @returns {Record<string, any>}
 */
function prepare(kase, params, fn) {
  assertSafeRecord(kase);
  const p = requireParams(params, fn);
  const at = requireDate(p.at, 'at');
  if (compareDates(at, kase.receivedAt) < 0) {
    throw new ValidationError(`at (${at}) cannot be earlier than receivedAt (${kase.receivedAt}).`);
  }
  const last = kase.events[kase.events.length - 1];
  if (last && compareDates(at, last.at) < 0) {
    throw new ValidationError(`events must be chronological: at (${at}) is earlier than the last event (${last.at}).`);
  }
  return p;
}

/**
 * @param {Case} kase
 * @param {string} action
 * @param {readonly CaseState[]} allowed
 * @param {string} [rule]
 */
function requireState(kase, action, allowed, rule) {
  if (!allowed.includes(kase.state)) throw new InvalidTransitionError(action, kase.state, rule);
}

/**
 * Clone the case and append exactly one event.
 * @param {Case} kase
 * @param {CaseEvent} event
 * @param {(next: Case) => void} [mutate] applied to the clone before the event is appended
 * @returns {Case}
 */
export function withEvent(kase, event, mutate) {
  const next = structuredClone(kase);
  if (mutate) mutate(next);
  next.events.push({ at: event.at, type: event.type, actorRole: event.actorRole, data: structuredClone(event.data ?? {}) });
  return next;
}

// ---------------------------------------------------------------------------
// createCase
// ---------------------------------------------------------------------------

/**
 * @typedef {object} CreateCaseParams
 * @property {string} id must start with "SYN-"
 * @property {true} synthetic
 * @property {import('./types.mjs').ParticipationRoute} participationRoute
 * @property {string|number} issueId
 * @property {import('./types.mjs').Channel} channel
 * @property {string} receivedAt ISO date
 * @property {string} summary short synthetic description
 * @property {{ attribution: import('./types.mjs').Attribution }} [consent] defaults to anonymous
 * @property {number|null} [legalDeadlineDays]
 * @property {{ weekendDays?: number[], holidays?: string[] }} [calendar]
 * @property {ActorRole} [actorRole] defaults to assistant for assisted filings, filer otherwise
 */

/**
 * Create a synthetic case in state "received" with a single "case-created" event.
 * @param {CreateCaseParams} params
 * @returns {Case}
 */
export function createCase(params) {
  if (params === null || typeof params !== 'object') throw new ValidationError('createCase() needs a params object.');
  assertSynthetic(params);
  if (typeof params.id !== 'string' || !params.id.startsWith('SYN-')) {
    throw new ValidationError('id must be a string starting with "SYN-".');
  }
  rejectPersonalData(params, 'case');

  const participationRoute = /** @type {import('./types.mjs').ParticipationRoute} */ (
    requireEnum(params.participationRoute, PARTICIPATION_ROUTES, 'participationRoute')
  );
  const channel = /** @type {import('./types.mjs').Channel} */ (requireEnum(params.channel, CHANNELS, 'channel'));
  const receivedAt = requireDate(params.receivedAt, 'receivedAt');
  const summary = requireText(params.summary, 'summary');
  const issue = getIssue(params.issueId);
  const issueId = /** @type {string} */ (normaliseIssueId(params.issueId));
  if (issueId !== issue.id) throw new ValidationError('issueId did not normalise consistently.');

  const consentIn = params.consent ?? { attribution: 'anonymous' };
  if (consentIn === null || typeof consentIn !== 'object') throw new ValidationError('consent must be an object.');
  const attribution = /** @type {import('./types.mjs').Attribution} */ (
    requireEnum(consentIn.attribution ?? 'anonymous', ATTRIBUTIONS, 'consent.attribution')
  );

  let legalDeadlineDays = null;
  if (params.legalDeadlineDays !== undefined && params.legalDeadlineDays !== null) {
    if (!Number.isInteger(params.legalDeadlineDays) || params.legalDeadlineDays < 1) {
      throw new ValidationError('legalDeadlineDays must be null or a positive integer number of calendar days.');
    }
    if (params.legalDeadlineDays > MAX_LEGAL_DEADLINE_DAYS) {
      throw new ValidationError(`legalDeadlineDays must be at most ${MAX_LEGAL_DEADLINE_DAYS} calendar days, got ${params.legalDeadlineDays}.`);
    }
    legalDeadlineDays = params.legalDeadlineDays;
  }

  const calendar = normaliseCalendar(params.calendar);
  const actorRole = actorRoleOr(params.actorRole, channel === 'assisted' ? 'assistant' : 'filer');

  /** @type {Case} */
  const kase = {
    id: params.id,
    synthetic: true,
    participationRoute,
    issueId,
    channel,
    receivedAt,
    summary,
    consent: { attribution },
    legalDeadlineDays,
    calendar,
    state: 'received',
    owner: null,
    responses: [],
    changes: [],
    challenges: [],
    dissent: [],
    transfers: [],
    referrals: [],
    flags: { protected: false, urgent: false },
    closure: null,
    events: [],
  };
  return withEvent(kase, {
    at: receivedAt,
    type: 'case-created',
    actorRole,
    data: { channel, participationRoute, issueId, issueTitle: issue.title, attribution },
  });
}

// ---------------------------------------------------------------------------
// Intake and routing
// ---------------------------------------------------------------------------

/**
 * Record that a receipt was issued. Digital receipts are due the same day,
 * others within two working days (data/process-targets.json).
 * @param {Case} kase
 * @param {{ at: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function issueReceipt(kase, params) {
  const p = prepare(kase, params, 'issueReceipt');
  requireState(kase, 'issue a receipt', STATES.filter((s) => s !== 'closed'));
  if (findEvent(kase, 'receipt-issued')) {
    throw new InvalidTransitionError('issue a receipt', kase.state, 'A receipt has already been issued for this case.');
  }
  const dueAt = receiptDueAt(kase);
  const late = compareDates(p.at, dueAt) > 0;
  return withEvent(kase, {
    at: p.at,
    type: 'receipt-issued',
    actorRole: actorRoleOr(p.actorRole, kase.channel === 'digital' ? 'system' : 'intake'),
    data: { dueAt, late, channel: kase.channel },
  });
}

/**
 * The receipt due date for a case from the process targets.
 * @param {Case} kase
 * @returns {string}
 */
export function receiptDueAt(kase) {
  return deadlines(kase).receiptDue;
}

/**
 * Advisory owner suggestion from the issue card. Appendix A: "Owners require
 * current state/sector validation." Never applied without a human.
 * @param {string|number} issueId
 * @returns {{ indicative: string[], requiresHumanValidation: true, note: string }}
 */
export function suggestOwner(issueId) {
  const issue = getIssue(issueId);
  return {
    indicative: [...issue.answer],
    requiresHumanValidation: true,
    note:
      `${NOTES.ownersNeedValidation} This suggestion for issue ${issue.id} (${issue.title}) is indicative only; ` +
      `routing needs validatedBy: "human".`,
  };
}

/**
 * Set the verified lead office, co-owners, applicable rules and response date.
 * Throws HumanValidationRequiredError unless validatedBy === "human".
 * @param {Case} kase
 * @param {{ at: string, leadOffice: string, coOwners?: string[], applicableRules?: string[], validatedBy: 'human', actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function routeCase(kase, params) {
  const p = prepare(kase, params, 'routeCase');
  requireState(kase, 'route the case', ['received', 'routed'], 'Routing (or re-routing after a verified transfer) happens before a response.');
  if (p.validatedBy !== 'human') throw new HumanValidationRequiredError();
  const leadOffice = requireText(p.leadOffice, 'leadOffice');
  const coOwners = optionalTextList(p.coOwners, 'coOwners');
  const applicableRules = optionalTextList(p.applicableRules, 'applicableRules');
  const responseDueAt = deadlines(kase).responseDue;
  const previous = kase.owner ? kase.owner.leadOffice : null;
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'case-routed',
      actorRole: actorRoleOr(p.actorRole, 'intake'),
      data: { leadOffice, coOwners, applicableRules, validatedBy: 'human', responseDueAt, previousLeadOffice: previous },
    },
    (next) => {
      next.owner = { leadOffice, coOwners, applicableRules, validatedBy: 'human', responseDueAt };
      next.state = 'routed';
    },
  );
}

// ---------------------------------------------------------------------------
// Reasoned responses
// ---------------------------------------------------------------------------

/**
 * Assess a response against the pack's "Reasoned response" commitment:
 * "explain evidence, jurisdiction, proposed action or refusal, and how to
 * challenge the decision." Boilerplate when reasons are empty or generic
 * (fewer than 12 words, or only stock phrases), or when evidence, jurisdiction
 * or challengeRoutes are missing.
 * @param {ResponseInput} response
 * @returns {ResponseAssessment}
 */
export function assessResponse(response) {
  /** @type {string[]} */
  const missing = [];
  const reasonsText = joinText(response?.reasons);
  if (reasonsText === '') {
    missing.push('reasons');
  } else if (isGeneric(reasonsText)) {
    missing.push('case-specific-reasons');
  }
  if (joinText(response?.evidence) === '') missing.push('evidence');
  if (typeof response?.jurisdiction !== 'string' || response.jurisdiction.trim() === '') missing.push('jurisdiction');
  const routes = Array.isArray(response?.challengeRoutes)
    ? response.challengeRoutes.filter((c) => typeof c === 'string' && ROUTE_CODES.includes(c))
    : [];
  if (routes.length === 0) missing.push('challengeRoutes');
  return { boilerplate: missing.length > 0, missing };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function joinText(value) {
  if (value === undefined || value === null) return '';
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Generic when shorter than 12 words, or when nothing but stock phrases and
 * filler words remains.
 * @param {string} text
 * @returns {boolean}
 */
function isGeneric(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < MIN_SPECIFIC_WORDS) return true;
  let normalised = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const phrases = [...STOCK_PHRASES].sort((a, b) => b.length - a.length);
  // Removing one phrase can bring two others together, so repeat until stable.
  let before;
  do {
    before = normalised;
    for (const phrase of phrases) normalised = normalised.split(` ${phrase} `).join(' ');
  } while (normalised !== before);
  const remainder = normalised.split(/\s+/).filter((w) => w && !FILLER_WORDS.has(w));
  return remainder.length === 0;
}

/**
 * Record a reasoned response (action, refusal or interim) with its assessment.
 * @param {Case} kase
 * @param {ResponseInput & { at: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function respond(kase, params) {
  const p = prepare(kase, params, 'respond');
  requireState(kase, 'record a response', STATES.filter((s) => s !== 'closed' && s !== 'received'),
    'Named responsibility: every case has a verified lead office before anyone answers for it. Route the case first.');
  if (!kase.owner) {
    throw new InvalidTransitionError('record a response', kase.state, 'Named responsibility: route the case to a verified lead office first.');
  }
  const decision = /** @type {import('./types.mjs').ResponseDecision} */ (requireEnum(p.decision, RESPONSE_DECISIONS, 'decision'));
  const challengeRoutes = optionalTextList(p.challengeRoutes, 'challengeRoutes');
  for (const code of challengeRoutes) {
    if (!ROUTE_CODES.includes(code)) {
      throw new ValidationError(`challengeRoutes must use the seven route codes ${ROUTE_CODES.join(' ')}; got ${JSON.stringify(code)}.`);
    }
  }
  const evidence = optionalTextList(p.evidence, 'evidence');
  const reasons = optionalTextList(p.reasons, 'reasons');
  const jurisdiction = typeof p.jurisdiction === 'string' ? p.jurisdiction.trim() : '';
  const actorRole = actorRoleOr(p.actorRole, 'lead-office');
  const input = { decision, evidence, jurisdiction, reasons, challengeRoutes };
  const assessment = assessResponse(input);
  const response = { at: p.at, actorRole, ...input, assessment };
  const movesToResponded = kase.state === 'routed' || kase.state === 'responded';
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'response-recorded',
      actorRole,
      data: { decision, assessment, late: compareDates(p.at, kase.owner.responseDueAt) > 0, responseDueAt: kase.owner.responseDueAt },
    },
    (next) => {
      next.responses.push(response);
      if (movesToResponded) next.state = 'responded';
    },
  );
}

// ---------------------------------------------------------------------------
// Transfers, challenges, changes
// ---------------------------------------------------------------------------

/**
 * Record a verified transfer to another office. State is unchanged; a
 * transfer never closes a case. Re-route afterwards with routeCase().
 * @param {Case} kase
 * @param {{ at: string, toOffice: string, verified: boolean, acknowledgedAt: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function transfer(kase, params) {
  const p = prepare(kase, params, 'transfer');
  requireState(kase, 'transfer the case', STATES.filter((s) => s !== 'closed'));
  if (p.verified !== true) throw new UnverifiedTransferError(`verified is ${JSON.stringify(p.verified)}`);
  if (p.acknowledgedAt === undefined || p.acknowledgedAt === null || p.acknowledgedAt === '') {
    throw new UnverifiedTransferError('acknowledgedAt is missing');
  }
  const acknowledgedAt = requireDate(p.acknowledgedAt, 'acknowledgedAt');
  if (compareDates(acknowledgedAt, kase.receivedAt) < 0 || compareDates(acknowledgedAt, p.at) > 0) {
    throw new ValidationError(`acknowledgedAt (${acknowledgedAt}) must fall between receivedAt (${kase.receivedAt}) and at (${p.at}).`);
  }
  const toOffice = requireText(p.toOffice, 'toOffice');
  const fromOffice = kase.owner ? kase.owner.leadOffice : null;
  if (fromOffice === toOffice) throw new ValidationError('toOffice must differ from the current lead office.');
  const record = { at: p.at, fromOffice, toOffice, verified: /** @type {true} */ (true), acknowledgedAt };
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'transfer-recorded',
      actorRole: actorRoleOr(p.actorRole, 'intake'),
      data: { ...record, stateUnchanged: kase.state, note: NOTES.referralNotResolution },
    },
    (next) => {
      next.transfers.push(record);
    },
  );
}

/**
 * Preserve a challenge to a closure or refusal; reopen a closed case; record
 * the event "case-specific-reasons-requested".
 * @param {Case} kase
 * @param {{ at: string, grounds: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function challengeClosure(kase, params) {
  const p = prepare(kase, params, 'challengeClosure');
  const grounds = requireText(p.grounds, 'grounds');
  const challengeable = kase.responses.length > 0 || kase.closure !== null || kase.state === 'declined' || kase.state === 'decided';
  if (!challengeable) {
    throw new InvalidTransitionError('challenge a closure or refusal', kase.state, 'There is no response, decision or closure to challenge yet.');
  }
  const wasClosed = kase.state === 'closed';
  const closeEvent = wasClosed ? [...kase.events].reverse().find((e) => e.type === 'case-closed') : undefined;
  const reopenTo = /** @type {CaseState} */ (closeEvent && typeof closeEvent.data.fromState === 'string' ? closeEvent.data.fromState : 'responded');
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'case-specific-reasons-requested',
      actorRole: actorRoleOr(p.actorRole, 'filer'),
      data: { grounds, reopened: wasClosed, previousClosure: kase.closure, note: NOTES.preserveChallenge },
    },
    (next) => {
      next.challenges.push({ at: p.at, grounds, reopened: wasClosed });
      if (wasClosed) {
        next.state = reopenTo;
        next.closure = null;
      }
    },
  );
}

/**
 * Record a ledger entry: action promised, action completed, or outcome
 * independently verified. "verified" requires a verifier or reviewer.
 * @param {Case} kase
 * @param {{ at: string, kind: import('./types.mjs').ChangeKind, description: string, verifier?: ActorRole, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function recordChange(kase, params) {
  const p = prepare(kase, params, 'recordChange');
  const kind = /** @type {import('./types.mjs').ChangeKind} */ (requireEnum(p.kind, CHANGE_KINDS, 'kind'));
  const description = requireText(p.description, 'description');
  let verifier = null;
  if (kind === 'verified') {
    if (typeof p.verifier !== 'string' || !(/** @type {readonly string[]} */ (INDEPENDENT_VERIFIERS)).includes(p.verifier)) {
      throw new IndependentVerifierRequiredError(p.verifier);
    }
    verifier = /** @type {ActorRole} */ (p.verifier);
  } else if (p.verifier !== undefined) {
    verifier = actorRoleOr(p.verifier, 'lead-office');
  }
  const actorRole = actorRoleOr(p.actorRole, verifier ?? 'lead-office');
  return withEvent(
    kase,
    { at: p.at, type: 'change-recorded', actorRole, data: { kind, description, verifier } },
    (next) => {
      next.changes.push({ at: p.at, kind, description, verifier });
    },
  );
}

// ---------------------------------------------------------------------------
// Systemic path: admission, hearing, decision
// ---------------------------------------------------------------------------

const SYSTEMIC_RULE = 'Admission, hearing and decision belong to the systemic-review participation route.';

/** @param {Case} kase @param {string} action */
function requireSystemic(kase, action) {
  if (kase.participationRoute !== 'systemic-review') {
    throw new InvalidTransitionError(action, kase.state, `${SYSTEMIC_RULE} This case is on the ${kase.participationRoute} route.`);
  }
}

/**
 * Request admission to the systemic-issue hearing pathway.
 * @param {Case} kase
 * @param {{ at: string, grounds?: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function requestAdmission(kase, params) {
  const p = prepare(kase, params, 'requestAdmission');
  requireSystemic(kase, 'request admission');
  requireState(kase, 'request admission', ['received', 'routed', 'responded']);
  const grounds = p.grounds === undefined ? null : requireText(p.grounds, 'grounds');
  return withEvent(
    kase,
    { at: p.at, type: 'admission-requested', actorRole: actorRoleOr(p.actorRole, 'filer'), data: { grounds } },
    (next) => {
      next.state = 'admission-pending';
    },
  );
}

/**
 * Decide admission with public reasons ("public reasons for admission/refusal").
 * @param {Case} kase
 * @param {{ at: string, admitted: boolean, reasons: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function decideAdmission(kase, params) {
  const p = prepare(kase, params, 'decideAdmission');
  requireSystemic(kase, 'decide admission');
  requireState(kase, 'decide admission', ['admission-pending']);
  if (typeof p.admitted !== 'boolean') throw new ValidationError('admitted must be true or false.');
  const reasons = requireText(p.reasons, 'reasons (public reasons for admission/refusal are required)');
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'admission-decided',
      actorRole: actorRoleOr(p.actorRole, 'reviewer'),
      data: { admitted: p.admitted, reasons },
    },
    (next) => {
      next.state = p.admitted ? 'admitted' : 'declined';
    },
  );
}

/**
 * Schedule the hearing ("hearing normally within 60 days of admission").
 * @param {Case} kase
 * @param {{ at: string, hearingAt: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function scheduleHearing(kase, params) {
  const p = prepare(kase, params, 'scheduleHearing');
  requireSystemic(kase, 'schedule a hearing');
  requireState(kase, 'schedule a hearing', ['admitted']);
  const hearingAt = requireDate(p.hearingAt, 'hearingAt');
  if (compareDates(hearingAt, p.at) < 0) throw new ValidationError('hearingAt cannot be earlier than at.');
  return withEvent(
    kase,
    { at: p.at, type: 'hearing-scheduled', actorRole: actorRoleOr(p.actorRole, 'hearing-panel'), data: { hearingAt } },
    (next) => {
      next.state = 'hearing-scheduled';
    },
  );
}

/**
 * Record the hearing: evidence, counterarguments, agreement and preserved dissent.
 * @param {Case} kase
 * @param {{ at: string, evidence?: string|string[], counterarguments?: string|string[], agreement?: string|string[], dissent?: string|string[], actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function recordHearing(kase, params) {
  const p = prepare(kase, params, 'recordHearing');
  requireSystemic(kase, 'record a hearing');
  requireState(kase, 'record a hearing', ['hearing-scheduled']);
  const evidence = optionalTextList(p.evidence, 'evidence');
  const counterarguments = optionalTextList(p.counterarguments, 'counterarguments');
  const agreement = optionalTextList(p.agreement, 'agreement');
  const dissent = optionalTextList(p.dissent, 'dissent');
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'hearing-recorded',
      actorRole: actorRoleOr(p.actorRole, 'hearing-panel'),
      data: { evidence, counterarguments, agreement, dissent, note: NOTES.preservedDissent },
    },
    (next) => {
      next.state = 'heard';
      for (const text of dissent) next.dissent.push({ at: p.at, text });
    },
  );
}

/**
 * Record the decision after the hearing. The decision text may not name an
 * enforcement consequence.
 * @param {Case} kase
 * @param {{ at: string, decision: string, reasons: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function decide(kase, params) {
  const p = prepare(kase, params, 'decide');
  requireSystemic(kase, 'record a decision');
  requireState(kase, 'record a decision', ['heard']);
  const decision = requireText(p.decision, 'decision');
  assertNoInventedConsequence(decision, 'decision');
  const reasons = requireText(p.reasons, 'reasons');
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'decision-recorded',
      actorRole: actorRoleOr(p.actorRole, 'hearing-panel'),
      data: { decision, reasons, note: NOTES.noInventedConsequence },
    },
    (next) => {
      next.state = 'decided';
    },
  );
}

// ---------------------------------------------------------------------------
// Protection, vigilance, urgency
// ---------------------------------------------------------------------------

/**
 * Mark the case protected and record a protected referral. The case then
 * disappears from public summaries.
 * @param {Case} kase
 * @param {{ at: string, reason: 'retaliation'|'credible-harm', actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function markProtected(kase, params) {
  const p = prepare(kase, params, 'markProtected');
  const reason = requireEnum(p.reason, PROTECTION_REASONS, 'reason');
  const referral = { at: p.at, kind: /** @type {'protected'} */ ('protected'), reason, note: NOTES.protectedReferral };
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'protected-referral-recorded',
      actorRole: actorRoleOr(p.actorRole, 'intake'),
      data: { reason, note: NOTES.protectedReferral, publicSummarySuppressed: true },
    },
    (next) => {
      next.flags.protected = true;
      next.referrals.push(referral);
    },
  );
}

/**
 * Record a referral to a competent vigilance or investigation body.
 * @param {Case} kase
 * @param {{ at: string, body: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function referToVigilance(kase, params) {
  const p = prepare(kase, params, 'referToVigilance');
  const body = requireText(p.body, 'body');
  const referral = { at: p.at, kind: /** @type {'vigilance'} */ ('vigilance'), body, note: NOTES.allegationsNotFindings };
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'vigilance-referral-recorded',
      actorRole: actorRoleOr(p.actorRole, 'intake'),
      data: { body, note: NOTES.allegationsNotFindings, isResolution: false },
    },
    (next) => {
      next.referrals.push(referral);
    },
  );
}

/**
 * Flag urgency and record the emergency-services notice. The engine is not a responder.
 * @param {Case} kase
 * @param {{ at: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function flagUrgent(kase, params) {
  const p = prepare(kase, params, 'flagUrgent');
  const referral = { at: p.at, kind: /** @type {'emergency'} */ ('emergency'), note: NOTES.notAnEmergencyResponder };
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'emergency-notice-recorded',
      actorRole: actorRoleOr(p.actorRole, 'intake'),
      data: { note: NOTES.notAnEmergencyResponder },
    },
    (next) => {
      next.flags.urgent = true;
      next.referrals.push(referral);
    },
  );
}

// ---------------------------------------------------------------------------
// Closure
// ---------------------------------------------------------------------------

/**
 * Close the case. Refuses when there is no reasoned outcome to close on (a
 * final response, or on the systemic route a decision or a reasoned refusal of
 * admission), when the latest response is boilerplate, when a challenge has
 * been recorded and no response has addressed it since, when the reason is a
 * transfer or referral, when the reason names an enforcement consequence, or
 * when "action-completed" is claimed while only a promise is recorded.
 * @param {Case} kase
 * @param {{ at: string, reason: import('./types.mjs').CloseReason, note?: string, actorRole?: ActorRole }} params
 * @returns {Case}
 */
export function close(kase, params) {
  const p = prepare(kase, params, 'close');
  const reasonText = typeof p.reason === 'string' ? p.reason : JSON.stringify(p.reason);
  assertNoInventedConsequence(reasonText, 'close reason');
  if (/transfer|referr|forward|redirect|escalat/i.test(reasonText)) {
    throw new BoilerplateClosureError(`"${reasonText}" treats a transfer or referral as a resolution`);
  }
  const reason = /** @type {import('./types.mjs').CloseReason} */ (requireEnum(p.reason, CLOSE_REASONS, 'reason'));
  requireState(kase, 'close the case', ['responded', 'decided', 'declined'],
    'A case closes only after a reasoned response, a systemic decision, or a reasoned refusal of admission.');
  const latest = latestResponse(kase);
  // On the systemic route the panel's decision, or the reviewer's refusal of admission with public
  // reasons, is the reasoned outcome; the lead office need not also have filed a final response.
  const systemicOutcome = systemicOutcomeAt(kase) !== null && (kase.state === 'decided' || kase.state === 'declined');
  if (!latest && !systemicOutcome) {
    throw new BoilerplateClosureError('there is no reasoned response to close on');
  }
  if (latest && latest.decision === 'interim' && !systemicOutcome) {
    throw new BoilerplateClosureError('an interim explanation is not a reasoned response explaining action or refusal');
  }
  if (latest && latest.assessment.boilerplate) {
    throw new BoilerplateClosureError(`the latest response is missing ${latest.assessment.missing.join(', ')}`);
  }
  // Pack §5 Boilerplate closure: "request case-specific reasons ... preserve the challenge." A challenge
  // recorded after the last response (or decision) is pending until a new reasoned response addresses it.
  const lastChallenge = lastEventIndex(kase, ['case-specific-reasons-requested']);
  const lastAnswer = lastEventIndex(kase, ['response-recorded', 'decision-recorded', 'admission-decided']);
  if (lastChallenge > lastAnswer) {
    throw new BoilerplateClosureError('a challenge is pending; record a new reasoned response addressing it before closing');
  }
  if (reason === 'action-completed' && !kase.changes.some((c) => c.kind === 'completed' || c.kind === 'verified')) {
    throw new BoilerplateClosureError('only a promise is recorded; a promise labelled as a completed remedy is not a completed action');
  }
  if (reason === 'refused-with-reasons' && latest?.decision !== 'refusal' && kase.state !== 'declined') {
    throw new BoilerplateClosureError('refused-with-reasons needs a refusal decision with case-specific reasons');
  }
  const note = p.note === undefined ? null : requireText(p.note, 'note');
  return withEvent(
    kase,
    {
      at: p.at,
      type: 'case-closed',
      actorRole: actorRoleOr(p.actorRole, reason === 'withdrawn-by-filer' ? 'filer' : 'lead-office'),
      data: { reason, note, fromState: kase.state },
    },
    (next) => {
      next.state = 'closed';
      next.closure = { at: p.at, reason };
    },
  );
}
