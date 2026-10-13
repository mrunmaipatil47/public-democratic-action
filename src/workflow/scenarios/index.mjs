/**
 * The eight synthetic scenarios, in the order the pack lists the situations.
 * Each exports `{ id, title, description, run }`; `run()` returns
 * `{ kase, timeline }`.
 *
 * @module workflow/scenarios
 */

import * as rationDenial from './ration-denial.mjs';
import * as authenticationFailures from './authentication-failures.mjs';
import * as portableVoting from './portable-voting.mjs';
import * as silence from './silence.mjs';
import * as wrongOffice from './wrong-office.mjs';
import * as boilerplateClosure from './boilerplate-closure.mjs';
import * as retaliation from './retaliation.mjs';
import * as allegedCorruption from './alleged-corruption.mjs';

/** @typedef {import('../simulate.mjs').Scenario} Scenario */

/** @type {readonly Scenario[]} */
export const scenarios = Object.freeze([
  rationDenial,
  authenticationFailures,
  portableVoting,
  silence,
  wrongOffice,
  boilerplateClosure,
  retaliation,
  allegedCorruption,
].map((m) => Object.freeze({ id: m.id, title: m.title, description: m.description, run: m.run })));

/**
 * @param {string} id
 * @returns {Scenario|undefined}
 */
export function getScenario(id) {
  return scenarios.find((s) => s.id === id);
}

export default scenarios;
