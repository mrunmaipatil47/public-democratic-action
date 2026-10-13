/**
 * Module 4 tests: the documentation, contribution templates and CI this repository ships. They
 * guard what docs/architecture.md and CONTRIBUTING.md promise: the doc-flow convention on docs/
 * (frontmatter, kebab-case names, one H1, a closing Related section whose wikilinks resolve), the
 * privacy checkbox and the pack's section 6 fields on every issue form, the no-details private
 * channel route, the workflows' independence from the package.json test script and from the pack
 * version, the links the generated site makes into this module, and the engine behaviour that
 * docs/workflow-engine.md describes.
 *
 * Run: npm test   (package.json's test script is `node --test`, which discovers tests/*.test.mjs)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CONTRIBUTING_URL, ISSUE_BRIEF_URL } from '../src/site/html.mjs';
import { parseFrontmatter } from '../src/site/markdown.mjs';
import {
  BoilerplateClosureError,
  NoInventedConsequenceError,
  challengeClosure,
  close,
  createCase,
  decide,
  decideAdmission,
  onSilence,
  recordHearing,
  requestAdmission,
  respond,
  routeCase,
  scheduleHearing,
  status,
  transfer,
} from '../src/workflow/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/** Every .md under a directory, recursively, as repo-relative POSIX paths. */
function listMarkdown(dir) {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) return listMarkdown(rel);
      return entry.name.endsWith('.md') ? [rel] : [];
    })
    .sort();
}

/** Headings outside fenced code blocks. */
function headings(body) {
  const out = [];
  let fenced = false;
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    const m = fenced ? null : /^(#{1,6}) (.+)$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim() });
  }
  return out;
}

const DOCS = listMarkdown('docs');
const DOC_BASENAMES = new Set(DOCS.map((d) => path.posix.basename(d, '.md')));
const FRONTMATTER_KEYS = ['title', 'type', 'project', 'tags', 'source', 'created', 'updated', 'status'];
const DOC_TYPES = new Set(['note', 'sop', 'reference', 'log']);
const DOC_STATUSES = new Set(['seed', 'growing', 'evergreen']);
const PROJECT = 'public-democratic-action';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEBAB_FILENAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

const FORM_DIR = '.github/ISSUE_TEMPLATE';
const PRIVACY_LABEL = 'This contains no real complainant data or personal contact details.';
const PRIVACY_CHECKBOX = new RegExp(`- label: ${PRIVACY_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n\\s+required: true`);
const FORMS = fs
  .readdirSync(path.join(ROOT, FORM_DIR))
  .filter((f) => f.endsWith('.yml') && f !== 'config.yml')
  .sort();
const PRIVATE_CHANNEL_FORM = 'private-channel.yml';
const CONTRIBUTION_FORMS = FORMS.filter((f) => f !== PRIVATE_CHANNEL_FORM);
/** Pack section 6 fields with no task-specific home on any form; asked as a shared optional block. */
const SHARED_FIELD_IDS = ['effort-availability', 'privacy-needs', 'reviewer'];
/** Forms whose task is checking something, so they ask for the method used. */
const METHOD_FORMS = ['correction.yml', 'evidence-check.yml', 'legal-route-map.yml', 'translation.yml'];

const fieldIds = (yaml) => [...yaml.matchAll(/^ {4}id: (\S+)$/gm)].map((m) => m[1]);
/** Single-line `run:` commands of a workflow (block scalars are skipped). */
const runCommands = (yaml) => [...yaml.matchAll(/^\s+run: (?!\|)(.+)$/gm)].map((m) => m[1].trim());

const pkg = JSON.parse(read('package.json'));
const pack = JSON.parse(read('data/pack.json'));
/** The forms of the test command that Node 22 accepts. */
const WORKING_TEST_COMMAND = /^node --test(?: '?tests\/\*\.test\.mjs'?)?$/;
/** Markdown with soft line breaks joined, so a sentence wrapped across lines can be matched verbatim. */
const unwrap = (markdown) => markdown.replace(/\n[ \t]*/g, ' ');

const synthetic = (participationRoute) =>
  createCase({
    id: 'SYN-4001',
    synthetic: true,
    participationRoute,
    issueId: '077',
    channel: 'assisted',
    receivedAt: '2026-11-03',
    summary: 'SYNTHETIC CASE: a probe of the transitions docs/workflow-engine.md describes. No real person, place or record.',
    consent: { attribution: 'anonymous' },
  });
const route = (kase, leadOffice = 'Office A') => routeCase(kase, { at: '2026-11-06', leadOffice, validatedBy: 'human' });
const SPECIFIC_REASONS = ['The entitlement record was checked against the ration card register and the denial on 2 November was found to be unsupported.'];
/**
 * A refusal that assessResponse() accepts: evidence, jurisdiction, case-specific reasons and a challenge route.
 * @type {import('../src/workflow/types.mjs').ResponseInput}
 */
const REASONED_REFUSAL = {
  decision: 'refusal',
  evidence: ['Register extract'],
  jurisdiction: 'State food department',
  reasons: SPECIFIC_REASONS,
  challengeRoutes: ['A'],
};
/** A systemic case taken to the heard state, ready for decide(). */
const heard = () => {
  let kase = requestAdmission(route(synthetic('systemic-review')), { at: '2026-11-08' });
  kase = decideAdmission(kase, { at: '2026-11-20', admitted: true, reasons: 'Repeated failures across several wards justify a systemic hearing.' });
  kase = scheduleHearing(kase, { at: '2026-11-25', hearingAt: '2026-12-15' });
  return recordHearing(kase, {
    at: '2026-12-15',
    evidence: ['Aggregate exclusion data'],
    counterarguments: ['Cost of re-verification'],
    agreement: 'Review the exclusion list.',
    dissent: ['One member held that the data was too thin.'],
  });
};

describe('docs/ follow the doc-flow convention', () => {
  test('there are docs, and architecture.md is one of them', () => {
    assert.ok(DOCS.length >= 9, `expected the nine contracted docs plus the log, found ${DOCS.length}`);
    assert.ok(DOC_BASENAMES.has('architecture'));
    assert.ok(DOC_BASENAMES.has('issue-brief-template'));
  });

  test('every doc has the frontmatter fields with valid type, status, project, tags and dates', () => {
    for (const doc of DOCS) {
      const { frontmatter } = parseFrontmatter(read(doc));
      for (const key of FRONTMATTER_KEYS) assert.ok(key in frontmatter, `${doc}: frontmatter lacks ${key}`);
      assert.ok(DOC_TYPES.has(String(frontmatter.type)), `${doc}: type ${frontmatter.type}`);
      assert.ok(DOC_STATUSES.has(String(frontmatter.status)), `${doc}: status ${frontmatter.status}`);
      assert.equal(frontmatter.project, PROJECT, `${doc}: project`);
      const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [String(frontmatter.tags)];
      assert.ok(tags.includes(`type/${frontmatter.type}`), `${doc}: tags lack type/${frontmatter.type}`);
      assert.ok(tags.includes(`project/${PROJECT}`), `${doc}: tags lack project/${PROJECT}`);
      assert.match(String(frontmatter.created), ISO_DATE, `${doc}: created`);
      assert.match(String(frontmatter.updated), ISO_DATE, `${doc}: updated`);
      assert.ok(String(frontmatter.updated) >= String(frontmatter.created), `${doc}: updated before created`);
    }
  });

  test('filenames are kebab-case and each doc has exactly one H1, which is its title', () => {
    for (const doc of DOCS) {
      assert.match(path.posix.basename(doc), KEBAB_FILENAME, `${doc}: filename`);
      const { frontmatter, body } = parseFrontmatter(read(doc));
      const h1s = headings(body).filter((h) => h.level === 1);
      assert.equal(h1s.length, 1, `${doc}: expected one H1, found ${h1s.length}`);
      assert.equal(h1s[0].text, String(frontmatter.title), `${doc}: H1 differs from frontmatter title`);
    }
  });

  test('every doc ends with a Related section whose wikilinks resolve to sibling docs', () => {
    for (const doc of DOCS) {
      const { body } = parseFrontmatter(read(doc));
      const h2s = headings(body).filter((h) => h.level === 2);
      assert.equal(h2s.at(-1)?.text, 'Related', `${doc}: last H2 is not "## Related"`);
      const links = [...body.matchAll(WIKILINK)].map((m) => m[1].trim());
      assert.ok(links.length > 0, `${doc}: Related has no wikilinks`);
      for (const link of links) assert.ok(DOC_BASENAMES.has(link), `${doc}: [[${link}]] does not resolve to a doc`);
    }
  });
});

describe('issue forms', () => {
  test('there are eight forms plus config.yml', () => {
    assert.equal(FORMS.length, 8, FORMS.join(', '));
    assert.ok(FORMS.includes(PRIVATE_CHANNEL_FORM));
    assert.ok(exists(`${FORM_DIR}/config.yml`));
  });

  test('every form has the required privacy checkbox with the exact label', () => {
    for (const form of FORMS) {
      const yaml = read(`${FORM_DIR}/${form}`);
      assert.match(yaml, PRIVACY_CHECKBOX, `${form}: privacy checkbox missing or not required`);
      assert.ok(fieldIds(yaml).includes('privacy'), `${form}: no field with id privacy`);
    }
  });

  test('field ids are unique within each form', () => {
    for (const form of FORMS) {
      const ids = fieldIds(read(`${FORM_DIR}/${form}`));
      assert.equal(new Set(ids).size, ids.length, `${form}: duplicate ids in ${ids.join(', ')}`);
    }
  });

  test("every contribution form asks the pack's section 6 fields, including the shared optional block", () => {
    for (const form of CONTRIBUTION_FORMS) {
      const yaml = read(`${FORM_DIR}/${form}`);
      const ids = fieldIds(yaml);
      for (const id of SHARED_FIELD_IDS) assert.ok(ids.includes(id), `${form}: lacks ${id}`);
      assert.ok(ids.includes('expected-output') || ids.includes('expected'), `${form}: lacks an expected-output field`);
      if (METHOD_FORMS.includes(form)) assert.ok(ids.includes('method'), `${form}: lacks method`);
      // The shared block is optional: effort and availability are chosen by the contributor.
      for (const id of SHARED_FIELD_IDS) {
        const block = new RegExp(`id: ${id}\\n(?:.*\\n)*?\\s+required: (true|false)`).exec(yaml);
        assert.ok(block, `${form}: ${id} has no validations block`);
        assert.equal(block[1], 'false', `${form}: ${id} must be optional`);
      }
    }
  });

  test('every contribution form asks the credit and consent preference, defaulting to no name', () => {
    for (const form of CONTRIBUTION_FORMS) {
      const yaml = read(`${FORM_DIR}/${form}`);
      const credit = /- type: dropdown\n\s+id: credit\n(?:.*\n)*?\s+options:\n\s+- (.+)\n(?:.*\n)*?\s+required: true/.exec(yaml);
      assert.ok(credit, `${form}: no required credit dropdown`);
      assert.equal(credit[1], 'No name (default)', `${form}: first credit option`);
    }
  });

  test('the private channel form asks for no details, and the policies point at it', () => {
    const yaml = read(`${FORM_DIR}/${PRIVATE_CHANNEL_FORM}`);
    assert.doesNotMatch(yaml, /type: (input|textarea)/, 'a free-text field would invite details');
    assert.match(yaml, PRIVACY_CHECKBOX);
    assert.match(yaml, /^title: "\[Private channel\]/m);
    // Blank issues are disabled, so this form is the only way to file a no-details issue.
    assert.match(read(`${FORM_DIR}/config.yml`), /^blank_issues_enabled: false$/m);
    for (const policy of ['SECURITY.md', 'CODE_OF_CONDUCT.md']) {
      assert.match(read(policy), /Private channel request/, `${policy} does not name the form`);
    }
  });

  test('the private channel form makes the kind of matter optional and says that opening it is public', () => {
    // A public issue from account X labelled "Code of conduct" announces the report to the person it
    // concerns (pack section 5: do not expose the person). The kind must be optional and the form must
    // say the request is visible, so a reporter can choose another route.
    const yaml = read(`${FORM_DIR}/${PRIVATE_CHANNEL_FORM}`);
    const kind = /- type: dropdown\n\s+id: kind\n(?:.*\n)*?\s+options:\n\s+- (.+)\n(?:.*\n)*?\s+required: (true|false)/.exec(yaml);
    assert.ok(kind, 'no kind dropdown');
    assert.equal(kind[1], 'Prefer not to say', 'the first option must let a reporter say nothing');
    assert.equal(kind[2], 'false', 'the kind of matter must be optional');
    assert.match(yaml, /is itself public/, 'the form must say that opening the issue is visible to everyone');
    for (const policy of ['SECURITY.md', 'CODE_OF_CONDUCT.md']) {
      assert.match(read(policy), /is itself public/, `${policy} does not warn that the request is visible`);
    }
  });

  test('no form invites naming the person who confirmed something', () => {
    for (const form of FORMS) assert.doesNotMatch(read(`${FORM_DIR}/${form}`), /which office or practitioner confirmed/, form);
    assert.match(read(`${FORM_DIR}/legal-route-map.yml`), /never a named person/);
  });

  test('config.yml contact links are https repository links that pin no branch name and resolve', () => {
    const cfg = read(`${FORM_DIR}/config.yml`);
    const urls = [...cfg.matchAll(/^\s+url: (\S+)$/gm)].map((m) => m[1]);
    assert.ok(urls.length >= 2);
    for (const url of urls) {
      assert.ok(url.startsWith('https://github.com/mrunmaipatil47/public-democratic-action'), url);
      assert.doesNotMatch(url, /\/blob\/(main|master)\//, `${url} pins a branch name; use blob/HEAD/`);
      const file = /\/blob\/HEAD\/([^#?]+)$/.exec(url);
      if (file) assert.ok(exists(file[1]), `${url} points at a missing file`);
    }
  });
});

describe('workflows', () => {
  const workflows = fs.readdirSync(path.join(ROOT, '.github/workflows')).filter((f) => f.endsWith('.yml')).sort();

  test('ci.yml and pages.yml exist', () => {
    assert.deepEqual(workflows, ['ci.yml', 'pages.yml']);
  });

  test('the test step runs a command Node 22 accepts, and never depends on a broken package.json script', () => {
    for (const workflow of workflows) {
      const runs = runCommands(read(`.github/workflows/${workflow}`));
      const testRuns = runs.filter((r) => /\bnode --test\b/.test(r) || /^npm (?:test|t)$/.test(r) || /^npm run check$/.test(r));
      assert.ok(testRuns.length >= 1, `${workflow}: no test step among ${JSON.stringify(runs)}`);
      for (const run of testRuns) {
        if (run.startsWith('npm')) {
          assert.match(
            pkg.scripts.test,
            WORKING_TEST_COMMAND,
            `${workflow} runs "${run}", but package.json's test script "${pkg.scripts.test}" is not a pattern Node 22 accepts; call node --test directly or fix the script`,
          );
        } else {
          assert.match(run, WORKING_TEST_COMMAND, `${workflow}: "${run}"`);
        }
      }
    }
  });

  test('the workflows and CONTRIBUTING describe the package.json test script as it is', () => {
    for (const workflow of workflows) {
      assert.doesNotMatch(read(`.github/workflows/${workflow}`), /bare directory|being fixed/, `${workflow} still calls the test script broken`);
    }
    const contributing = read('CONTRIBUTING.md');
    assert.doesNotMatch(contributing, /Until `package\.json` is updated|node --test tests\/`/, 'CONTRIBUTING.md still says npm test is broken');
    const quoted = /`npm test` runs `([^`]+)`/.exec(contributing);
    assert.ok(quoted, 'CONTRIBUTING.md does not say what npm test runs');
    assert.equal(quoted[1], pkg.scripts.test, 'CONTRIBUTING.md quotes a test command other than package.json\'s');
    assert.match(pkg.scripts.test, WORKING_TEST_COMMAND);
  });

  test('the reimport job reads the source document from package.json instead of pinning a version', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.doesNotMatch(ci, /content\/source\/public-voice-between-elections-v\d/, 'ci.yml hard-codes a pack version');
    assert.match(ci, /scripts\.import/);
    const pin = /content\/source\/\S+\.md/.exec(pkg.scripts.import);
    assert.ok(pin, 'package.json import script names no content/source/*.md file');
    assert.ok(exists(pin[0]), `${pin[0]} is missing`);
  });

  test('the re-import SOP tells you to search .github/ and package.json on a version bump', () => {
    const sop = read('docs/how-to-reimport-the-pack.md');
    const grep = sop.split('\n').find((line) => line.trim().startsWith('grep -rn'));
    assert.ok(grep, 'no grep line in the SOP');
    assert.match(grep, /\.github\//);
    assert.match(grep, /package\.json/);
    // tests/data.test.mjs and tests/site.test.mjs pin the version, date and source filename.
    assert.match(grep, /tests\//);
    assert.match(sop, /ci\.yml/);
  });
});

describe('links the generated site makes into this module', () => {
  test('the issue-brief template and CONTRIBUTING links resolve through blob/HEAD to files that exist', () => {
    for (const [url, expected] of [
      [ISSUE_BRIEF_URL, 'docs/issue-brief-template.md'],
      [CONTRIBUTING_URL, 'CONTRIBUTING.md'],
    ]) {
      const file = /\/blob\/HEAD\/(.+)$/.exec(new URL(url).pathname);
      assert.ok(file, `${url} does not use blob/HEAD/`);
      assert.equal(file[1], expected);
      assert.ok(exists(expected), `${expected} is missing`);
    }
  });
});

describe('CONTRIBUTING.md', () => {
  test("lists the pack's nine contribution form fields", () => {
    const text = read('CONTRIBUTING.md').toLowerCase();
    const { form } = JSON.parse(read('data/contribution-types.json'));
    assert.equal(form.fields.length, 9);
    for (const field of form.fields) assert.ok(text.includes(field.toLowerCase()), `CONTRIBUTING.md lacks "${field}"`);
    assert.ok(text.includes(form.caveat.toLowerCase()), 'CONTRIBUTING.md lacks the section 6 caveat');
  });

  test('puts scenario code under MIT, matching LICENSE-CONTENT.md', () => {
    const text = read('CONTRIBUTING.md');
    assert.match(text, /src\/workflow\/scenarios\/` are code/);
    assert.match(read('LICENSE-CONTENT.md'), /MIT/);
  });

  test('says that owners are offices, never officials, as SECURITY.md and the scenario form do', () => {
    for (const file of ['CONTRIBUTING.md', 'SECURITY.md', `${FORM_DIR}/synthetic-case.yml`]) {
      assert.match(unwrap(read(file)), /[Oo]wners are offices, never officials/, `${file} lacks the owners-are-offices rule`);
    }
  });
});

describe('README.md', () => {
  const readme = read('README.md');

  test('names every npm script a contributor needs, including check and export:csv', () => {
    for (const script of ['validate', 'test', 'build', 'check', 'serve', 'simulate', 'export:csv', 'import']) {
      assert.ok(script in pkg.scripts, `package.json lacks script ${script}`);
      const command = script === 'test' ? 'npm test' : `npm run ${script}`;
      assert.ok(readme.includes(command), `README.md lacks ${command}`);
    }
  });

  test("keeps the pack's hedges: indicative owners, and sources checked without naming a checker", () => {
    assert.match(readme, /indicative owner/);
    assert.doesNotMatch(readme, /pack's authors/);
    assert.ok(readme.includes(`Institutional sources were checked on ${pack.dateText}`), 'README.md does not quote Appendix C');
  });
});

describe('docs/architecture.md names what the repository ships', () => {
  const arch = read('docs/architecture.md');

  test('every issue form, asset and test suite is named, and the pack.json row lists every required field', () => {
    for (const form of [...FORMS, 'config.yml']) assert.ok(arch.includes(`\`${form}\``), `architecture.md does not name ${form}`);
    for (const asset of fs.readdirSync(path.join(ROOT, 'assets'))) assert.ok(arch.includes(asset), `architecture.md does not name assets/${asset}`);
    const suites = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs'));
    for (const suite of suites) assert.ok(arch.includes(`tests/${suite}`), `architecture.md does not name tests/${suite}`);
    const row = arch.split('\n').find((line) => line.startsWith('| `pack.json`'));
    assert.ok(row, 'pack.json row missing');
    for (const field of JSON.parse(read('schema/pack.schema.json')).required) assert.ok(row.includes(field), `pack.json row lacks ${field}`);
  });

  test('onSilence is described through the shared silence predicate: no final response, not no response', () => {
    const bullet = arch.split('\n- ').find((p) => p.startsWith('`onSilence('));
    assert.ok(bullet, 'onSilence bullet missing');
    assert.match(bullet, /isSilent/);
    assert.doesNotMatch(bullet, /no response exists/);
  });

  test('typecheck is described as installing its tools into a temporary directory, as scripts/typecheck.mjs does', () => {
    assert.match(read('scripts/typecheck.mjs'), /mkdtempSync/);
    assert.doesNotMatch(arch, /uses `npx`/);
    assert.match(arch, /temporary directory/);
  });
});

describe('docs/workflow-engine.md describes the engine as built', () => {
  const doc = read('docs/workflow-engine.md');

  test('an interim response moves routed to responded but does not satisfy the response target', () => {
    const interim = respond(route(synthetic('individual-remedy')), {
      at: '2026-11-10',
      decision: 'interim',
      reasons: ['We are examining the register entry and will reply with case-specific reasons.'],
    });
    assert.equal(interim.state, 'responded');
    assert.equal(interim.responses.length, 1);
    const overdue = status(interim, { now: '2026-12-30' }).overdue.map((o) => o.stage);
    assert.ok(overdue.includes('response'), `response stage should still be overdue, got ${overdue}`);
    assert.doesNotMatch(doc, /unchanged for `interim`/);
    assert.match(doc, /`interim` included/);
  });

  test('a response from a systemic state is appended and leaves the state unchanged', () => {
    const pending = requestAdmission(route(synthetic('systemic-review')), { at: '2026-11-08' });
    assert.equal(pending.state, 'admission-pending');
    const answered = respond(pending, {
      at: '2026-11-12',
      decision: 'action',
      evidence: ['Register extract'],
      jurisdiction: 'State food department',
      reasons: SPECIFIC_REASONS,
      challengeRoutes: ['A'],
    });
    assert.equal(answered.state, 'admission-pending');
    assert.equal(answered.responses.length, 1);
    assert.match(doc, /unchanged from `admission-pending`/);
  });

  test('routeCase also re-routes from routed after a verified transfer', () => {
    const moved = transfer(route(synthetic('individual-remedy')), { at: '2026-11-07', toOffice: 'Office B', verified: true, acknowledgedAt: '2026-11-07' });
    const rerouted = routeCase(moved, { at: '2026-11-08', leadOffice: 'Office B', validatedBy: 'human' });
    assert.equal(rerouted.state, 'routed');
    assert.ok(rerouted.owner, 'the re-routed case has no owner');
    assert.equal(rerouted.owner.leadOffice, 'Office B');
    const row = doc.split('\n').find((line) => line.startsWith('| `routeCase('));
    assert.ok(row, 'routeCase row missing');
    assert.match(row, /`received` or `routed`/);
  });

  test('onSilence appends two events, once per overdue stage, and is listed as a transition', () => {
    const routed = route(synthetic('individual-remedy'));
    const silent = onSilence(routed, { now: '2026-12-30' });
    assert.deepEqual(silent.events.slice(routed.events.length).map((e) => e.type), ['supervisor-notified', 'review-enabled']);
    assert.equal(onSilence(silent, { now: '2026-12-31' }).events.length, silent.events.length, 'onSilence must be idempotent per stage');
    const helpers = doc.split('\n\n').find((p) => p.startsWith('Read-only helpers:'));
    assert.ok(helpers, 'Read-only helpers paragraph missing');
    assert.doesNotMatch(helpers, /onSilence/, 'onSilence appends events, so it is not read-only');
    assert.ok(doc.split('\n').some((line) => line.startsWith('| `onSilence(')), 'onSilence row missing from the transitions table');
  });

  test('a refusal without jurisdiction or challenge routes is accepted but assessed as boilerplate, so closure is refused', () => {
    const refused = respond(route(synthetic('individual-remedy')), { at: '2026-11-10', decision: 'refusal', reasons: SPECIFIC_REASONS });
    assert.equal(refused.state, 'responded');
    assert.equal(refused.responses[0].assessment.boilerplate, true);
    assert.deepEqual(refused.responses[0].assessment.missing, ['evidence', 'jurisdiction', 'challengeRoutes']);
    assert.throws(() => close(refused, { at: '2026-11-11', reason: 'refused-with-reasons' }), BoilerplateClosureError);
    const row = doc.split('\n').find((line) => line.startsWith('| Denied entitlement'));
    assert.ok(row, 'Denied entitlement row missing');
    assert.doesNotMatch(row, /must carry/, 'respond() does not enforce jurisdiction and challengeRoutes; it assesses them');
    assert.match(row, /assessed as boilerplate/);
  });

  test('a pending challenge blocks closure until a new reasoned response, and the close row lists both close() guards', () => {
    const answered = respond(route(synthetic('individual-remedy')), { at: '2026-11-10', ...REASONED_REFUSAL });
    const challenged = challengeClosure(answered, {
      at: '2026-11-12',
      grounds: 'The register extract does not cover the month in question and the appeal route was not explained.',
    });
    assert.throws(() => close(challenged, { at: '2026-11-13', reason: 'refused-with-reasons' }), BoilerplateClosureError);
    const reanswered = respond(challenged, { at: '2026-11-14', ...REASONED_REFUSAL, evidence: ['Register extract for November'] });
    assert.equal(close(reanswered, { at: '2026-11-15', reason: 'refused-with-reasons' }).state, 'closed');
    // The consequence guard runs before the reason enum is checked (scenario alleged-corruption relies on it).
    assert.throws(() => close(answered, /** @type {any} */ ({ at: '2026-11-13', reason: 'fine imposed on the clerk' })), NoInventedConsequenceError);
    const row = doc.split('\n').find((line) => line.startsWith('| `close('));
    assert.ok(row, 'close row missing');
    assert.match(row, /challenge recorded after the last response[^|]*blocks closure/);
    assert.match(row, /NoInventedConsequenceError/);
  });

  test('a decision text naming an enforcement consequence is refused, and the decide row says so', () => {
    const kase = heard();
    assert.throws(
      () => decide(kase, { at: '2026-12-20', decision: 'The office is fined for each month of exclusion.', reasons: 'The evidence showed repeated failures.' }),
      NoInventedConsequenceError,
    );
    assert.equal(
      decide(kase, { at: '2026-12-20', decision: 'Recommend a review of the exclusion list with public reasons.', reasons: 'The evidence showed repeated failures.' }).state,
      'decided',
    );
    const row = doc.split('\n').find((line) => line.startsWith('| `decide('));
    assert.ok(row, 'decide row missing');
    assert.match(row, /NoInventedConsequenceError/);
  });

  test("quotes the pack's existing-law sentence verbatim and ties the worked example's closure to the ledger", () => {
    const { existingLawReference } = JSON.parse(read('data/process-targets.json'));
    const sentence = existingLawReference.text.replace(/\s*\[Sources[^\]]*\]$/, '');
    assert.ok(unwrap(doc).includes(sentence), 'docs/workflow-engine.md paraphrases the section 4 existing-law sentence');
    const closure = doc.split('\n').find((line) => line.startsWith('| 2026-12-08 | `case-closed`'));
    assert.ok(closure, 'worked example closure row missing');
    assert.match(closure, /independently verified/);
    assert.match(closure, /PromiseNotRemedyError/);
  });
});

describe('docs/how-to-add-a-language.md matches i18n/', () => {
  const doc = read('docs/how-to-add-a-language.md');

  test('the Current state table names every translation file with its real _status', () => {
    const files = fs.readdirSync(path.join(ROOT, 'i18n')).filter((f) => f.endsWith('.json') && f !== 'en.json');
    assert.ok(files.length > 0, 'no translation files to document');
    assert.doesNotMatch(doc, /not yet in the tree/);
    for (const file of files) {
      const { _status } = JSON.parse(read(`i18n/${file}`));
      const row = doc.split('\n').find((line) => line.startsWith('|') && line.includes(`i18n/${file}`));
      assert.ok(row, `${file} has no row in the Current state table`);
      assert.ok(row.includes(_status), `${file}: table says "${row}" but _status is ${_status}`);
    }
  });

  test('the build step builds English too, codes are BCP 47, and i18n/README.md is referenced', () => {
    assert.match(doc, /npm run build -- --lang en --lang <code>/);
    assert.match(doc, /BCP 47/);
    assert.doesNotMatch(doc, /two-letter/);
    assert.match(doc, /i18n\/README\.md/);
    assert.ok(exists('i18n/README.md'));
  });

  test('says a missing key fails the build, as scripts/build-site.mjs does, not that it falls back to English', () => {
    assert.match(read('scripts/build-site.mjs'), /is missing \$\{missing\.length\} key\(s\)/, 'the build no longer lists missing keys');
    assert.doesNotMatch(doc, /falls? back to English/i);
    assert.match(doc, /fails the build/);
  });
});

describe('docs do not contradict the data', () => {
  test('data-model.md does not describe retiring an issue id, which the validator forbids', () => {
    const doc = read('docs/data-model.md');
    assert.doesNotMatch(doc, /\bretired\b/);
    assert.match(doc, /to be confirmed/);
    assert.match(doc, /`001`–`100`/);
  });

  test("data-model.md describes publicRouteUrl in the pack's neutral words and documents the search index", () => {
    const doc = read('docs/data-model.md');
    const row = doc.split('\n').find((line) => line.startsWith('| `items[].publicRouteUrl`'));
    assert.ok(row, 'publicRouteUrl row missing');
    assert.match(row, /Public institutional route/);
    assert.doesNotMatch(row, /volunteer page/);
    assert.match(doc, /## search-index\.json/);
    for (const field of ['id', 'title', 'domain', 'domainId', 'routes', 'url', 'text']) assert.ok(doc.includes(`\`${field}\``), `search-index field ${field} undocumented`);
  });

  test("the issue-brief template quotes the pack's process-targets sentence verbatim and asks for a validator role, not a named human", () => {
    const { sourceText } = JSON.parse(read('data/process-targets.json'));
    const doc = read('docs/issue-brief-template.md');
    assert.ok(unwrap(doc).includes(sourceText), 'the template paraphrases the process targets');
    assert.doesNotMatch(doc, /named human/);
    assert.match(doc, /role, not a person's name/);
  });

  test("the glossary keeps the pack's words first and labels its own elaborations", () => {
    const doc = read('docs/glossary.md');
    for (const term of ['Lead office', 'Boilerplate closure', 'Preserved dissent', 'Verified transfer']) {
      const entry = doc.split('\n\n').find((p) => p.startsWith(`**${term}**`));
      assert.ok(entry, `${term} entry missing`);
      assert.match(entry, /Repository reading:/, `${term}: the elaboration is not labelled as the repository's`);
    }
  });
});
