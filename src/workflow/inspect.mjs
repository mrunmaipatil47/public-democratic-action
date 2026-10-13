/**
 * Read-only helpers over a case. Shared by case.mjs and deadlines.mjs so the
 * two never import each other.
 *
 * @module workflow/inspect
 */

import { getProcessTargets } from './data.mjs';

/** @typedef {import('./types.mjs').Case} Case */
/** @typedef {import('./types.mjs').CaseEvent} CaseEvent */

/**
 * Find the first event of a type.
 * @param {Case} kase
 * @param {string} type
 * @param {(e: CaseEvent) => boolean} [where]
 * @returns {CaseEvent|undefined}
 */
export function findEvent(kase, type, where = () => true) {
  return kase.events.find((e) => e.type === type && where(e));
}

/**
 * Date the case was admitted to the systemic hearing pathway, or null.
 * @param {Case} kase
 * @returns {string|null}
 */
export function admittedAt(kase) {
  return findEvent(kase, 'admission-decided', (e) => e.data.admitted === true)?.at ?? null;
}

/**
 * The latest response, or null.
 * @param {Case} kase
 * @returns {import('./types.mjs').ReasonedResponse|null}
 */
export function latestResponse(kase) {
  return kase.responses.length ? kase.responses[kase.responses.length - 1] : null;
}

/**
 * The first final (action or refusal) response; an interim explanation does
 * not satisfy the response target.
 * @param {Case} kase
 * @returns {import('./types.mjs').ReasonedResponse|null}
 */
export function firstFinalResponse(kase) {
  return kase.responses.find((r) => r.decision === 'action' || r.decision === 'refusal') ?? null;
}

/**
 * Index of the last event of one of the given types, or -1.
 * @param {Case} kase
 * @param {readonly string[]} types
 * @returns {number}
 */
export function lastEventIndex(kase, types) {
  for (let i = kase.events.length - 1; i >= 0; i -= 1) {
    if (types.includes(kase.events[i].type)) return i;
  }
  return -1;
}

/**
 * Date of the systemic path's reasoned outcome: the hearing panel's decision,
 * or the reviewer's refusal of admission (which carries public reasons). Null
 * when neither has happened. Only systemic-review cases can have one.
 * @param {Case} kase
 * @returns {string|null}
 */
export function systemicOutcomeAt(kase) {
  if (kase.participationRoute !== 'systemic-review') return null;
  return (
    findEvent(kase, 'decision-recorded')?.at ??
    findEvent(kase, 'admission-decided', (e) => e.data.admitted === false)?.at ??
    null
  );
}

/**
 * The response target in days: governing law overrides the 21-day design target.
 * @param {Case} kase
 * @returns {number}
 */
export function responseTargetDays(kase) {
  if (kase.legalDeadlineDays != null) return kase.legalDeadlineDays;
  const target = getProcessTargets().targets.find((t) => t.id === 'ordinary-response');
  return target ? target.days : 21;
}
