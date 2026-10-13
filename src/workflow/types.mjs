/**
 * JSDoc type definitions for the workflow engine. This module has no runtime
 * exports; import types with `@typedef {import('./types.mjs').Case} Case`.
 *
 * @module workflow/types
 */

/** @typedef {'individual-remedy'|'systemic-review'|'policy-or-law'} ParticipationRoute */
/** @typedef {'assisted'|'offline'|'telephone'|'postal'|'digital'} Channel */
/** @typedef {'anonymous'|'organisation'|'named'} Attribution */
/**
 * @typedef {'received'|'routed'|'responded'|'admission-pending'|'admitted'|'declined'
 *   |'hearing-scheduled'|'heard'|'decided'|'closed'} CaseState
 */
/**
 * @typedef {'filer'|'assistant'|'intake'|'lead-office'|'supervisor'|'reviewer'|'hearing-panel'
 *   |'verifier'|'system'} ActorRole
 */
/** @typedef {'action'|'refusal'|'interim'} ResponseDecision */
/** @typedef {'promised'|'completed'|'verified'} ChangeKind */
/** @typedef {'action-completed'|'refused-with-reasons'|'withdrawn-by-filer'|'duplicate'} CloseReason */
/** @typedef {'receipt'|'routing'|'response'|'admission'|'hearing'|'decision'} Stage */

/**
 * @typedef {object} CaseEvent
 * @property {string} at ISO date
 * @property {string} type kebab-case event type
 * @property {ActorRole} actorRole
 * @property {Record<string, unknown>} data
 */

/**
 * @typedef {object} Owner
 * @property {string} leadOffice
 * @property {string[]} coOwners
 * @property {string[]} applicableRules
 * @property {'human'} validatedBy
 * @property {string} responseDueAt ISO date
 */

/**
 * @typedef {object} ResponseAssessment
 * @property {boolean} boilerplate
 * @property {string[]} missing
 */

/**
 * @typedef {object} ResponseInput
 * @property {ResponseDecision} decision
 * @property {string|string[]} [evidence]
 * @property {string} [jurisdiction]
 * @property {string|string[]} [reasons]
 * @property {string[]} [challengeRoutes]
 */

/**
 * @typedef {ResponseInput & { at: string, actorRole: ActorRole, assessment: ResponseAssessment }} ReasonedResponse
 */

/**
 * @typedef {object} ChangeEntry
 * @property {string} at
 * @property {ChangeKind} kind
 * @property {string} description
 * @property {ActorRole|null} verifier
 */

/**
 * @typedef {object} Challenge
 * @property {string} at
 * @property {string} grounds
 * @property {boolean} reopened
 */

/**
 * @typedef {object} Dissent
 * @property {string} at
 * @property {string} text
 */

/**
 * @typedef {object} Transfer
 * @property {string} at
 * @property {string|null} fromOffice
 * @property {string} toOffice
 * @property {true} verified
 * @property {string} acknowledgedAt
 */

/**
 * @typedef {object} Referral
 * @property {string} at
 * @property {'protected'|'vigilance'|'emergency'} kind
 * @property {string} note
 * @property {string} [reason]
 * @property {string} [body]
 */

/**
 * @typedef {object} Case
 * @property {string} id starts with "SYN-"
 * @property {true} synthetic
 * @property {ParticipationRoute} participationRoute
 * @property {string} issueId
 * @property {Channel} channel
 * @property {string} receivedAt
 * @property {string} summary
 * @property {{ attribution: Attribution }} consent
 * @property {number|null} legalDeadlineDays
 * @property {{ weekendDays: number[], holidays: string[] }} calendar
 * @property {CaseState} state
 * @property {Owner|null} owner
 * @property {ReasonedResponse[]} responses
 * @property {ChangeEntry[]} changes
 * @property {Challenge[]} challenges
 * @property {Dissent[]} dissent
 * @property {Transfer[]} transfers
 * @property {Referral[]} referrals
 * @property {{ protected: boolean, urgent: boolean }} flags
 * @property {{ at: string, reason: CloseReason }|null} closure
 * @property {CaseEvent[]} events
 */

/**
 * @typedef {object} StageDeadline
 * @property {Stage} stage
 * @property {string} targetId process-target id from data/process-targets.json
 * @property {string} dueAt
 * @property {string|null} satisfiedAt
 */

/**
 * @typedef {object} Deadlines
 * @property {string} receiptDue
 * @property {string} routingDue
 * @property {string} responseDue
 * @property {string} [admissionDue]
 * @property {string} [hearingDue]
 * @property {string} [decisionDue]
 * @property {StageDeadline[]} stages
 */

/**
 * @typedef {object} OverdueStage
 * @property {Stage} stage
 * @property {string} dueAt
 * @property {number} daysOverdue
 */

/**
 * @typedef {object} Status
 * @property {CaseState} state
 * @property {OverdueStage[]} overdue
 * @property {string[]} nextActions
 */

/**
 * @typedef {object} PublicSummary
 * @property {string} issueId
 * @property {ParticipationRoute} participationRoute
 * @property {CaseState} state
 * @property {Stage[]} overdueStages
 * @property {{ promised: number, completed: number, verified: number }} changeCounts
 * @property {boolean} hasPreservedChallenge
 */

export {};
