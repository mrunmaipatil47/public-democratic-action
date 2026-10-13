/**
 * Scenario: wrong office. Pack §5: "coordinate a verified transfer; do not
 * call a referral a resolved problem."
 */

import { close, createCase, issueReceipt, recordChange, respond, routeCase, transfer } from '../case.mjs';
import { ReferralNotResolutionError, UnverifiedTransferError } from '../errors.mjs';
import { begin, refused, remark, step } from '../simulate.mjs';

export const id = 'wrong-office';
export const title = 'Wrong office (verified transfer)';
export const description =
  'A synthetic electricity-billing complaint is routed to a municipal ward office that does not hold the ' +
  'matter. An unverified referral and a closure called "transferred" are refused; a verified, acknowledged ' +
  'transfer is recorded without closing the case, which is then re-routed and answered.';

/** @returns {import('../simulate.mjs').Simulation} */
export function run() {
  let sim = begin(
    createCase({
      id: 'SYN-0005',
      synthetic: true,
      participationRoute: 'individual-remedy',
      issueId: '069',
      channel: 'offline',
      receivedAt: '2026-11-04',
      summary:
        'SYNTHETIC CASE: a small shop in a test market disputes an electricity bill that is four times the usual ' +
        'amount after a meter fault. No real person, place or record.',
    }),
    'Offline filing at a synthetic help desk.',
  );
  sim = step(sim, issueReceipt, { at: '2026-11-05' }, 'Receipt issued within two working days.');
  sim = step(
    sim,
    routeCase,
    { at: '2026-11-09', leadOffice: 'Municipal ward office (synthetic; not the billing authority)', validatedBy: 'human' },
    'Routed, with human validation, to an office that turns out not to hold the matter.',
  );
  sim = refused(sim, {
    at: '2026-11-13',
    actorRole: 'lead-office',
    expect: UnverifiedTransferError,
    // Deliberately invalid input: the engine must refuse it.
    attempt: (k) => transfer(k, /** @type {any} */ ({ at: '2026-11-13', toOffice: 'Distribution utility (synthetic)', verified: false })),
    note: 'Unverified referral refused.',
  });
  sim = refused(sim, {
    at: '2026-11-13',
    actorRole: 'lead-office',
    expect: ReferralNotResolutionError,
    // Deliberately invalid input: the engine must refuse it.
    attempt: (k) => close(k, /** @type {any} */ ({ at: '2026-11-13', reason: 'transferred-to-utility' })),
    note: 'Closure called "transferred" refused.',
  });
  sim = step(
    sim,
    transfer,
    { at: '2026-11-16', toOffice: 'Distribution utility consumer grievance cell (synthetic)', verified: true, acknowledgedAt: '2026-11-16' },
    'Verified transfer recorded with the receiving office\'s acknowledgement. State unchanged; a transfer never closes.',
  );
  sim = remark(sim, { at: '2026-11-16', note: `State after transfer: ${sim.kase.state}; closure: ${sim.kase.closure === null ? 'none' : 'recorded'}.` });
  sim = step(
    sim,
    routeCase,
    {
      at: '2026-11-17',
      leadOffice: 'Distribution utility consumer grievance cell (synthetic)',
      coOwners: ['Electricity regulator (synthetic)'],
      applicableRules: ['Supply code billing provisions as cited by the lead office (synthetic reference)'],
      validatedBy: 'human',
    },
    'Re-routed to the receiving office; the response date still counts from the original filing.',
  );
  sim = step(
    sim,
    respond,
    {
      at: '2026-11-24',
      decision: 'action',
      evidence: ['Meter reading history (synthetic)', 'Bill revision record (synthetic)'],
      jurisdiction: 'The distribution utility issues bills; the regulator hears unresolved billing disputes (synthetic).',
      reasons:
        'The disputed bill used an estimated reading after a meter fault. The utility revises the bill against the ' +
        'actual reading and replaces the meter; the revised amount is payable in two instalments.',
      challengeRoutes: ['R', 'A'],
    },
    'Reasoned response from the correct office within the original 21-day target.',
  );
  sim = step(sim, recordChange, { at: '2026-11-27', kind: 'completed', description: 'Bill revised and meter replaced (synthetic).' }, 'Action completed.');
  sim = step(
    sim,
    recordChange,
    { at: '2026-12-03', kind: 'verified', verifier: 'reviewer', description: 'Reviewer compared the revised bill with the meter record (synthetic).' },
    'Outcome independently verified by a reviewer.',
  );
  sim = step(sim, close, { at: '2026-12-04', reason: 'action-completed' }, 'Closed as action-completed.');
  return sim;
}
