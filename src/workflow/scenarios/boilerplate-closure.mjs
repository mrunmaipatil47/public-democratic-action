/**
 * Scenario: boilerplate closure. Pack §5: "request case-specific reasons,
 * evidence and appeal information; preserve the challenge."
 */

import { challengeClosure, close, createCase, issueReceipt, respond, routeCase } from '../case.mjs';
import { BoilerplateClosureError } from '../errors.mjs';
import { begin, refused, remark, step } from '../simulate.mjs';

export const id = 'boilerplate-closure';
export const title = 'Boilerplate closure (challenge preserved)';
export const description =
  'A synthetic information request receives "Noted and forwarded for necessary action." Closure on that ' +
  'response is refused, the challenge is preserved, and the office must give case-specific reasons, evidence ' +
  'and appeal information before the case can close as refused-with-reasons.';

/** @returns {import('../simulate.mjs').Simulation} */
export function run() {
  let sim = begin(
    createCase({
      id: 'SYN-0006',
      synthetic: true,
      participationRoute: 'individual-remedy',
      issueId: '008',
      channel: 'postal',
      receivedAt: '2026-11-03',
      summary:
        'SYNTHETIC CASE: a researcher asks a test public authority for the inspection records of a synthetic ' +
        'facility and receives no substantive answer. No real person, place or record.',
    }),
    'Postal filing logged by intake.',
  );
  sim = step(sim, issueReceipt, { at: '2026-11-05' }, 'Receipt issued within two working days.');
  sim = step(
    sim,
    routeCase,
    {
      at: '2026-11-09',
      leadOffice: 'Public information officer of the synthetic authority',
      coOwners: ['Appellate information body (synthetic)'],
      applicableRules: ['Disclosure and exemption provisions as cited by the officer (synthetic reference)'],
      validatedBy: 'human',
    },
    'Verified lead office and appellate co-owner set.',
  );
  sim = step(
    sim,
    respond,
    { at: '2026-11-19', decision: 'refusal', reasons: 'Noted and forwarded for necessary action.' },
    'Response recorded and assessed as boilerplate: generic reasons, no evidence, no jurisdiction, no challenge routes.',
  );
  sim = remark(sim, {
    at: '2026-11-19',
    note: `Assessment: missing ${sim.kase.responses[0].assessment.missing.join(', ')}.`,
  });
  sim = refused(sim, {
    at: '2026-11-19',
    actorRole: 'lead-office',
    expect: BoilerplateClosureError,
    attempt: (k) => close(k, { at: '2026-11-19', reason: 'refused-with-reasons' }),
    note: 'Closure on a boilerplate response refused.',
  });
  sim = step(
    sim,
    challengeClosure,
    { at: '2026-11-24', grounds: 'The response gives no case-specific reasons, cites no exemption and gives no appeal information.' },
    'Challenge preserved; case-specific reasons requested.',
  );
  sim = step(
    sim,
    respond,
    {
      at: '2026-12-03',
      decision: 'refusal',
      evidence: ['Record search log (synthetic)', 'Exemption clause cited with the reason it applies (synthetic)'],
      jurisdiction: 'The synthetic authority holds the requested records; the appellate body hears appeals.',
      reasons:
        'Part of the requested record is withheld under a cited exemption because it contains third-party commercial ' +
        'information; the remaining pages are released with this response. The applicant may appeal to the ' +
        'appellate body within the statutory period.',
      challengeRoutes: ['I', 'J'],
    },
    'Reasoned refusal with evidence, jurisdiction and appeal information.',
  );
  sim = step(sim, close, { at: '2026-12-08', reason: 'refused-with-reasons' }, 'Closed as refused-with-reasons; the challenge remains on the record.');
  return sim;
}
