/**
 * Scenario: retaliation or credible harm. Pack §5: "use protected referrals
 * and appropriate rights/legal support; do not expose the person on a dashboard."
 */

import { createCase, flagUrgent, issueReceipt, markProtected, respond, routeCase } from '../case.mjs';
import { toPublicSummary } from '../public.mjs';
import { begin, remark, step } from '../simulate.mjs';

export const id = 'retaliation';
export const title = 'Retaliation risk (protected referral)';
export const description =
  'A synthetic complainant reports that a police station refused to register a complaint and that threats ' +
  'followed. The case is marked protected and urgent: a protected referral is recorded, the emergency-services ' +
  'notice is given, and the case disappears from public summaries.';

/** @returns {import('../simulate.mjs').Simulation} */
export function run() {
  let sim = begin(
    createCase({
      id: 'SYN-0007',
      synthetic: true,
      participationRoute: 'individual-remedy',
      issueId: '011',
      channel: 'assisted',
      receivedAt: '2026-11-05',
      summary:
        'SYNTHETIC CASE: with an assistant, a complainant reports that a test police station refused to register an ' +
        'offence and that threats followed the attempt. No real person, place or record.',
      consent: { attribution: 'anonymous' },
    }),
    'Assisted filing; attribution anonymous.',
  );
  sim = step(sim, issueReceipt, { at: '2026-11-06' }, 'Receipt issued within two working days.');
  sim = step(sim, markProtected, { at: '2026-11-06', reason: 'retaliation' }, 'Protected referral recorded; the case is withheld from public summaries.');
  sim = step(sim, flagUrgent, { at: '2026-11-06' }, 'Urgency flagged with the emergency-services notice; this project is not an emergency responder.');
  sim = remark(sim, {
    at: '2026-11-06',
    note: `toPublicSummary() returns ${JSON.stringify(toPublicSummary(sim.kase, { now: '2026-11-06' }))}: nothing is exposed on a dashboard.`,
  });
  sim = step(
    sim,
    routeCase,
    {
      at: '2026-11-10',
      leadOffice: 'Supervisory police office (synthetic district)',
      coOwners: ['Rights body within its mandate (synthetic)'],
      applicableRules: ['Registration and supervision provisions as cited by the lead office (synthetic reference)'],
      validatedBy: 'human',
    },
    'Verified lead office and rights-body co-owner set.',
  );
  sim = step(
    sim,
    respond,
    {
      at: '2026-11-24',
      decision: 'action',
      evidence: ['Protected testimony held in a separately controlled record (synthetic)'],
      jurisdiction: 'The supervisory police office oversees registration; the rights body acts within its mandate (synthetic).',
      reasons:
        'The complaint is registered under supervision and a protection assessment is recorded. Contact details are ' +
        'held in a separately controlled record and are not published. The complainant may use the rights route ' +
        'if protection is not provided.',
      challengeRoutes: ['A', 'H', 'J'],
    },
    'Reasoned response; protection recorded without exposing the person.',
  );
  return sim;
}
