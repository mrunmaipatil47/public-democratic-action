/**
 * Scenario: silence. Pack §5: "preserve filing time, notify the responsible
 * supervisor and enable review; record overdue status safely."
 */

import { createCase, issueReceipt, recordChange, respond, routeCase } from '../case.mjs';
import { onSilence, status } from '../deadlines.mjs';
import { begin, remark, step } from '../simulate.mjs';

export const id = 'silence';
export const title = 'Silence (no receipt, no routing, no response)';
export const description =
  'A synthetic telephone filing about drinking water gets no receipt, no routing and no response. The engine ' +
  'preserves filing time, notifies the supervisor and enables review as each stage falls overdue; the ' +
  'supervisor then routes the case late and the lead office responds.';

/** @returns {import('../simulate.mjs').Simulation} */
export function run() {
  let sim = begin(
    createCase({
      id: 'SYN-0004',
      synthetic: true,
      participationRoute: 'individual-remedy',
      issueId: '063',
      channel: 'telephone',
      receivedAt: '2026-11-02',
      summary:
        'SYNTHETIC CASE: residents of a test ward report that piped drinking water has not been supplied for ten ' +
        'days and tanker supply is irregular. No real person, place or record.',
    }),
    'Telephone filing recorded by intake.',
  );
  const first = status(sim.kase, { now: '2026-11-10' });
  sim = remark(sim, {
    at: '2026-11-10',
    note: `Overdue on 2026-11-10: ${first.overdue.map((o) => `${o.stage} (due ${o.dueAt}, ${o.daysOverdue} days)`).join('; ')}.`,
  });
  sim = step(sim, (k, p) => onSilence(k, p), { now: '2026-11-10' }, 'Receipt and routing overdue: supervisor notified and review enabled; filing time preserved.');
  sim = step(sim, (k, p) => onSilence(k, p), { now: '2026-11-30' }, 'Response target passed with no response: supervisor notified again for the new stage.');
  sim = step(sim, issueReceipt, { at: '2026-12-01', actorRole: 'supervisor' }, 'Receipt issued late by the supervisor (recorded as late).');
  sim = step(
    sim,
    routeCase,
    {
      at: '2026-12-01',
      leadOffice: 'Local water utility (synthetic)',
      coOwners: ['State water-supply department (synthetic)'],
      applicableRules: ['Service standards for piped supply as cited by the lead office (synthetic reference)'],
      validatedBy: 'human',
      actorRole: 'supervisor',
    },
    'Routed late by the supervisor; the response date still counts from the original filing.',
  );
  sim = step(
    sim,
    respond,
    {
      at: '2026-12-10',
      decision: 'action',
      evidence: ['Water test results (synthetic)', 'Repair log for the burst main (synthetic)'],
      jurisdiction: 'The local water utility operates the supply; the state department sets service standards (synthetic).',
      reasons:
        'Supply to the test ward was interrupted by a burst main. Repairs were completed on 8 December and tanker ' +
        'supply covered the gap. Test results show the water now meets the standard.',
      challengeRoutes: ['A', 'R', 'P'],
    },
    'Reasoned response recorded 17 days after the target; the delay stays on the record.',
  );
  sim = step(
    sim,
    recordChange,
    { at: '2026-12-10', kind: 'completed', description: 'Main repaired; supply restored (synthetic).' },
    'Action completed; independent verification still outstanding.',
  );
  return sim;
}
