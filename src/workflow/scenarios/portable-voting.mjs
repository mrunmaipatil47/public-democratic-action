/**
 * Scenario: policy or law. Pack §3: "extend portable voting or require public
 * hearings. The expected result is a consultation, explicit tradeoffs, a
 * reasoned institutional response and the appropriate rule-making or
 * legislative process. A poll does not create legal authority."
 */

import { createCase, issueReceipt, recordChange, respond, routeCase } from '../case.mjs';
import { begin, remark, step } from '../simulate.mjs';
import { NOTES } from '../vocabulary.mjs';

export const id = 'portable-voting';
export const title = 'Portable voting (policy or law)';
export const description =
  'A synthetic migrant-worker group asks for portable and accessible voting. The policy route yields a ' +
  'consultation with explicit tradeoffs and a reasoned institutional response; rule-making or legislation ' +
  'follows its own process, and a poll does not create legal authority.';

/** @returns {import('../simulate.mjs').Simulation} */
export function run() {
  let sim = begin(
    createCase({
      id: 'SYN-0003',
      synthetic: true,
      participationRoute: 'policy-or-law',
      issueId: '002',
      channel: 'digital',
      receivedAt: '2026-11-09',
      summary:
        'SYNTHETIC CASE: a migrant-worker group in a test district asks for authorised remote or postal voting and ' +
        'accessible polling, citing failed journeys home. No real person, place or record.',
      consent: { attribution: 'organisation' },
    }),
    'Digital filing by a synthetic organisation that consents to attribution as an organisation.',
  );
  sim = step(sim, issueReceipt, { at: '2026-11-09' }, 'Digital receipt issued immediately.');
  sim = step(
    sim,
    routeCase,
    {
      at: '2026-11-13',
      leadOffice: 'Election authority policy cell (synthetic)',
      coOwners: ['Legislative committee for legal changes (synthetic)'],
      applicableRules: ['Existing postal-ballot provisions as cited by the lead office (synthetic reference)'],
      validatedBy: 'human',
    },
    'Verified lead office and legislative co-owner set.',
  );
  sim = step(
    sim,
    respond,
    {
      at: '2026-11-27',
      decision: 'action',
      evidence: ['Journey-cost survey from a synthetic migrant-worker group', 'Polling-access audit (synthetic)'],
      jurisdiction: 'Rule changes sit with the election authority; legal changes sit with the legislature (synthetic).',
      reasons:
        'A consultation on authorised remote and postal access opens on 15 December with explicit tradeoffs on ' +
        'identity assurance, secrecy of the ballot and cost. A poll does not create legal authority; any change ' +
        'follows the appropriate rule-making or legislative process.',
      challengeRoutes: ['A', 'P', 'J'],
    },
    'Reasoned institutional response with explicit tradeoffs.',
  );
  sim = step(
    sim,
    recordChange,
    { at: '2026-11-27', kind: 'promised', description: 'Consultation with published tradeoffs scheduled for 15 December (synthetic).' },
    'Consultation promised; it is not yet a change in rules or law.',
  );
  sim = remark(sim, { at: '2026-12-15', actorRole: 'system', note: `Consultation opens. ${NOTES.pollNotAuthority}` });
  return sim;
}
