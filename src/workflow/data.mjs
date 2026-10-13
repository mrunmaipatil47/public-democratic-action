/**
 * Read-only access to the structured data in `data/`, loaded with
 * `fs.readFileSync` relative to this module (no JSON import attributes).
 *
 * @module workflow/data
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UnknownIssueError, ValidationError } from './errors.mjs';

export const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');

/** @type {Map<string, unknown>} */
const cache = new Map();

/**
 * Recursively freeze so loaded data cannot be mutated by accident.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Load and cache `data/<name>.json`.
 * @param {string} name file name without extension, e.g. "issues"
 * @returns {any}
 */
export function loadDataFile(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new ValidationError(`invalid data file name ${JSON.stringify(name)}.`);
  if (!cache.has(name)) {
    const text = readFileSync(resolve(DATA_DIR, `${name}.json`), 'utf8');
    cache.set(name, deepFreeze(JSON.parse(text)));
  }
  return cache.get(name);
}

/**
 * @typedef {object} Issue
 * @property {string} id "001" to "100"
 * @property {string} slug
 * @property {string} title
 * @property {string} domainId
 * @property {string[]} raise
 * @property {string[]} answer indicative owners; "Owners require current state/sector validation."
 * @property {string} possibleChange
 * @property {string[]} evidence
 * @property {string[]} challengeRoutes route codes among A I R H J P V
 */

/** @returns {readonly Issue[]} */
export function getIssues() {
  return loadDataFile('issues');
}

/**
 * Normalise an issue reference ("77", 77, "077") to the three-digit id.
 * @param {unknown} ref
 * @returns {string|null} null when it cannot be an issue id
 */
export function normaliseIssueId(ref) {
  if (typeof ref === 'number' && Number.isInteger(ref) && ref >= 1 && ref <= 999) return String(ref).padStart(3, '0');
  if (typeof ref === 'string' && /^\d{1,3}$/.test(ref.trim())) return ref.trim().padStart(3, '0');
  return null;
}

/**
 * Look up an issue family; throws `UnknownIssueError` when it does not exist.
 * @param {unknown} ref
 * @returns {Issue}
 */
export function getIssue(ref) {
  const id = normaliseIssueId(ref);
  const issue = id ? getIssues().find((i) => i.id === id) : undefined;
  if (!issue) throw new UnknownIssueError(ref);
  return issue;
}

/**
 * @typedef {object} ProcessTarget
 * @property {string} id
 * @property {string} stage receipt | routing | response | admission | hearing | decision
 * @property {string} description
 * @property {number} days
 * @property {'calendar'|'working'} dayType
 * @property {'received'|'admitted'} from
 * @property {string[]} [appliesTo] channels or participation routes the target applies to
 * @property {boolean} [overridableByLaw]
 */

/** @returns {{ sourceText: string, caveat: string, targets: readonly ProcessTarget[], existingLawReference: Record<string, unknown> }} */
export function getProcessTargets() {
  return loadDataFile('process-targets');
}

/** @returns {{ items: readonly { code: string, name: string, slug: string, description: string }[], caveat: string }} */
export function getRoutes() {
  return loadDataFile('routes');
}

/** @returns {{ items: readonly { id: string, situation: string, response: string }[], caveat: string }} */
export function getRefusalResponses() {
  return loadDataFile('refusal-responses');
}

/** The seven route codes from Appendix B. */
export const ROUTE_CODES = Object.freeze(['A', 'I', 'R', 'H', 'J', 'P', 'V']);
