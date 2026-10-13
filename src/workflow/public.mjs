/**
 * Safe publication. Pack §5: "do not expose the person on a dashboard."
 *
 * @module workflow/public
 */

import { parseDate, todayUtc } from './calendar.mjs';
import { overdueStages } from './deadlines.mjs';
import { assertSafeRecord } from './guards.mjs';

/** @typedef {import('./types.mjs').Case} Case */
/** @typedef {import('./types.mjs').PublicSummary} PublicSummary */

/** The only keys a public summary may carry. */
export const PUBLIC_SUMMARY_KEYS = Object.freeze([
  'issueId', 'participationRoute', 'state', 'overdueStages', 'changeCounts', 'hasPreservedChallenge',
]);

/**
 * A publishable summary, or null for a protected case. Never free text, never
 * owner names, never the case id (ids are synthetic, but the rule is to
 * practise safe publication).
 * @param {Case} kase
 * @param {{ now?: string }} [options]
 * @returns {PublicSummary|null}
 */
export function toPublicSummary(kase, options = {}) {
  assertSafeRecord(kase);
  if (kase.flags.protected) return null;
  const now = options.now ?? todayUtc();
  parseDate(now, 'now');
  const count = (/** @type {string} */ kind) => kase.changes.filter((c) => c.kind === kind).length;
  return {
    issueId: kase.issueId,
    participationRoute: kase.participationRoute,
    state: kase.state,
    overdueStages: overdueStages(kase, now).map((o) => o.stage),
    changeCounts: { promised: count('promised'), completed: count('completed'), verified: count('verified') },
    hasPreservedChallenge: kase.challenges.length > 0,
  };
}
