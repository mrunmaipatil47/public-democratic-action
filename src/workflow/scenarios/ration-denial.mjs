/**
 * Scenario: individual remedy. Pack §3: "a household is denied an existing
 * ration entitlement. The expected result is a lawful case decision,
 * correction or reasoned refusal and a usable appeal."
 */

import { close, createCase, issueReceipt, recordChange, respond, routeCase, suggestOwner } from '../case.mjs';
import { begin, remark, step } from '../simulate.mjs';

export const id = 'ration-denial';
export const title = 'Ration denial (individual remedy)';
export const description =
  'A synthetic household is denied an existing ration entitlement after authentication failures. ' +
  'Receipt, verified routing, a reasoned response, and a change ledger that separates promised, ' +
  'completed and independently verified before closure.';

/** @returns {import('../simulate.mjs').Simulation} */
export function run() {
  const issueId = '077';
  let sim = begin(
    createCase({
      id: 'SYN-0001',
      synthetic: true,
      participationRoute: 'individual-remedy',
      issueId,
      channel: 'assisted',
      receivedAt: '2026-11-03',
      summary:
        'SYNTHETIC CASE: a household in a test ward reports that an existing ration entitlement was denied at the ' +
        'fair-price shop after repeated authentication failures. No real person, place or record.',
      consent: { attribution: 'anonymous' },
    }),
    'Assisted filing recorded; no mandatory Aadhaar, smartphone or English proficiency.',
  );
  sim = step(sim, issueReceipt, { at: '2026-11-04' }, 'Receipt issued within two working days of an assisted filing.');
  const suggestion = suggestOwner(issueId);
  sim = remark(sim, {
    at: '2026-11-05',
    actorRole: 'intake',
    note: `Indicative owner from the issue card: ${suggestion.indicative.join('; ')}. ${suggestion.note}`,
  });
  sim = step(
    sim,
    routeCase,
    {
      at: '2026-11-06',
      leadOffice: 'Food and civil-supplies department (synthetic district office)',
      coOwners: ['Statutory grievance body for the public distribution system (synthetic)'],
      applicableRules: ['Ration-entitlement rules as cited by the lead office (synthetic reference)'],
      validatedBy: 'human',
    },
    'Verified lead office, co-owner, applicable rules and response date set within seven calendar days.',
  );
  sim = step(
    sim,
    respond,
    {
      at: '2026-11-20',
      decision: 'action',
      evidence: ['Denial record at the fair-price shop (synthetic)', 'Stock and delivery register extract (synthetic)'],
      jurisdiction: 'The district food and civil-supplies office holds the entitlement record for this ward (synthetic).',
      reasons:
        'The entitlement remains valid; the denial followed repeated authentication failures at the shop device. ' +
        'The office restores the entitlement and offers an alternative verification method for the next three ' +
        'distribution cycles.',
      challengeRoutes: ['A', 'R', 'J'],
    },
    'Reasoned response: evidence, jurisdiction, proposed action and how to challenge it.',
  );
  sim = step(
    sim,
    recordChange,
    { at: '2026-11-20', kind: 'promised', description: 'Entitlement to be restored before the next distribution cycle; alternative verification offered.' },
    'Action promised (not yet a completed remedy).',
  );
  sim = step(
    sim,
    recordChange,
    { at: '2026-11-27', kind: 'completed', description: 'Entitlement restored; alternative verification used at the next distribution (synthetic record).' },
    'Action completed by the lead office.',
  );
  sim = step(
    sim,
    recordChange,
    {
      at: '2026-12-04',
      kind: 'verified',
      verifier: 'verifier',
      description: 'Independent check of the delivery register confirms the household received the entitlement (synthetic).',
    },
    'Outcome independently verified by a verifier, not the office that acted.',
  );
  sim = step(sim, close, { at: '2026-12-08', reason: 'action-completed' }, 'Closed as action-completed with a usable appeal route on record.');
  return sim;
}
