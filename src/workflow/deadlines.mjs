/**
 * Due dates, overdue status and the response to silence, derived from
 * data/process-targets.json. Pack §4: "These are design targets. Applicable
 * law and urgent safety procedures take precedence."
 *
 * @module workflow/deadlines
 */

import { addCalendarDays, addWorkingDays, compareDates, daysBetween, parseDate, todayUtc } from './calendar.mjs';
import { getProcessTargets } from './data.mjs';
import { ValidationError } from './errors.mjs';
import { assertSafeRecord } from './guards.mjs';
import {
  admittedAt, findEvent, firstFinalResponse, lastEventIndex, latestResponse, responseTargetDays, systemicOutcomeAt,
} from './inspect.mjs';
import { NEXT_ACTIONS } from './vocabulary.mjs';

/** @typedef {import('./types.mjs').Case} Case */
/** @typedef {import('./types.mjs').Stage} Stage */
/** @typedef {import('./types.mjs').StageDeadline} StageDeadline */
/** @typedef {import('./types.mjs').Deadlines} Deadlines */
/** @typedef {import('./types.mjs').Status} Status */

/** @type {Record<Stage, string>} */
const DUE_KEY = {
  receipt: 'receiptDue',
  routing: 'routingDue',
  response: 'responseDue',
  admission: 'admissionDue',
  hearing: 'hearingDue',
  decision: 'decisionDue',
};

/**
 * Does a process target apply to this case? `appliesTo` lists channels or
 * participation routes; a target without it applies to every case.
 * @param {import('./data.mjs').ProcessTarget} target
 * @param {Case} kase
 */
function applies(target, kase) {
  if (!target.appliesTo) return true;
  return target.appliesTo.includes(kase.channel) || target.appliesTo.includes(kase.participationRoute);
}

/**
 * When was each stage satisfied? Null when it has not happened. The response
 * stage is satisfied by the first final (action or refusal) response; an
 * interim explanation does not satisfy it. On the systemic route the panel's
 * decision or a reasoned refusal of admission also satisfies it, matching the
 * closure rule.
 * @param {Case} kase
 * @returns {Record<Stage, string|null>}
 */
export function satisfiedAt(kase) {
  const final = firstFinalResponse(kase);
  return {
    receipt: findEvent(kase, 'receipt-issued')?.at ?? null,
    routing: findEvent(kase, 'case-routed')?.at ?? null,
    response: final ? final.at : systemicOutcomeAt(kase),
    admission: findEvent(kase, 'admission-decided')?.at ?? null,
    hearing: findEvent(kase, 'hearing-recorded')?.at ?? null,
    decision: findEvent(kase, 'decision-recorded')?.at ?? null,
  };
}

/**
 * Due dates per stage. Receipt: same day for digital filings, two working days
 * otherwise. Routing: 7 calendar days. Response: 21 calendar days or
 * `legalDeadlineDays`. Systemic review adds admission (30 days from receipt)
 * and, once admitted, hearing (60) and decision (90) from admission.
 * @param {Case} kase
 * @returns {Deadlines}
 */
export function deadlines(kase) {
  assertSafeRecord(kase);
  parseDate(kase.receivedAt, 'receivedAt');
  const admitted = admittedAt(kase);
  const done = satisfiedAt(kase);
  /** @type {StageDeadline[]} */
  const stages = [];
  for (const target of getProcessTargets().targets) {
    if (!applies(target, kase)) continue;
    const base = target.from === 'admitted' ? admitted : kase.receivedAt;
    if (!base) continue;
    const days = target.id === 'ordinary-response' ? responseTargetDays(kase) : target.days;
    const dueAt = target.dayType === 'working' ? addWorkingDays(base, days, kase.calendar) : addCalendarDays(base, days);
    const stage = /** @type {Stage} */ (target.stage);
    stages.push({ stage, targetId: target.id, dueAt, satisfiedAt: done[stage] ?? null });
  }
  const byStage = Object.fromEntries(stages.map((s) => [s.stage, s.dueAt]));
  for (const stage of /** @type {Stage[]} */ (['receipt', 'routing', 'response'])) {
    if (!byStage[stage]) throw new ValidationError(`data/process-targets.json has no ${stage} target for this case.`);
  }
  /** @type {Deadlines} */
  const result = {
    receiptDue: byStage.receipt,
    routingDue: byStage.routing,
    responseDue: byStage.response,
    stages,
  };
  for (const stage of /** @type {Stage[]} */ (['admission', 'hearing', 'decision'])) {
    if (byStage[stage]) result[DUE_KEY[stage]] = byStage[stage];
  }
  return result;
}

/**
 * Stages that are past due and not yet satisfied. Closed cases report nothing.
 * @param {Case} kase
 * @param {string} now ISO date
 * @returns {import('./types.mjs').OverdueStage[]}
 */
export function overdueStages(kase, now) {
  if (kase.state === 'closed') return [];
  return deadlines(kase)
    .stages.filter((s) => s.satisfiedAt === null && compareDates(now, s.dueAt) > 0)
    .map((s) => ({ stage: s.stage, dueAt: s.dueAt, daysOverdue: daysBetween(s.dueAt, now) }));
}

/**
 * Has a verified transfer been recorded that the case has not yet been
 * re-routed after? Pack §5 Wrong office: the matter sits with an office that
 * does not hold it until `routeCase()` names the receiving office.
 * @param {Case} kase
 * @returns {boolean}
 */
export function transferPendingReroute(kase) {
  return lastEventIndex(kase, ['transfer-recorded']) > lastEventIndex(kase, ['case-routed']);
}

/**
 * Silence in the pack's sense (§5): the case is open, some stage is overdue,
 * and no final response exists. "A final response" is an action or refusal
 * response, or on the systemic route the panel's decision or a reasoned
 * refusal of admission; an interim explanation followed by nothing is silence
 * on the final response. One predicate shared by `status()` and `onSilence()`
 * so the two cannot drift apart.
 * @param {Case} kase
 * @param {string} now ISO date
 * @returns {boolean}
 */
export function isSilent(kase, now) {
  if (kase.state === 'closed' || satisfiedAt(kase).response !== null) return false;
  return overdueStages(kase, now).length > 0;
}

/**
 * Current state, overdue stages and short imperative next actions drawn from
 * the pack's refusal responses (§5).
 * @param {Case} kase
 * @param {{ now?: string }} [options]
 * @returns {Status}
 */
export function status(kase, options = {}) {
  assertSafeRecord(kase);
  const now = options.now ?? todayUtc();
  parseDate(now, 'now');
  const overdue = overdueStages(kase, now);
  const overdueSet = new Set(overdue.map((o) => o.stage));
  const due = deadlines(kase);
  const latest = latestResponse(kase);
  const final = firstFinalResponse(kase);
  const closed = kase.state === 'closed';
  /** @type {string[]} */
  const actions = [];
  const add = (/** @type {string} */ s) => {
    if (!actions.includes(s)) actions.push(s);
  };

  // Protection first: "do not expose the person on a dashboard."
  if (kase.flags.protected) add(NEXT_ACTIONS.protectedReferral);
  if (kase.flags.urgent) add(NEXT_ACTIONS.urgent);

  // Silence: any overdue stage without a final response, the same predicate onSilence() acts on. Once a
  // final response exists an overdue stage (a late receipt, a systemic hearing or decision) is still
  // listed in overdue[] and gets the plain record-it action instead of the supervisor notice.
  if (isSilent(kase, now)) {
    add(NEXT_ACTIONS.silenceNotify);
    add(NEXT_ACTIONS.silenceRecord);
  } else if (overdue.length > 0) {
    add(NEXT_ACTIONS.overdueStage);
  }

  // Wrong office: a verified transfer is on the record and the receiving office has not been set as
  // lead office yet. A case that was never routed is silence, not wrong office (see setOwner below).
  if (transferPendingReroute(kase) && !closed) add(NEXT_ACTIONS.wrongOffice);

  // Boilerplate: the latest response lacks case-specific reasons, evidence or appeal information.
  if (latest && latest.assessment.boilerplate) add(NEXT_ACTIONS.boilerplate);

  // Denied entitlement: a reasoned refusal still leaves the applicable remedy.
  if (latest && latest.decision === 'refusal' && !latest.assessment.boilerplate) add(NEXT_ACTIONS.deniedEntitlement);

  // Systemic failure.
  if (kase.participationRoute === 'systemic-review') {
    if (['received', 'routed', 'responded'].includes(kase.state)) add(NEXT_ACTIONS.systemicSeekHearing);
    if (kase.state === 'declined') add(NEXT_ACTIONS.systemicDeclined);
  }

  // Alleged corruption.
  if (kase.referrals.some((r) => r.kind === 'vigilance')) add(NEXT_ACTIONS.vigilance);

  // Evidence of change: a promise is not a completed remedy.
  if (kase.changes.length > 0 && !kase.changes.some((c) => c.kind === 'verified')) add(NEXT_ACTIONS.verifyChange);

  // Ordinary next steps. Setting a verified lead office stays the next step for as long as there is
  // none, overdue or not; the receipt and response nudges give way to the silence actions above.
  if (!closed) {
    if (!overdueSet.has('receipt') && due.stages.find((s) => s.stage === 'receipt')?.satisfiedAt === null) add(NEXT_ACTIONS.issueReceipt);
    if (!kase.owner) add(NEXT_ACTIONS.setOwner);
    if (kase.owner && !final && !overdueSet.has('response') && !['decided', 'declined'].includes(kase.state)) {
      add(NEXT_ACTIONS.reasonedResponse);
    }
  }

  return { state: kase.state, overdue, nextActions: actions };
}

/**
 * Pack §5 Silence: "preserve filing time, notify the responsible supervisor
 * and enable review; record overdue status safely." When any stage is overdue
 * and no final response exists, append `supervisor-notified` and
 * `review-enabled` with `filingTimePreserved: true`. "A response exists" means
 * the same thing here as in `status()`: a final (action or refusal) response,
 * or a systemic decision or reasoned refusal of admission. An interim
 * explanation followed by nothing is silence on the final response.
 * Idempotent: stages already notified are not notified again. Returns the
 * input unchanged when nothing is due.
 * @param {Case} kase
 * @param {{ now?: string, actorRole?: import('./types.mjs').ActorRole }} [options]
 * @returns {Case}
 */
export function onSilence(kase, options = {}) {
  assertSafeRecord(kase);
  const now = options.now ?? todayUtc();
  parseDate(now, 'now');
  if (!isSilent(kase, now)) return kase;
  const overdue = overdueStages(kase, now);
  const alreadyNotified = new Set(
    kase.events
      .filter((e) => e.type === 'supervisor-notified')
      .flatMap((e) => (Array.isArray(e.data.stages) ? /** @type {string[]} */ (e.data.stages) : [])),
  );
  const fresh = overdue.filter((o) => !alreadyNotified.has(o.stage));
  if (fresh.length === 0) return kase;
  const last = kase.events[kase.events.length - 1];
  if (last && compareDates(now, last.at) < 0) {
    throw new ValidationError(`events must be chronological: now (${now}) is earlier than the last event (${last.at}).`);
  }
  const actorRole = options.actorRole ?? 'system';
  const next = structuredClone(kase);
  next.events.push({
    at: now,
    type: 'supervisor-notified',
    actorRole,
    data: {
      filingTimePreserved: true,
      receivedAt: kase.receivedAt,
      stages: fresh.map((o) => o.stage),
      overdue: structuredClone(overdue),
      note: 'Preserve filing time, notify the responsible supervisor and enable review; record overdue status safely.',
    },
  });
  next.events.push({
    at: now,
    type: 'review-enabled',
    actorRole,
    data: { filingTimePreserved: true, receivedAt: kase.receivedAt, stages: fresh.map((o) => o.stage) },
  });
  return next;
}
