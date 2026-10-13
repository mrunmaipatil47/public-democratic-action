/**
 * Error classes for the synthetic case-workflow engine.
 *
 * Every message quotes or closely paraphrases the rule in the discussion pack
 * *Public Voice Between Elections* (v0.1) that it enforces, so a failure
 * explains itself in the pack's own vocabulary.
 *
 * @module workflow/errors
 */

/** Base class so callers can `catch (e) { if (e instanceof WorkflowError) ... }`. */
export class WorkflowError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [details] safe, non-personal diagnostic details
   */
  constructor(message, details = {}) {
    super(message);
    this.name = new.target.name;
    /** @type {Record<string, unknown>} */
    this.details = details;
  }
}

/** Shape or argument problems that are not covered by a pack rule. */
export class ValidationError extends WorkflowError {}

/** Pack §9: "Test the process with synthetic records before handling sensitive complaints." */
export class SyntheticOnlyError extends WorkflowError {
  /** @param {string} [why] */
  constructor(why = 'the record is not marked synthetic') {
    super(
      `Test the process with synthetic records before handling sensitive complaints. ` +
        `This engine accepts only records with synthetic: true and an id starting "SYN-" (${why}).`,
    );
  }
}

/** Pack §2 Protection: "collect only necessary personal information". */
export class PersonalDataError extends WorkflowError {
  /**
   * @param {string} where path of the offending key or value
   * @param {string} kind what was detected (a key name or a pattern type), never the value
   */
  constructor(where, kind) {
    super(
      `Collect only necessary personal information; obtain consent for attribution; protect people ` +
        `from exposure and retaliation. A personal-data pattern (${kind}) was found at "${where}". ` +
        `This discussion pack contains no private complainant data; neither may a synthetic case.`,
      { where, kind },
    );
  }
}

/** Pack §2 Named responsibility and Appendix A: "Owners require current state/sector validation." */
export class HumanValidationRequiredError extends WorkflowError {
  constructor() {
    super(
      `Named responsibility: every case has a verified lead office, relevant co-owners, applicable ` +
        `rules and an accountable response date. Owner suggestions are indicative only; owners require ` +
        `current state/sector validation, so routing needs validatedBy: "human".`,
    );
  }
}

/** A state change the process does not allow from the current state. */
export class InvalidTransitionError extends WorkflowError {
  /**
   * @param {string} action
   * @param {string} state
   * @param {string} [rule] the pack rule that explains the refusal
   */
  constructor(action, state, rule = '') {
    super(
      `Cannot ${action} while the case is in state "${state}".` + (rule ? ` ${rule}` : ''),
      { action, state },
    );
  }
}

/** Pack §5 Wrong office: "coordinate a verified transfer; do not call a referral a resolved problem." */
export class UnverifiedTransferError extends WorkflowError {
  /** @param {string} [why] */
  constructor(why = 'the transfer is not verified') {
    super(
      `Wrong office: coordinate a verified transfer; do not call a referral a resolved problem. ` +
        `A transfer is recorded only when verified === true and the receiving office has acknowledged ` +
        `it (acknowledgedAt); ${why}.`,
    );
  }
}

/** Pack §5 Boilerplate closure: "request case-specific reasons, evidence and appeal information; preserve the challenge." */
export class BoilerplateClosureError extends WorkflowError {
  /** @param {string} [why] */
  constructor(why = 'the latest response is boilerplate') {
    super(
      `Boilerplate closure refused: request case-specific reasons, evidence and appeal information; ` +
        `preserve the challenge. Government should not evade an issue through silence, endless transfer, ` +
        `unexplained closure or a promise labelled as a completed remedy (${why}).`,
    );
  }
}

/** Pack §2 Evidence of change: "distinguish action promised, action completed and outcome independently verified." */
export class IndependentVerifierRequiredError extends WorkflowError {
  /** @param {unknown} [got] */
  constructor(got) {
    super(
      `Evidence of change: distinguish action promised, action completed and outcome independently ` +
        `verified. A "verified" change needs an independent verifier role ("verifier" or "reviewer"), ` +
        `not the office that acted` + (got === undefined ? '.' : ` (got ${JSON.stringify(got)}).`),
    );
  }
}

/** Pack §5 closing line, quoted verbatim. */
export class NoInventedConsequenceError extends WorkflowError {
  /** @param {string} [field] */
  constructor(field = 'input') {
    super(
      `No automatic fine, removal, court order or mandatory hearing is invented by this proposal. ` +
        `Any new enforceable consequence requires lawful authority and due process. The ${field} ` +
        `names an enforcement consequence, so the engine refuses to record it.`,
      { field },
    );
  }
}

/** Pack §1: "Issue numbers are stable references." */
export class UnknownIssueError extends WorkflowError {
  /** @param {unknown} issueId */
  constructor(issueId) {
    super(
      `Issue numbers are stable references: "${String(issueId)}" is not one of the 100 issue families ` +
        `in data/issues.json (ids "001" to "100").`,
      { issueId },
    );
  }
}
