/**
 * Scenario: alleged corruption. Pack §5: "preserve evidence and use competent
 * vigilance/investigation channels. Allegations are not findings of guilt."
 */

import { close, createCase, issueReceipt, referToVigilance, respond, routeCase } from '../case.mjs';
import { NoInventedConsequenceError, ReferralNotResolutionError } from '../errors.mjs';
import { begin, refused, step } from '../simulate.mjs';

export const id = 'alleged-corruption';
export const title = 'Alleged corruption (vigilance referral)';
export const description =
  'A synthetic worker reports a demand for payment at a service counter. Evidence is preserved and a vigilance ' +
  'referral is recorded. Closing the case as "referred" is refused because a referral is not a resolution, and a ' +
  'closure that names a fine is refused because no consequence is invented by this proposal.';

/** @returns {import('../simulate.mjs').Simulation} */
export function run() {
  let sim = begin(
    createCase({
      id: 'SYN-0008',
      synthetic: true,
      participationRoute: 'individual-remedy',
      issueId: '004',
      channel: 'digital',
      receivedAt: '2026-11-06',
      summary:
        'SYNTHETIC CASE: a worker reports that a counter clerk at a test office demanded an unofficial payment to ' +
        'process a routine certificate. No real person, place or record.',
    }),
    'Digital filing through a safe channel.',
  );
  sim = step(sim, issueReceipt, { at: '2026-11-06' }, 'Digital receipt issued immediately.');
  sim = step(
    sim,
    routeCase,
    {
      at: '2026-11-11',
      leadOffice: 'Department head of the synthetic department',
      coOwners: ['Competent vigilance authority (synthetic)'],
      applicableRules: ['Conduct and vigilance procedures as cited by the lead office (synthetic reference)'],
      validatedBy: 'human',
    },
    'Verified lead office and vigilance co-owner set.',
  );
  sim = step(
    sim,
    referToVigilance,
    { at: '2026-11-13', body: 'Competent vigilance authority (synthetic)' },
    'Evidence preserved and referred to the competent vigilance channel. Allegations are not findings of guilt.',
  );
  sim = refused(sim, {
    at: '2026-11-13',
    actorRole: 'lead-office',
    expect: ReferralNotResolutionError,
    // Deliberately invalid input: the engine must refuse it.
    attempt: (k) => close(k, /** @type {any} */ ({ at: '2026-11-13', reason: 'referred-to-vigilance' })),
    note: 'Closure as "referred" refused: a referral is not a resolution.',
  });
  sim = refused(sim, {
    at: '2026-11-13',
    actorRole: 'lead-office',
    expect: NoInventedConsequenceError,
    // Deliberately invalid input: the engine must refuse it.
    attempt: (k) => close(k, /** @type {any} */ ({ at: '2026-11-13', reason: 'fine imposed on the clerk' })),
    note: 'Closure naming a fine refused.',
  });
  sim = step(
    sim,
    respond,
    {
      at: '2026-11-25',
      decision: 'interim',
      evidence: ['Preserved transaction records and counter CCTV retention request (synthetic)'],
      jurisdiction: 'The department head answers for service conduct; the vigilance authority investigates allegations (synthetic).',
      reasons:
        'The allegation is with the competent vigilance authority and the transaction records are preserved. ' +
        'Allegations are not findings of guilt. A further response follows the vigilance outcome.',
      challengeRoutes: ['V', 'J'],
    },
    'Interim explanation within the 21-day target; a final response is still owed.',
  );
  return sim;
}
