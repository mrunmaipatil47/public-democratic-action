/**
 * Public API of the synthetic case-workflow engine (architecture.md, Module 2).
 *
 * Pure functions over plain objects. Every transition returns a new case with
 * one appended event; the input is never modified. The engine records, reminds
 * and escalates review. It never invents a fine, removal, court order or
 * mandatory hearing.
 *
 * @module workflow
 */

export * from './errors.mjs';
export { assertSafeRecord, assertSynthetic, rejectPersonalData, containsPersonalData } from './guards.mjs';
export {
  DEFAULT_CALENDAR,
  MAX_DAY_COUNT,
  addCalendarDays,
  addWorkingDays,
  compareDates,
  daysBetween,
  formatDate,
  isIsoDate,
  isWorkingDay,
  normaliseCalendar,
  parseDate,
  todayUtc,
} from './calendar.mjs';
export {
  DATA_DIR,
  ROUTE_CODES,
  getIssue,
  getIssues,
  getProcessTargets,
  getRefusalResponses,
  getRoutes,
  loadDataFile,
  normaliseIssueId,
} from './data.mjs';
export {
  ACTOR_ROLES,
  ATTRIBUTIONS,
  CHANGE_KINDS,
  CHANNELS,
  CLOSE_REASONS,
  INDEPENDENT_VERIFIERS,
  MAX_LEGAL_DEADLINE_DAYS,
  PARTICIPATION_ROUTES,
  PROTECTION_REASONS,
  RESPONSE_DECISIONS,
  STATES,
  STOCK_PHRASES,
  assessResponse,
  assertNoInventedConsequence,
  challengeClosure,
  close,
  createCase,
  decide,
  decideAdmission,
  flagUrgent,
  issueReceipt,
  markProtected,
  receiptDueAt,
  recordChange,
  recordHearing,
  referToVigilance,
  requestAdmission,
  respond,
  routeCase,
  scheduleHearing,
  suggestOwner,
  transfer,
  withEvent,
} from './case.mjs';
export { admittedAt, findEvent, firstFinalResponse, lastEventIndex, latestResponse, responseTargetDays, systemicOutcomeAt } from './inspect.mjs';
export { deadlines, onSilence, overdueStages, satisfiedAt, status, transferPendingReroute } from './deadlines.mjs';
export { PUBLIC_SUMMARY_KEYS, toPublicSummary } from './public.mjs';
export { NEXT_ACTIONS, NOTES } from './vocabulary.mjs';
export { runScenario } from './simulate.mjs';
export { scenarios, getScenario } from './scenarios/index.mjs';
