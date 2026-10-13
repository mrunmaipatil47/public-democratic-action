/**
 * Scenario: systemic review. Pack §3: "repeated authentication failures
 * prevent access to a public scheme. The expected result is evidence
 * gathering, affected-person participation, alternative designs, a decision
 * and an implementation review."
 */

import {
  close, createCase, decide, decideAdmission, issueReceipt, recordChange, recordHearing, requestAdmission,
  respond, routeCase, scheduleHearing,
} from '../case.mjs';
import { PromiseNotRemedyError } from '../errors.mjs';
import { begin, refused, step } from '../simulate.mjs';

export const id = 'authentication-failures';
export const title = 'Authentication failures (systemic review)';
export const description =
  'Repeated authentication failures exclude many synthetic households from a scheme. The case is admitted ' +
  'to the systemic hearing pathway, heard with counterarguments and preserved dissent, and decided. The ' +
  'decision is a promise until implementation is recorded, so closure as action-completed is refused.';

/** @returns {import('../simulate.mjs').Simulation} */
export function run() {
  let sim = begin(
    createCase({
      id: 'SYN-0002',
      synthetic: true,
      participationRoute: 'systemic-review',
      issueId: '092',
      channel: 'digital',
      receivedAt: '2026-11-02',
      summary:
        'SYNTHETIC CASE: a frontline-worker group reports that repeated authentication failures at fourteen test ' +
        'outlets prevent access to a public scheme. No real person, place or record.',
      consent: { attribution: 'organisation' },
    }),
    'Digital filing by a synthetic frontline-worker group.',
  );
  sim = step(sim, issueReceipt, { at: '2026-11-02' }, 'Digital receipt issued immediately.');
  sim = step(
    sim,
    routeCase,
    {
      at: '2026-11-05',
      leadOffice: 'Service-owning department (synthetic scheme administrator)',
      coOwners: ['Relevant identity authority (synthetic)'],
      applicableRules: ['Scheme guidelines on alternative verification (synthetic reference)'],
      validatedBy: 'human',
    },
    'Verified lead office and co-owner set; owners require current state/sector validation.',
  );
  sim = step(
    sim,
    requestAdmission,
    { at: '2026-11-10', grounds: 'Failure logs from fourteen outlets show the same fault; affected people ask for alternative designs.' },
    'Admission to the systemic-issue hearing pathway requested.',
  );
  sim = step(
    sim,
    respond,
    {
      at: '2026-11-19',
      decision: 'action',
      evidence: ['Failure logs from fourteen synthetic outlets', 'Denial and correction outcomes (synthetic)'],
      jurisdiction: 'The scheme administrator owns the service; the identity authority owns the verification method (synthetic).',
      reasons:
        'Repeated authentication failures are confirmed across the pilot outlets. The department enables a manual ' +
        'override at these outlets while the systemic review proceeds and will publish correction outcomes monthly.',
      challengeRoutes: ['A', 'R', 'P'],
    },
    'Reasoned response from the lead office while admission is pending.',
  );
  sim = step(
    sim,
    decideAdmission,
    {
      at: '2026-11-24',
      admitted: true,
      reasons: 'A recurring fault affecting many households is a systemic issue; evidence gathering, affected-person participation and alternative designs are needed.',
    },
    'Admitted with public reasons within the 30-day target.',
  );
  sim = step(sim, scheduleHearing, { at: '2026-11-26', hearingAt: '2026-12-15' }, 'Hearing scheduled within 60 days of admission.');
  sim = step(
    sim,
    recordHearing,
    {
      at: '2026-12-15',
      evidence: ['Outlet failure logs and correction outcomes (synthetic)', 'Testimony from affected synthetic households'],
      counterarguments: ['The scheme administrator argues a manual override increases leakage risk (synthetic).'],
      agreement: ['Alternative verification should be available at every pilot outlet.'],
      dissent: ['One participant group holds that the device-based check should be withdrawn entirely, not supplemented (synthetic).'],
    },
    'Fair hearing recorded with counterarguments, agreement and preserved dissent.',
  );
  sim = step(
    sim,
    decide,
    {
      at: '2026-12-22',
      decision: 'Adopt alternative verification at all pilot outlets; publish monthly correction outcomes; implementation review after 90 days.',
      reasons: 'The evidence shows exclusion from an existing scheme; the alternative design is lawful within the scheme guidelines and reversible.',
    },
    'Decision recorded within 90 days of admission. No fine, removal, court order or mandatory hearing is invented.',
  );
  sim = step(
    sim,
    recordChange,
    { at: '2026-12-22', kind: 'promised', description: 'Alternative verification to be enabled at all pilot outlets within 30 days (synthetic).' },
    'Implementation promised; completion and independent verification still outstanding.',
  );
  sim = refused(sim, {
    at: '2026-12-22',
    actorRole: 'lead-office',
    expect: PromiseNotRemedyError,
    attempt: (k) => close(k, { at: '2026-12-22', reason: 'action-completed' }),
    note: 'Closure as action-completed refused: only a promise is recorded.',
  });
  return sim;
}
