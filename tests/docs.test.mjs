/**
 * Module 4 tests: the documentation, contribution templates and CI this repository ships. They
 * guard what docs/architecture.md and CONTRIBUTING.md promise: the doc-flow convention on docs/
 * (frontmatter, kebab-case names, one H1, a closing Related section whose wikilinks resolve), the
 * privacy checkbox and the pack's section 6 fields on every issue form, the no-details private
 * channel route, the workflows' independence from the package.json test script and from the pack
 * version, the links the generated site makes into this module, and the engine behaviour that
 * docs/workflow-engine.md describes.
 *
 * Run: node --test   (or node --test 'tests/*.test.mjs'; Node 22 does not accept a bare directory)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CONTRIBUTING_URL, ISSUE_BRIEF_URL } from '../src/site/html.mjs';
import { parseFrontmatter } from '../src/site/markdown.mjs';
import { createCase, onSilence, requestAdmission, respond, routeCase, status, transfer } from '../src/workflow/index.mjs';

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
/** The forms of the test command that Node 22 accepts. */
const WORKING_TEST_COMMAND = /^node --test(?: '?tests\/\*\.test\.mjs'?)?$/;

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
});

describe('docs do not contradict the data', () => {
  test('data-model.md does not describe retiring an issue id, which the validator forbids', () => {
    const doc = read('docs/data-model.md');
    assert.doesNotMatch(doc, /\bretired\b/);
    assert.match(doc, /to be confirmed/);
    assert.match(doc, /`001`–`100`/);
  });
});
