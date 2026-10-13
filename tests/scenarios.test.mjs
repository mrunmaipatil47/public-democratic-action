// @ts-nocheck -- these tests deliberately pass invalid input to the engine to prove it refuses.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BoilerplateClosureError,
  PUBLIC_SUMMARY_KEYS,
  STATES,
  containsPersonalData,
  runScenario,
  scenarios,
  status,
  toPublicSummary,
} from '../src/workflow/index.mjs';
import { begin, refused } from '../src/workflow/simulate.mjs';
import { main } from '../src/cli.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = resolve(ROOT, 'src', 'cli.mjs');
const EXPECTED_IDS = ['ration-denial', 'authentication-failures', 'portable-voting', 'silence', 'wrong-office', 'boilerplate-closure', 'retaliation', 'alleged-corruption'];
const NOV_DEC_2026 = /^2026-1[12]-\d{2}$/;
const ACTOR_ROLES = ['filer', 'assistant', 'intake', 'lead-office', 'supervisor', 'reviewer', 'hearing-panel', 'verifier', 'system'];
const ENGINE_REFUSALS = /\b(UnverifiedTransferError|BoilerplateClosureError|ReferralNotResolutionError|PromiseNotRemedyError|NoInventedConsequenceError): /;

describe('scenario catalogue', () => {
  it('exports the eight scenarios with id, title, description and run', () => {
    assert.deepEqual(scenarios.map((s) => s.id), EXPECTED_IDS);
    for (const s of scenarios) {
      assert.equal(typeof s.title, 'string');
      assert.ok(s.description.length > 40);
      assert.equal(typeof s.run, 'function');
    }
  });
});

for (const scenario of scenarios) {
  describe(`scenario ${scenario.id}`, () => {
    const { kase, timeline } = runScenario(scenario);
    const last = timeline[timeline.length - 1].at;

    it('ends in one of the enum states on a synthetic case', () => {
      assert.ok(STATES.includes(kase.state), `unexpected state ${kase.state}`);
      assert.equal(kase.synthetic, true);
      assert.match(kase.id, /^SYN-/);
    });

    it('uses November-December 2026 dates throughout', () => {
      assert.match(kase.receivedAt, NOV_DEC_2026);
      for (const e of kase.events) assert.match(e.at, NOV_DEC_2026);
      for (const t of timeline) assert.match(t.at, NOV_DEC_2026);
    });

    it('has a timeline of { at, type, actorRole, note } rows covering every event', () => {
      assert.ok(Array.isArray(timeline) && timeline.length >= kase.events.length);
      for (const t of timeline) {
        assert.deepEqual(Object.keys(t).sort(), ['actorRole', 'at', 'note', 'type']);
        assert.equal(typeof t.note, 'string');
        assert.ok(t.note.length > 0);
        assert.ok(ACTOR_ROLES.includes(t.actorRole), `actorRole ${t.actorRole}`);
      }
      const eventRows = timeline.filter((t) => t.type !== 'note' && t.type !== 'refused');
      assert.deepEqual(eventRows.map((t) => [t.at, t.type]), kase.events.map((e) => [e.at, e.type]));
    });

    it('records only named engine refusals in "refused" rows, never a bare crash', () => {
      for (const row of timeline.filter((t) => t.type === 'refused')) {
        assert.match(row.note, ENGINE_REFUSALS, row.note);
        assert.doesNotMatch(row.note, /TypeError|ReferenceError|RangeError/);
      }
    });

    it('is obviously synthetic and carries no personal data', () => {
      assert.match(kase.summary, /synthetic/i);
      assert.equal(containsPersonalData(kase), false);
      assert.equal(containsPersonalData(timeline), false);
    });

    it('yields a status and a public summary at its last date', () => {
      const st = status(kase, { now: last });
      assert.equal(st.state, kase.state);
      assert.ok(Array.isArray(st.nextActions));
      const pub = toPublicSummary(kase, { now: last });
      if (pub !== null) {
        assert.deepEqual(Object.keys(pub).sort(), [...PUBLIC_SUMMARY_KEYS].sort());
        assert.doesNotMatch(JSON.stringify(pub), /SYN-/);
      }
    });

    it('is deterministic and pure', () => {
      assert.deepEqual(runScenario(scenario), { kase, timeline });
    });
  });
}

describe('scenario-specific outcomes', () => {
  const by = Object.fromEntries(scenarios.map((s) => [s.id, s.run()]));

  it('ration-denial closes as action-completed with promised, completed and verified changes', () => {
    const { kase } = by['ration-denial'];
    assert.equal(kase.state, 'closed');
    assert.equal(kase.closure.reason, 'action-completed');
    assert.deepEqual(kase.changes.map((c) => c.kind), ['promised', 'completed', 'verified']);
  });

  it('authentication-failures is decided with preserved dissent and an unfulfilled promise', () => {
    const { kase, timeline } = by['authentication-failures'];
    assert.equal(kase.state, 'decided');
    assert.equal(kase.dissent.length, 1);
    assert.deepEqual(timeline.filter((t) => t.type === 'refused').map((t) => t.note.match(ENGINE_REFUSALS)[1]), ['PromiseNotRemedyError']);
    // The refusal quotes the pack rule that applies (§2 Evidence of change), not the boilerplate-closure bullet.
    assert.match(timeline.find((t) => t.type === 'refused').note, /PromiseNotRemedyError: Evidence of change: distinguish action promised/);
    assert.ok(kase.events.some((e) => e.type === 'decision-recorded'));
  });

  it('portable-voting records a consultation, not a legal change', () => {
    const { kase } = by['portable-voting'];
    assert.equal(kase.participationRoute, 'policy-or-law');
    assert.equal(kase.state, 'responded');
    assert.match(kase.responses[0].reasons.join(' '), /A poll does not create legal authority/);
  });

  it('silence notifies the supervisor and enables review with filing time preserved', () => {
    const { kase } = by.silence;
    const notices = kase.events.filter((e) => e.type === 'supervisor-notified');
    assert.equal(notices.length, 2);
    assert.ok(notices.every((e) => e.data.filingTimePreserved === true));
    assert.equal(kase.events.filter((e) => e.type === 'review-enabled').length, 2);
    assert.equal(kase.events.find((e) => e.type === 'receipt-issued').data.late, true);
    assert.equal(kase.events.find((e) => e.type === 'response-recorded').data.late, true);
  });

  it('wrong-office records one verified transfer, never closes on it, and closes after a real response', () => {
    const { kase, timeline } = by['wrong-office'];
    assert.equal(kase.transfers.length, 1);
    assert.equal(kase.transfers[0].verified, true);
    const transferIndex = kase.events.findIndex((e) => e.type === 'transfer-recorded');
    assert.equal(kase.events[transferIndex].data.stateUnchanged, 'routed');
    const refusals = timeline.filter((t) => t.type === 'refused');
    assert.equal(refusals.length, 2);
    assert.match(refusals[0].note, /^Unverified referral refused\. UnverifiedTransferError: /);
    assert.match(refusals[1].note, /^Closure called "transferred" refused\. ReferralNotResolutionError: Wrong office: coordinate a verified transfer/);
    assert.equal(kase.state, 'closed');
  });

  it('boilerplate-closure preserves the challenge and closes only on case-specific reasons', () => {
    const { kase, timeline } = by['boilerplate-closure'];
    assert.deepEqual(timeline.filter((t) => t.type === 'refused').map((t) => t.note.match(ENGINE_REFUSALS)[1]), ['BoilerplateClosureError']);
    assert.equal(kase.responses[0].assessment.boilerplate, true);
    assert.equal(kase.responses[1].assessment.boilerplate, false);
    assert.equal(kase.challenges.length, 1);
    assert.equal(kase.state, 'closed');
    assert.equal(kase.closure.reason, 'refused-with-reasons');
    assert.equal(toPublicSummary(kase, { now: '2026-12-08' }).hasPreservedChallenge, true);
  });

  it('retaliation is protected, urgent and absent from public summaries', () => {
    const { kase } = by.retaliation;
    assert.equal(kase.flags.protected, true);
    assert.equal(kase.flags.urgent, true);
    assert.equal(toPublicSummary(kase, { now: '2026-11-24' }), null);
    assert.deepEqual(kase.referrals.map((r) => r.kind), ['protected', 'emergency']);
  });

  it('alleged-corruption refers to vigilance and refuses referral and fine closures', () => {
    const { kase, timeline } = by['alleged-corruption'];
    assert.equal(kase.referrals[0].kind, 'vigilance');
    assert.equal(kase.referrals[0].note, 'Allegations are not findings of guilt.');
    assert.deepEqual(
      timeline.filter((t) => t.type === 'refused').map((t) => t.note.match(ENGINE_REFUSALS)[1]),
      ['ReferralNotResolutionError', 'NoInventedConsequenceError'],
    );
    assert.equal(kase.closure, null);
  });
});

describe('simulate.refused()', () => {
  const sim = begin(by_ration(), 'start');
  function by_ration() {
    return runScenario(scenarios[0]).kase;
  }
  const spec = { at: '2026-12-09', actorRole: 'lead-office', note: 'pretend refusal.' };

  it('records the expected refusal class and message in a "refused" row', () => {
    const out = refused(sim, { ...spec, expect: BoilerplateClosureError, attempt: () => { throw new BoilerplateClosureError('why'); } });
    assert.equal(out.kase, sim.kase);
    assert.equal(out.timeline.length, sim.timeline.length + 1);
    assert.match(out.timeline.at(-1).note, /^pretend refusal\. BoilerplateClosureError: Boilerplate closure refused/);
  });

  it('rethrows an unexpected error class instead of recording it as the refusal', () => {
    assert.throws(
      () => refused(sim, { ...spec, expect: BoilerplateClosureError, attempt: () => { throw new TypeError('Cannot read properties of undefined'); } }),
      TypeError,
    );
    assert.throws(() => refused(sim, { ...spec, expect: BoilerplateClosureError, attempt: () => 'no throw' }), /expected the engine to refuse with BoilerplateClosureError/);
    assert.throws(() => refused(sim, { ...spec, attempt: () => { throw new BoilerplateClosureError('why'); } }), /needs the error class/);
  });
});

describe('CLI', () => {
  it('simulate all exits 0 and prints every scenario with status and public summary', () => {
    const out = execFileSync(process.execPath, [CLI, 'simulate', 'all'], { encoding: 'utf8' });
    for (const s of scenarios) assert.ok(out.includes(`[${s.id}]`), `missing ${s.id}`);
    assert.ok(out.includes('date       | event'));
    assert.ok(out.includes('Public summary: null (protected case'));
    assert.equal((out.match(/Public summary:/g) || []).length, scenarios.length);
    assert.equal((out.match(/Status at /g) || []).length, scenarios.length);
  });

  it('withholds the free text of a protected case and marks it PROTECTED; other cases print their summary', () => {
    const protectedOut = main(['simulate', 'retaliation']).stdout;
    const { kase } = scenarios.find((s) => s.id === 'retaliation').run();
    assert.equal(kase.flags.protected, true);
    assert.match(protectedOut, /\| PROTECTED$/m);
    assert.match(protectedOut, /^Summary: withheld \(protected case; do not expose the person on a dashboard\)$/m);
    assert.ok(!protectedOut.includes(kase.summary), 'the protected summary was printed');
    assert.doesNotMatch(protectedOut, /refused to register an offence/);
    assert.match(protectedOut, /Public summary: null \(protected case/);
    assert.match(protectedOut, /protected-referral-recorded/, 'the timeline (event types and roles) is still shown');
    const openOut = main(['simulate', 'ration-denial']).stdout;
    assert.match(openOut, /^Summary: SYNTHETIC CASE/m);
    assert.doesNotMatch(openOut, /PROTECTED|withheld/);
  });

  it('simulate <id>, list, issue, routes and org exit 0 with the expected content', () => {
    assert.match(execFileSync(process.execPath, [CLI, 'simulate', 'silence'], { encoding: 'utf8' }), /supervisor-notified/);
    assert.match(execFileSync(process.execPath, [CLI, 'list'], { encoding: 'utf8' }), /ration-denial/);
    assert.match(execFileSync(process.execPath, [CLI, 'issue', '77'], { encoding: 'utf8' }), /077\. Ration access and food-security exclusions/);
    const routes = execFileSync(process.execPath, [CLI, 'routes'], { encoding: 'utf8' });
    for (const code of ['A', 'I', 'R', 'H', 'J', 'P', 'V']) assert.match(routes, new RegExp(`^${code} +\\|`, 'm'));
    assert.match(routes, /options, not a compulsory ladder/);
    assert.match(execFileSync(process.execPath, [CLI, 'org', '4'], { encoding: 'utf8' }), /Satark Nagrik Sangathan/);
  });

  it('prints usage with no arguments and exits 2 on bad usage', () => {
    const help = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage:/);
    const bad = [
      ['bogus'], ['simulate'], ['simulate', 'nope'], ['issue'], ['issue', '999'], ['org', '99'], ['org'], ['routes', 'extra'], ['list', 'x'],
      // "org" takes plain decimal digits only; Number() would have accepted these.
      ['org', '0x4'], ['org', '4e0'], ['org', '+4'], ['org', '4.0'], ['org', ' 4'], ['org', '0'],
    ];
    for (const args of bad) {
      const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
      assert.equal(r.status, 2, `expected exit 2 for ${args.join(' ')}`);
      assert.match(r.stderr, /error:/);
      assert.match(r.stderr, /Usage:/);
    }
  });

  it('main() is importable without side effects', () => {
    assert.equal(main([]).code, 0);
    assert.equal(main(['routes']).code, 0);
    assert.equal(main(['issue', '001']).code, 0);
    assert.equal(main(['nope']).code, 2);
  });
});
