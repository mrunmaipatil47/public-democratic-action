/**
 * Tiny helpers for building scenario timelines on top of the pure engine.
 * A simulation is `{ kase, timeline }`; every helper returns a new one.
 *
 * @module workflow/simulate
 */

/** @typedef {import('./types.mjs').Case} Case */
/** @typedef {import('./types.mjs').ActorRole} ActorRole */
/** @typedef {{ at: string, type: string, actorRole: string, note: string }} TimelineEntry */
/** @typedef {{ kase: Case, timeline: TimelineEntry[] }} Simulation */
/** @typedef {{ id: string, title: string, description: string, run: () => Simulation }} Scenario */

/**
 * Start a simulation from a freshly created case.
 * @param {Case} kase
 * @param {string} note
 * @returns {Simulation}
 */
export function begin(kase, note) {
  return { kase, timeline: kase.events.map((e) => ({ at: e.at, type: e.type, actorRole: e.actorRole, note })) };
}

/**
 * Apply one engine function and annotate the event(s) it appended.
 * @template P
 * @param {Simulation} sim
 * @param {(kase: Case, params: P) => Case} fn
 * @param {P} params
 * @param {string} note
 * @returns {Simulation}
 */
export function step(sim, fn, params, note) {
  const next = fn(sim.kase, params);
  const added = next.events.slice(sim.kase.events.length);
  return {
    kase: next,
    timeline: [...sim.timeline, ...added.map((e) => ({ at: e.at, type: e.type, actorRole: e.actorRole, note }))],
  };
}

/**
 * Try something the engine must refuse, and record the refusal in the
 * timeline. Throws if the attempt unexpectedly succeeds, and rethrows any
 * error that is not an instance of `spec.expect`, so an engine bug (a
 * TypeError, say) inside the deliberately invalid step fails the scenario
 * instead of being recorded as the expected refusal.
 * @param {Simulation} sim
 * @param {{ at: string, actorRole: ActorRole, expect: new (...args: any[]) => Error, attempt: (kase: Case) => unknown, note: string }} spec
 * @returns {Simulation}
 */
export function refused(sim, spec) {
  if (typeof spec.expect !== 'function') throw new TypeError(`refused() needs the error class the engine must throw: ${spec.note}`);
  /** @type {unknown} */
  let error;
  try {
    spec.attempt(sim.kase);
  } catch (err) {
    error = err;
  }
  if (!error) throw new Error(`scenario expected the engine to refuse with ${spec.expect.name}: ${spec.note}`);
  if (!(error instanceof spec.expect)) throw error;
  const e = /** @type {Error} */ (error);
  return {
    kase: sim.kase,
    timeline: [...sim.timeline, { at: spec.at, type: 'refused', actorRole: spec.actorRole, note: `${spec.note} ${e.name}: ${e.message}` }],
  };
}

/**
 * Add a note-only entry (no event appended to the case).
 * @param {Simulation} sim
 * @param {{ at: string, actorRole?: ActorRole, note: string }} spec
 * @returns {Simulation}
 */
export function remark(sim, spec) {
  return {
    kase: sim.kase,
    timeline: [...sim.timeline, { at: spec.at, type: 'note', actorRole: spec.actorRole ?? 'system', note: spec.note }],
  };
}

/**
 * Run a scenario and return its simulation.
 * @param {Scenario} scenario
 * @returns {Simulation}
 */
export function runScenario(scenario) {
  return scenario.run();
}
