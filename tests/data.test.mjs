/**
 * Module 1 tests: data invariants against the real data/ and content/pack/, unit tests for the
 * built-in JSON Schema checker (with deliberately broken fixtures), cross-reference, pack-fidelity,
 * privacy and export-safety rules on mutated copies of the real data, load-time problems on a
 * planted copy, the validator and exporter CLIs, and the CSV writer (quoting, row counts, round
 * trip through a temporary directory).
 *
 * Run: node --test   (or node --test 'tests/*.test.mjs'; Node 22 does not accept a bare directory)
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CHANNELS,
  CSV_LIST_SEPARATOR,
  DATA_FILES,
  DEFAULT_ROOT,
  PACK_DISCLAIMER_SENTENCE,
  PARTICIPATION_ROUTE_IDS,
  RESPONSE_TARGET_ID,
  ROUTES_CAVEAT_SENTENCE,
  ROUTE_CODES,
  ROUTE_NAMES,
  SECTION_FRONTMATTER_KEYS,
  STAGES_PER_CASE,
  STAGES_SYSTEMIC,
  checkDataAgainstSchemas,
  checkSchema,
  crossCheck,
  escapePointer,
  expandIdSpec,
  formatProblem,
  isIsoDate,
  lintSchema,
  loadRepo,
  parseArgs,
  parseFrontmatter,
  personalDataKind,
  validateRepo,
} from '../scripts/validate.mjs';
import {
  ISSUE_COLUMNS,
  LINK_COLUMNS,
  LIST_SEPARATOR,
  ORGANISATION_COLUMNS,
  buildTables,
  csvField,
  issuesRows,
  joinList,
  organisationIssueLinksRows,
  organisationsRows,
  toCsv,
  writeExports,
} from '../scripts/export-csv.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FIXTURES = path.join(HERE, 'fixtures');

/** @param {string} name */
const readJson = (name) => JSON.parse(readFileSync(path.join(ROOT, name), 'utf8'));

const issues = readJson('data/issues.json');
const domains = readJson('data/domains.json');
const routes = readJson('data/routes.json');
const organisations = readJson('data/organisations.json');
const pack = readJson('data/pack.json');
const sources = readJson('data/sources.json');
const processTargets = readJson('data/process-targets.json');
const participationRoutes = readJson('data/participation-routes.json');
const issuesSchema = readJson('schema/issues.schema.json');

/**
 * @param {{ file: string, path: string, message: string }[]} problems
 * @param {string} file
 * @param {string} pointer
 * @param {RegExp} [re]
 */
function hasProblem(problems, file, pointer, re) {
  return problems.some((p) => p.file === file && p.path === pointer && (!re || re.test(p.message)));
}

/** @param {{ file: string, path: string, message: string }[]} problems */
function dump(problems) {
  return problems.map(formatProblem).join('\n');
}

/** @type {string[]} */ const TMP_DIRS = [];
after(() => TMP_DIRS.forEach((d) => rmSync(d, { recursive: true, force: true })));

/**
 * Copy data/, schema/ and content/ into a fresh temporary repository root (removed after the run).
 * @param {string} label
 */
function copyRepo(label) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), `pda-${label}-`));
  TMP_DIRS.push(tmp);
  for (const dir of ['data', 'schema', 'content']) cpSync(path.join(ROOT, dir), path.join(tmp, dir), { recursive: true });
  return tmp;
}

/** Read, mutate and rewrite one JSON file under a temporary root. @param {string} root @param {string} rel @param {(doc: any) => void} mutate */
function editJson(root, rel, mutate) {
  const file = path.join(root, rel);
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  mutate(doc);
  writeFileSync(file, JSON.stringify(doc, null, 2));
}

/** Minimal RFC 4180 reader used only to round-trip the writer's output. @param {string} text */
function parseCsv(text) {
  /** @type {string[][]} */ const rows = [];
  /** @type {string[]} */ let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Data invariants against the real data
// ---------------------------------------------------------------------------

describe('data invariants (real data/ and content/pack/)', () => {
  it('the validator reports no problems for the repository', () => {
    const { problems, summary, stats } = validateRepo(ROOT);
    assert.equal(problems.length, 0, dump(problems));
    assert.match(summary, /^validate: OK\./);
    assert.equal(stats.dataFiles, DATA_FILES.length);
    assert.equal(stats.schemas, DATA_FILES.length);
    assert.equal(stats.sections, 9);
  });

  it('DEFAULT_ROOT is the repository root', () => {
    assert.equal(DEFAULT_ROOT, ROOT);
    assert.ok(existsSync(path.join(DEFAULT_ROOT, 'package.json')));
  });

  it('issues: exactly 100, ids 001..100 in order, unique slugs and titles', () => {
    assert.equal(issues.length, 100);
    issues.forEach((it, i) => assert.equal(it.id, String(i + 1).padStart(3, '0')));
    assert.equal(new Set(issues.map((it) => it.slug)).size, 100);
    assert.equal(new Set(issues.map((it) => it.title)).size, 100);
  });

  it('issues: every domainId exists and the id falls inside the domain range', () => {
    const byId = new Map(domains.map((d) => [d.id, d]));
    for (const it of issues) {
      const d = byId.get(it.domainId);
      assert.ok(d, `issue ${it.id} has unknown domain ${it.domainId}`);
      assert.ok(Number(it.id) >= Number(d.range[0]) && Number(it.id) <= Number(d.range[1]), `issue ${it.id} outside ${d.id}`);
    }
  });

  it('issues: challengeRoutes are non-empty, valid and unique; all seven codes are used somewhere', () => {
    const used = new Set();
    for (const it of issues) {
      assert.ok(it.challengeRoutes.length >= 1, `issue ${it.id} has no challenge route`);
      assert.equal(new Set(it.challengeRoutes).size, it.challengeRoutes.length, `issue ${it.id} repeats a route`);
      for (const code of it.challengeRoutes) {
        assert.ok(ROUTE_CODES.includes(code), `issue ${it.id} has unknown route ${code}`);
        used.add(code);
      }
    }
    assert.deepEqual([...used].sort(), [...ROUTE_CODES].sort());
  });

  it('domains: ten domains of ten issues each partition 001..100', () => {
    assert.equal(domains.length, 10);
    const all = [];
    domains.forEach((d, i) => {
      assert.equal(d.id, `d${String(i + 1).padStart(2, '0')}`);
      assert.equal(d.issueIds.length, 10);
      assert.deepEqual(d.issueIds, expandIdSpec(`${d.range[0]}–${d.range[1]}`).ids);
      assert.deepEqual(
        issues.filter((it) => it.domainId === d.id).map((it) => it.id),
        d.issueIds,
      );
      all.push(...d.issueIds);
    });
    assert.deepEqual(all, issues.map((it) => it.id));
  });

  it('routes: exactly the seven codes A I R H J P V with the Appendix B names', () => {
    assert.deepEqual(routes.items.map((r) => r.code), ['A', 'I', 'R', 'H', 'J', 'P', 'V']);
    for (const r of routes.items) assert.equal(r.name, ROUTE_NAMES[r.code]);
    assert.match(routes.caveat, /options, not a compulsory ladder/);
  });

  it('organisations: 13 numbered in order; agendaIssueIds equal the expansion of agendaLinksText and resolve', () => {
    assert.equal(organisations.items.length, 13);
    const ids = new Set(issues.map((it) => it.id));
    organisations.items.forEach((o, i) => {
      assert.equal(o.number, i + 1);
      assert.equal(o.id, `org-${String(i + 1).padStart(2, '0')}`);
      const expanded = expandIdSpec(o.agendaLinksText);
      assert.equal(expanded.error, null, `${o.id}: ${expanded.error}`);
      assert.deepEqual(o.agendaIssueIds, expanded.ids, `${o.id}: agendaIssueIds differ from "${o.agendaLinksText}"`);
      for (const id of o.agendaIssueIds) assert.ok(ids.has(id), `${o.id} links unknown issue ${id}`);
      assert.match(o.officialEvidenceUrl, /^https:\/\//);
      assert.match(o.publicRouteUrl, /^https:\/\//);
    });
  });

  it('organisations: the selection basis keeps the pack\'s "unconfirmed for every entry" caveat and every status is present', () => {
    // Section 7, verbatim: willingness, capacity, affiliation with the movement and remote
    // arrangements remain unconfirmed for every entry.
    assert.match(organisations.selectionBasis, /remain unconfirmed for every entry/);
    assert.match(organisations.selectionBasis, /no personal activist contact database is included/);
    for (const o of organisations.items) assert.ok(typeof o.status === 'string' && o.status.trim().length > 0, o.id);
  });

  it('pack.counts match the data files and the pack date is ISO', () => {
    assert.deepEqual(pack.counts, {
      issues: issues.length,
      domains: domains.length,
      routes: routes.items.length,
      organisations: organisations.items.length,
      sources: sources.items.length,
    });
    assert.ok(isIsoDate(pack.date));
    assert.equal(pack.date, '2026-10-13');
    assert.equal(pack.version, 'v0.1');
  });

  it('sources: eight, numbered 1..8, all https', () => {
    assert.equal(sources.items.length, 8);
    sources.items.forEach((s, i) => {
      assert.equal(s.number, i + 1);
      assert.match(s.url, /^https:\/\//);
      assert.doesNotThrow(() => new URL(s.url));
    });
  });

  it('process targets: seven unique ids, valid enums, hearing/decision count from admission', () => {
    const t = processTargets.targets;
    assert.equal(t.length, 7);
    assert.equal(new Set(t.map((x) => x.id)).size, 7);
    for (const x of t) {
      assert.ok(['received', 'admitted'].includes(x.from), x.id);
      assert.ok(['calendar', 'working'].includes(x.dayType), x.id);
      assert.equal(x.from, ['hearing', 'decision'].includes(x.stage) ? 'admitted' : 'received', x.id);
      assert.ok(Number.isInteger(x.days) && x.days >= 0, x.id);
    }
    assert.match(processTargets.caveat, /design targets/);
  });

  it('process targets: every channel and route has exactly one receipt, routing and response target; the engine finds "ordinary-response" by id', () => {
    const t = processTargets.targets;
    // Mirrors applies() in src/workflow/deadlines.mjs: no appliesTo means every case.
    const applies = (x, channel, route) => !x.appliesTo || x.appliesTo.includes(channel) || x.appliesTo.includes(route);
    for (const channel of CHANNELS) {
      for (const route of PARTICIPATION_ROUTE_IDS) {
        for (const stage of STAGES_PER_CASE) {
          const n = t.filter((x) => x.stage === stage && applies(x, channel, route)).length;
          assert.equal(n, 1, `${stage} targets for a ${channel} filing on the ${route} route`);
        }
      }
    }
    const response = t.find((x) => x.id === RESPONSE_TARGET_ID);
    assert.ok(response, `a target with id ${RESPONSE_TARGET_ID}`);
    assert.equal(response.stage, 'response');
    assert.equal(response.overridableByLaw, true, 'section 4: "unless governing law specifies otherwise"');
    for (const x of t.filter((x) => STAGES_SYSTEMIC.includes(x.stage))) assert.deepEqual(x.appliesTo, ['systemic-review'], x.id);
  });

  it('participation routes: exactly individual-remedy, systemic-review, policy-or-law', () => {
    assert.deepEqual(participationRoutes.items.map((p) => p.id), PARTICIPATION_ROUTE_IDS);
  });

  it('content/pack: nine sections numbered 1..9 in file order with the full frontmatter key set', () => {
    const { sections } = loadRepo(ROOT);
    assert.equal(sections.length, 9);
    sections.forEach((s, i) => {
      assert.equal(s.error, null, s.file);
      assert.equal(s.frontmatter.section, i + 1, s.file);
      assert.deepEqual(Object.keys(s.frontmatter).sort(), [...SECTION_FRONTMATTER_KEYS].sort(), s.file);
      assert.equal(s.frontmatter.source, pack.sourceDocument);
      assert.equal(s.frontmatter.source_version, pack.version);
      assert.ok(isIsoDate(s.frontmatter.created) && isIsoDate(s.frontmatter.updated), s.file);
      assert.equal(s.name, `${String(i + 1).padStart(2, '0')}-${s.frontmatter.slug}.md`);
    });
  });

  it('every schema is draft 2020-12 with the repository $id and only supported keywords', () => {
    const loaded = loadRepo(ROOT);
    for (const name of DATA_FILES) {
      const schema = loaded.schemas[name];
      assert.ok(schema, `schema/${name}.schema.json is missing`);
      assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
      assert.equal(schema.$id, `https://github.com/mrunmaipatil47/public-democratic-action/schema/${name}.schema.json`);
      assert.ok(schema.title && schema.description, name);
      assert.deepEqual(lintSchema(schema), [], name);
    }
    assert.deepEqual(checkDataAgainstSchemas(loaded), []);
  });
});

// ---------------------------------------------------------------------------
// JSON Schema subset checker
// ---------------------------------------------------------------------------

describe('schema checker: broken fixture (tests/fixtures/broken-issues.json)', () => {
  const broken = JSON.parse(readFileSync(path.join(FIXTURES, 'broken-issues.json'), 'utf8'));
  const problems = checkSchema(issuesSchema, broken);
  /** @param {string} pointer @param {RegExp} re */
  const expect = (pointer, re) => {
    assert.ok(
      problems.some((p) => p.path === pointer && re.test(p.message)),
      `expected ${pointer} ${re}\n${problems.map((p) => `${p.path}: ${p.message}`).join('\n')}`,
    );
  };

  it('reports the array size at the root', () => expect('/', /at least 100 item/));
  it('missing required property is reported at the object with the property name', () => expect('/0', /required property "slug"/));
  it('wrong enum value is reported at the element', () => expect('/1/challengeRoutes/1', /must be one of "A", "I", "R", "H", "J", "P", "V" \(got "X"\)/));
  it('extra property is reported at the property path', () => expect('/2/extra', /additional property "extra"/));
  it('bad pattern is reported with the pattern and the value', () => expect('/3/id', /must match pattern \^\\d\{3\}\$ \(got "4"\)/));
  it('wrong type is reported and does not cascade into item checks', () => {
    expect('/4/raise', /must be array \(got "Residents"\)/);
    assert.ok(!problems.some((p) => p.path.startsWith('/4/raise/')));
  });
  it('minItems, uniqueItems and a second pattern failure are all reported', () => {
    expect('/5/evidence', /at least 1 item/);
    expect('/5/challengeRoutes/1', /duplicate item "A" \(same as index 0\)/);
    expect('/5/domainId', /must match pattern \^d\\d\{2\}\$/);
  });
  it('every fixture record fails for its own reason and the real records pass', () => {
    broken.forEach((record, i) => assert.ok(problems.some((p) => p.path === `/${i}` || p.path.startsWith(`/${i}/`)), `record ${i} should fail`));
    for (const it of issues) assert.deepEqual(checkSchema(issuesSchema.items, it), []);
  });
});

describe('schema checker: keywords', () => {
  it('type arrays allow null (nullable) and reject other types', () => {
    const s = { type: ['string', 'null'] };
    assert.deepEqual(checkSchema(s, 'x'), []);
    assert.deepEqual(checkSchema(s, null), []);
    assert.deepEqual(checkSchema(s, 3), [{ path: '/', message: 'must be string or null (got 3)' }]);
  });

  it('integer vs number, minimum and maximum', () => {
    assert.deepEqual(checkSchema({ type: 'integer' }, 1.5), [{ path: '/', message: 'must be integer (got 1.5)' }]);
    assert.deepEqual(checkSchema({ type: 'number', minimum: 0, maximum: 10 }, 11), [{ path: '/', message: 'must be <= 10 (got 11)' }]);
    assert.deepEqual(checkSchema({ type: 'number', minimum: 0 }, -1), [{ path: '/', message: 'must be >= 0 (got -1)' }]);
    assert.deepEqual(checkSchema({ type: 'integer', minimum: 0, maximum: 10 }, 7), []);
  });

  it('const and enum use deep equality', () => {
    assert.deepEqual(checkSchema({ const: { a: [1, 2] } }, { a: [1, 2] }), []);
    assert.equal(checkSchema({ const: 'yes' }, 'no').length, 1);
    assert.deepEqual(checkSchema({ enum: [[1], [2]] }, [2]), []);
    assert.equal(checkSchema({ enum: ['a', 'b'] }, 'c').length, 1);
  });

  it('oneOf requires exactly one match; anyOf at least one', () => {
    const note = { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] };
    assert.deepEqual(checkSchema(note, 'text'), []);
    assert.deepEqual(checkSchema(note, null), []);
    assert.deepEqual(checkSchema(note, ''), [{ path: '/', message: 'must match exactly one of 2 subschemas (matched 0)' }]);
    const ambiguous = { oneOf: [{ type: 'string' }, { minLength: 1 }] };
    assert.deepEqual(checkSchema(ambiguous, 'x'), [{ path: '/', message: 'must match exactly one of 2 subschemas (matched 2)' }]);
    assert.deepEqual(checkSchema({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 2), []);
    assert.equal(checkSchema({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, true).length, 1);
  });

  it('minLength, maxLength and pattern apply to strings only', () => {
    assert.deepEqual(checkSchema({ minLength: 2 }, 'a'), [{ path: '/', message: 'must be at least 2 character(s) long (got 1)' }]);
    assert.deepEqual(checkSchema({ maxLength: 1 }, 'ab'), [{ path: '/', message: 'must be at most 1 character(s) long (got 2)' }]);
    assert.deepEqual(checkSchema({ pattern: '^a$' }, 5), []);
  });

  it('minItems, maxItems and uniqueItems on arrays; items recurse with indexed pointers', () => {
    const s = { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'string' } };
    assert.deepEqual(checkSchema(s, []), [{ path: '/', message: 'must have at least 1 item(s) (got 0)' }]);
    assert.deepEqual(checkSchema(s, ['a', 'b', 'c']), [{ path: '/', message: 'must have at most 2 item(s) (got 3)' }]);
    assert.deepEqual(checkSchema(s, ['a', 1], '/list'), [{ path: '/list/1', message: 'must be string (got 1)' }]);
    assert.deepEqual(checkSchema(s, ['a', 'a']), [{ path: '/1', message: 'duplicate item "a" (same as index 0)' }]);
  });

  it('additionalProperties as a schema validates extra properties', () => {
    const s = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: { type: 'integer' } };
    assert.deepEqual(checkSchema(s, { a: 'x', b: 2 }), []);
    assert.deepEqual(checkSchema(s, { a: 'x', b: 'y' }), [{ path: '/b', message: 'must be integer (got "y")' }]);
  });

  it('nested pointers escape "/" and "~" per RFC 6901', () => {
    assert.equal(escapePointer('a/b~c'), 'a~1b~0c');
    const s = { type: 'object', properties: { 'a/b': { type: 'object', properties: { 'c~d': { type: 'string' } } } } };
    assert.deepEqual(checkSchema(s, { 'a/b': { 'c~d': 1 } }), [{ path: '/a~1b/c~0d', message: 'must be string (got 1)' }]);
  });

  it('lintSchema flags keywords the checker does not implement', () => {
    assert.deepEqual(lintSchema({ type: 'string', format: 'uri' }), ['/: unsupported keyword "format" (the built-in checker would ignore it)']);
    assert.deepEqual(lintSchema({ type: 'array', items: [{ type: 'string' }] }), ['/items: must be a schema object (boolean or tuple forms are not supported)']);
    assert.equal(lintSchema({ properties: { x: { $ref: '#/$defs/x' } } }).length, 1);
    assert.deepEqual(lintSchema({ type: 'string', pattern: '(' }).length, 1);
  });

  it('lintSchema flags malformed values of supported keywords, which would otherwise silently disable a check', () => {
    // Each of these passes checkSchema for the wrong reason, so the lint must catch them.
    assert.deepEqual(checkSchema({ type: 'object', required: 'id' }, {}), []);
    assert.deepEqual(lintSchema({ type: 'object', required: 'id' }), ['/required: must be an array of property names (got "id")']);
    assert.deepEqual(lintSchema({ type: 'object', required: ['id', 3] }), ['/required: must be an array of property names (got ["id",3])']);
    assert.deepEqual(checkSchema({ type: 'array', uniqueItems: 'true' }, ['a', 'a']), []);
    assert.deepEqual(lintSchema({ type: 'array', uniqueItems: 'true' }), ['/uniqueItems: must be a boolean (got "true")']);
    assert.deepEqual(checkSchema({ type: 'array', minItems: 'x' }, []), []);
    assert.deepEqual(lintSchema({ type: 'array', minItems: 'x' }), ['/minItems: must be a non-negative integer (got "x")']);
    assert.deepEqual(lintSchema({ type: 'array', maxItems: -1 }), ['/maxItems: must be a non-negative integer (got -1)']);
    assert.deepEqual(lintSchema({ type: 'string', minLength: 1.5, maxLength: '2' }), [
      '/minLength: must be a non-negative integer (got 1.5)',
      '/maxLength: must be a non-negative integer (got "2")',
    ]);
    assert.deepEqual(lintSchema({ type: 'number', minimum: '0', maximum: Infinity }), ['/minimum: must be a finite number (got "0")', '/maximum: must be a finite number (got null)']);
    assert.deepEqual(lintSchema({ enum: 'A' }), ['/enum: must be a non-empty array (got "A")']);
    assert.deepEqual(lintSchema({ enum: [] }), ['/enum: must be a non-empty array (got [])']);
    assert.deepEqual(lintSchema({ type: 'string', pattern: 5 }), ['/pattern: must be a string (got 5)']);
    // Nested schemas are linted at their pointer, and well-formed keywords pass.
    assert.deepEqual(lintSchema({ type: 'object', properties: { a: { type: 'array', items: { type: 'string', minLength: 'x' } } } }), ['/properties/a/items/minLength: must be a non-negative integer (got "x")']);
    assert.deepEqual(lintSchema({ type: 'object', required: ['id'], properties: { n: { type: 'integer', minimum: 0, maximum: 10 }, l: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['a'] } } } }), []);
  });
});

// ---------------------------------------------------------------------------
// Frontmatter and id expansion
// ---------------------------------------------------------------------------

describe('parseFrontmatter and expandIdSpec', () => {
  it('parses quoted strings, inline lists, integers and bare values', () => {
    const { frontmatter, body, error } = parseFrontmatter('---\ntitle: "A: b"\nsection: 3\ntags: [x/y, z]\ncreated: 2026-10-12\nempty:\n---\n\n# 3. A: b\n');
    assert.equal(error, null);
    assert.deepEqual(frontmatter, { title: 'A: b', section: 3, tags: ['x/y', 'z'], created: '2026-10-12', empty: '' });
    assert.equal(body, '\n# 3. A: b\n');
  });

  it('reports missing, unterminated and malformed frontmatter', () => {
    assert.match(String(parseFrontmatter('# no frontmatter').error), /missing frontmatter/);
    assert.match(String(parseFrontmatter('---\ntitle: x\n').error), /unterminated/);
    assert.match(String(parseFrontmatter('---\nnot a key value\n---\n').error), /not "key: value"/);
    assert.match(String(parseFrontmatter('---\na: 1\na: 2\n---\n').error), /appears twice/);
  });

  it('rejects inline lists with quoted items instead of mis-splitting them', () => {
    const parsed = parseFrontmatter('---\ntags: ["a, b", c]\n---\n');
    assert.match(String(parsed.error), /^frontmatter key "tags": inline lists may not contain quoted items/);
    assert.deepEqual(parsed.frontmatter, {});
    assert.match(String(parseFrontmatter("---\ntags: ['a', b]\n---\n").error), /quoted items/);
    assert.deepEqual(parseFrontmatter('---\ntags: [type/pack-section, from/google-doc]\n---\n').frontmatter, { tags: ['type/pack-section', 'from/google-doc'] });
    // A quoted scalar that merely contains brackets is still a string.
    assert.deepEqual(parseFrontmatter('---\ntitle: "[draft] x"\n---\n').frontmatter, { title: '[draft] x' });
  });

  it('the broken section fixture is parsed and then rejected by the cross-reference rules', () => {
    const text = readFileSync(path.join(FIXTURES, 'broken-section.md'), 'utf8');
    const parsed = parseFrontmatter(text);
    assert.equal(parsed.error, null);
    const loaded = loadRepo(ROOT);
    loaded.sections[2] = { file: 'content/pack/03-three-routes.md', name: '03-three-routes.md', frontmatter: parsed.frontmatter, body: parsed.body, error: null };
    const { problems } = crossCheck(loaded);
    const F = 'content/pack/03-three-routes.md';
    assert.ok(hasProblem(problems, F, '/frontmatter', /key "slug"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/frontmatter', /key "status"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/frontmatter/source', /https:\/\//), dump(problems));
    assert.ok(hasProblem(problems, F, '/frontmatter/updated', /earlier than created/), dump(problems));
    assert.ok(hasProblem(problems, F, '/body', /level-1 heading must be/), dump(problems));
  });

  it('expands ranges with en dash or hyphen and rejects malformed specs', () => {
    assert.deepEqual(expandIdSpec('001–003, 022, 099-100').ids, ['001', '002', '003', '022', '099', '100']);
    assert.deepEqual(expandIdSpec('009–010, 091–096.').ids, ['009', '010', '091', '092', '093', '094', '095', '096']);
    assert.match(String(expandIdSpec('1-3').error), /cannot parse/);
    assert.match(String(expandIdSpec('005–001').error), /backwards/);
    assert.match(String(expandIdSpec('').error), /no issue ids/);
  });

  it('isIsoDate accepts real UTC dates only', () => {
    assert.ok(isIsoDate('2026-10-13'));
    assert.ok(!isIsoDate('2026-13-01'));
    assert.ok(!isIsoDate('2026-02-30'));
    assert.ok(!isIsoDate('13 October 2026'));
    assert.ok(!isIsoDate(20261013));
    // Years 0000–0099 are real ISO dates, as in src/workflow/calendar.mjs (the full ISO string form
    // never applies the two-digit-year rule of Date.UTC).
    assert.ok(isIsoDate('0099-12-31'));
    assert.ok(isIsoDate('0000-02-29'), 'year 0 is divisible by 400');
    assert.ok(!isIsoDate('0099-02-29'), '99 is not a leap year');
  });
});

// ---------------------------------------------------------------------------
// Cross-reference rules on mutated copies of the real data
// ---------------------------------------------------------------------------

describe('cross-reference rules', () => {
  /** @param {(loaded: ReturnType<typeof loadRepo>) => void} mutate */
  const problemsAfter = (mutate) => {
    const loaded = structuredClone(loadRepo(ROOT));
    mutate(loaded);
    return crossCheck(loaded).problems;
  };

  it('the unmodified repository has no cross-reference problems', () => {
    assert.deepEqual(crossCheck(loadRepo(ROOT)).problems, []);
  });

  it('issue out of order, duplicate slug, outside domain range, bad and duplicate route codes', () => {
    const problems = problemsAfter((l) => {
      l.data.issues[4].domainId = 'd02';
      l.data.issues[7].slug = l.data.issues[6].slug;
      l.data.issues[9].challengeRoutes = ['A', 'Q', 'A'];
      l.data.issues[11].id = '013';
      l.data.issues[12].challengeRoutes = [];
    });
    const F = 'data/issues.json';
    assert.ok(hasProblem(problems, F, '/4/domainId', /outside the range 011–020 of domain d02/), dump(problems));
    assert.ok(hasProblem(problems, F, '/7/slug', /duplicate slug .*\(also used by issue 007\)/), dump(problems));
    assert.ok(hasProblem(problems, F, '/9/challengeRoutes/1', /unknown route code "Q"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/9/challengeRoutes/2', /duplicate route code "A"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/11/id', /must be "012"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/12/challengeRoutes', /at least one challenge route/), dump(problems));
    assert.ok(hasProblem(problems, 'data/domains.json', '/0/issueIds', /does not match the issues whose domainId is "d01"/), dump(problems));
  });

  it('unknown domain and a domain whose issueIds do not match its range', () => {
    const problems = problemsAfter((l) => {
      l.data.issues[0].domainId = 'd99';
      l.data.domains[9].issueIds.pop();
    });
    assert.ok(hasProblem(problems, 'data/issues.json', '/0/domainId', /unknown domain "d99"/), dump(problems));
    assert.ok(hasProblem(problems, 'data/domains.json', '/9/issueIds', /must list exactly the ids 091–100/), dump(problems));
    assert.ok(hasProblem(problems, 'data/domains.json', '/', /not covered: 100/), dump(problems));
  });

  it('routes must be exactly the seven codes with their Appendix B names', () => {
    const problems = problemsAfter((l) => {
      l.data.routes.items[6].code = 'X';
      l.data.routes.items[0].name = 'Appeal';
    });
    assert.ok(hasProblem(problems, 'data/routes.json', '/items', /must be exactly A, I, R, H, J, P, V/), dump(problems));
    assert.ok(hasProblem(problems, 'data/routes.json', '/items/0/name', /must be "Administrative review" for code A/), dump(problems));
  });

  it('organisation agendaIssueIds must resolve and equal the expansion of agendaLinksText', () => {
    const problems = problemsAfter((l) => {
      l.data.organisations.items[0].agendaIssueIds.push('999');
      l.data.organisations.items[1].agendaLinksText = '009–010, 091–095';
      l.data.organisations.items[2].agendaLinksText = 'all digital issues';
      l.data.organisations.items[3].number = 7;
    });
    const F = 'data/organisations.json';
    assert.ok(hasProblem(problems, F, '/items/0/agendaIssueIds/5', /unknown issue id "999"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/0/agendaIssueIds', /must equal the expansion of agendaLinksText/), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/1/agendaIssueIds', /must equal the expansion/), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/2/agendaLinksText', /cannot parse/), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/3/number', /must be 4/), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/3/id', /must be "org-07" for number 7/), dump(problems));
  });

  it('every URL must be https and parse, wherever it appears', () => {
    const problems = problemsAfter((l) => {
      l.data.organisations.items[1].officialEvidenceUrl = 'http://internetfreedom.in/';
      l.data.sources.items[0].url = 'https://';
      l.data.pack.sourceDocument = 'ftp://example.org/x';
      l.data.commitments.caveat = 'See http://example.org for details';
      l.sections[0].frontmatter.source = 'http://docs.google.com/x';
      l.sections[6].body = l.sections[6].body.replace('<https://adrindia.org/?page=0>', '<http://adrindia.org/?page=0>');
    });
    assert.ok(hasProblem(problems, 'content/pack/07-existing-organisations-to-approach.md', '/body', /must be an https:\/\/ URL \(got "http:\/\/adrindia\.org\/\?page=0"\)/), dump(problems));
    assert.ok(hasProblem(problems, 'data/organisations.json', '/items/1/officialEvidenceUrl', /must be an https:\/\/ URL/), dump(problems));
    assert.ok(hasProblem(problems, 'data/sources.json', '/items/0/url', /not a parseable URL/), dump(problems));
    assert.ok(hasProblem(problems, 'data/pack.json', '/sourceDocument', /must be an https:\/\/ URL/), dump(problems));
    assert.ok(hasProblem(problems, 'data/commitments.json', '/caveat', /must be an https:\/\/ URL \(got "http:\/\/example\.org"\)/), dump(problems));
    assert.ok(hasProblem(problems, 'content/pack/01-why-this-proposal-exists.md', '/frontmatter/source', /must be an https:\/\/ URL/), dump(problems));
  });

  it('process targets: unique ids, enums, and from/stage consistency', () => {
    const problems = problemsAfter((l) => {
      const t = l.data['process-targets'].targets;
      t[2].from = 'admitted';
      t[3].dayType = 'business';
      t[5].from = 'received';
      t[6].id = t[5].id;
      t[0].appliesTo = ['fax'];
    });
    const F = 'data/process-targets.json';
    assert.ok(hasProblem(problems, F, '/targets/2/from', /stage "routing" counts from "received"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/targets/3/dayType', /"calendar" or "working"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/targets/5/from', /stage "hearing" counts from "admitted"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/targets/6/id', /duplicate id "systemic-hearing"/), dump(problems));
    assert.ok(hasProblem(problems, F, '/targets/0/appliesTo/0', /must be a channel/), dump(problems));
    assert.equal(problems.filter((p) => p.path === '/targets/6/id').length, 1, 'duplicate id reported once');
  });

  it('process targets: coverage the engine depends on (one receipt/routing/response target per case, "ordinary-response" by id, systemic stages on the systemic route)', () => {
    const F = 'data/process-targets.json';
    const needs = /every case needs exactly one receipt, one routing and one response target \(src\/workflow\/deadlines\.mjs\)$/;
    const coverage = (problems) => problems.filter((p) => p.file === F && needs.test(p.message));

    // No receipt target for telephone filings: deadlines() would throw for every such case.
    let problems = problemsAfter((l) => {
      l.data['process-targets'].targets[1].appliesTo = ['assisted', 'offline', 'postal'];
    });
    assert.ok(hasProblem(problems, F, '/targets', /^0 receipt targets apply to every telephone filing; /), dump(problems));
    assert.equal(coverage(problems).length, 1, 'one problem per stage and count, not one per channel and route');

    // The digital same-day receipt target loses its appliesTo: two receipt targets would apply to
    // every non-digital filing and deadlines() would silently keep the last one listed.
    problems = problemsAfter((l) => {
      delete l.data['process-targets'].targets[0].appliesTo;
    });
    assert.ok(hasProblem(problems, F, '/targets', /^2 receipt targets apply to every assisted, offline, telephone, postal filing; /), dump(problems));
    assert.equal(coverage(problems).length, 1, dump(problems));

    // A target that applies through a participation route is counted for every channel on that route.
    problems = problemsAfter((l) => {
      l.data['process-targets'].targets[2].appliesTo = ['systemic-review'];
    });
    assert.ok(hasProblem(problems, F, '/targets', /^0 routing targets apply to assisted, offline, telephone, postal, digital filings on the individual-remedy or policy-or-law route; /), dump(problems));

    // Renaming the response target: inspect.mjs would fall back to a hard-coded 21 and
    // legalDeadlineDays would no longer override the response stage.
    problems = problemsAfter((l) => {
      l.data['process-targets'].targets[3].id = 'ordinary-reply';
    });
    assert.ok(hasProblem(problems, F, '/targets', /^must contain a target with id "ordinary-response": src\/workflow\/inspect\.mjs/), dump(problems));
    assert.equal(coverage(problems).length, 0, 'the response stage is still covered once; only the id is wrong');
    problems = problemsAfter((l) => {
      l.data['process-targets'].targets[3].stage = 'routing';
    });
    assert.ok(hasProblem(problems, F, '/targets/3/stage', /^must be "response" for id "ordinary-response" \(got "routing"\)$/), dump(problems));
    assert.ok(hasProblem(problems, F, '/targets', /^2 routing targets apply to every case; /), dump(problems));
    assert.ok(hasProblem(problems, F, '/targets', /^0 response targets apply to every case; /), dump(problems));

    // Section 4 scopes admission, hearing and decision to the systemic-review route.
    problems = problemsAfter((l) => {
      delete l.data['process-targets'].targets[4].appliesTo;
      l.data['process-targets'].targets[5].appliesTo = ['systemic-review', 'digital'];
      l.data['process-targets'].targets[6].appliesTo = ['policy-or-law'];
    });
    const systemic = /^stage "(admission|hearing|decision)" must apply to participation routes only, including "systemic-review" \(section 4/;
    assert.ok(hasProblem(problems, F, '/targets/4/appliesTo', systemic), dump(problems));
    assert.ok(hasProblem(problems, F, '/targets/5/appliesTo', systemic), dump(problems));
    assert.ok(hasProblem(problems, F, '/targets/6/appliesTo', systemic), dump(problems));
    assert.equal(coverage(problems).length, 0, 'systemic stages do not count towards per-case coverage');
  });

  it('blank strings: whitespace-only values are rejected by the cross-reference layer, not the schema checker', () => {
    const blanked = structuredClone(issues);
    blanked[0].title = '   ';
    assert.deepEqual(checkSchema(issuesSchema, blanked).filter((p) => p.path === '/0/title'), [], 'minLength counts whitespace, as JSON Schema requires');
    const problems = problemsAfter((l) => {
      l.data.issues[0].title = '   ';
      l.data.issues[1].raise[0] = ' ';
      l.data.routes.items[1].description = ' \n ';
    });
    const blank = /^must not be whitespace only \(it would render as an empty heading, label or table cell\)$/;
    assert.ok(hasProblem(problems, 'data/issues.json', '/0/title', blank), dump(problems));
    assert.ok(hasProblem(problems, 'data/issues.json', '/1/raise/0', blank), dump(problems));
    assert.ok(hasProblem(problems, 'data/routes.json', '/items/1/description', blank), dump(problems));
    assert.equal(problems.filter((p) => blank.test(p.message)).length, 3, dump(problems));
    // An empty string is for the schema (minLength) to accept or reject; the rule does not double-report it.
    const empty = problemsAfter((l) => {
      l.data.issues[2].title = '';
    });
    assert.ok(!hasProblem(empty, 'data/issues.json', '/2/title', blank), dump(empty));
    assert.ok(hasProblem(checkSchema(issuesSchema, [{ ...issues[2], title: '' }]).map((p) => ({ file: 'data/issues.json', ...p })), 'data/issues.json', '/0/title', /at least 1 character/));
  });

  it('pack.counts must match the data files', () => {
    const problems = problemsAfter((l) => {
      l.data.pack.counts.sources = 9;
      l.data.pack.counts.issues = 99;
    });
    assert.ok(hasProblem(problems, 'data/pack.json', '/counts/sources', /is 9 but data\/sources.json has 8/), dump(problems));
    assert.ok(hasProblem(problems, 'data/pack.json', '/counts/issues', /is 99 but data\/issues.json has 100/), dump(problems));
  });

  it('fixed lists keep the counts and ids of the architecture data model', () => {
    const problems = problemsAfter((l) => {
      l.data.commitments.items.pop();
      l.data['participation-routes'].items[0].id = 'remedy';
      l.data['refusal-responses'].items[1].id = l.data['refusal-responses'].items[0].id;
    });
    assert.ok(hasProblem(problems, 'data/commitments.json', '/items', /expected 7 items/), dump(problems));
    assert.ok(hasProblem(problems, 'data/participation-routes.json', '/items', /ids must be exactly individual-remedy, systemic-review, policy-or-law/), dump(problems));
    assert.ok(hasProblem(problems, 'data/refusal-responses.json', '/items/1/id', /duplicate id "silence"/), dump(problems));
  });

  it('pack sections: nine, in order, full frontmatter, matching file name and heading', () => {
    const problems = problemsAfter((l) => {
      delete l.sections[2].frontmatter.status;
      l.sections[2].frontmatter.section = 4;
      l.sections[4].frontmatter.source_version = 'v0.2';
      l.sections[5].frontmatter.extra = 'x';
      l.sections[6].body = l.sections[6].body.replace('# 7.', '## 7.');
      l.sections.push({ file: 'content/pack/10-extra.md', name: '10-extra.md', frontmatter: {}, body: '', error: 'missing frontmatter: the file must start with a "---" line' });
    });
    const S3 = 'content/pack/03-three-routes.md';
    assert.ok(hasProblem(problems, 'content/pack', '/', /expected 9 section files .* found 10/), dump(problems));
    assert.ok(hasProblem(problems, S3, '/frontmatter', /key "status"/), dump(problems));
    assert.ok(hasProblem(problems, S3, '/frontmatter/section', /must be 3/), dump(problems));
    assert.ok(hasProblem(problems, S3, '/', /file name must be "04-three-routes.md"/), dump(problems));
    assert.ok(hasProblem(problems, S3, '/body', /level-1 heading must be "# 4\./), dump(problems));
    assert.ok(hasProblem(problems, 'content/pack/05-when-power-refuses-to-listen.md', '/frontmatter/source_version', /must equal pack.version "v0.1"/), dump(problems));
    assert.ok(hasProblem(problems, 'content/pack/06-a-useful-first-contribution.md', '/frontmatter/extra', /unexpected frontmatter key/), dump(problems));
    assert.ok(hasProblem(problems, 'content/pack/07-existing-organisations-to-approach.md', '/body', /exactly one level-1 heading \(found 0\)/), dump(problems));
    assert.ok(hasProblem(problems, 'content/pack/10-extra.md', '/frontmatter', /missing frontmatter/), dump(problems));
  });

  it('a backwards domain range is reported once, at the range, with no cascade', () => {
    const problems = problemsAfter((l) => {
      l.data.domains[0].range = ['010', '001'];
    });
    assert.deepEqual(problems, [{ file: 'data/domains.json', path: '/0/range', message: 'range 010–001 runs backwards' }]);
  });

  it('process-target messages attribute to section 4 only what the pack says', () => {
    const problems = problemsAfter((l) => {
      l.data['process-targets'].targets[2].from = 'admitted';
      l.data['process-targets'].targets[6].from = 'received';
    });
    const F = 'data/process-targets.json';
    const routing = problems.find((p) => p.file === F && p.path === '/targets/2/from');
    const decision = problems.find((p) => p.file === F && p.path === '/targets/6/from');
    assert.ok(routing && decision, dump(problems));
    assert.match(decision.message, /^stage "decision" counts from "admitted" \(section 4: "hearing\/decision normally within 60\/90 days of admission"\)$/);
    assert.match(routing.message, /^stage "routing" counts from "received" \(the pack names no reference point for the routing stage; counting it from receipt is this repository's reading/);
    assert.ok(!/section 4/.test(routing.message), routing.message);
  });

  it('pack fidelity: organisation fields must occur verbatim in section 7', () => {
    const problems = problemsAfter((l) => {
      const o = l.data.organisations.items;
      o[0].status = 'Has agreed to participate fully.';
      o[1].documentedRelevance = 'Endorses this movement.';
      o[2].suggestedRemoteContribution = 'Provides legal representation.';
      o[3].name = 'Renamed Sangathan';
      o[4].officialEvidenceUrl = 'https://mkssindia.org/elsewhere';
      o[5].agendaLinksText = '009, 011–020, 051–060, 099';
      o[5].agendaIssueIds.push('099');
      l.data.organisations.selectionBasis = 'All entries confirmed.';
      l.data.organisations.additionalNetworkLead = 'NCPRI has joined.';
    });
    const F = 'data/organisations.json';
    const S7 = 'content/pack/07-existing-organisations-to-approach.md';
    // describe() truncates long values at 57 characters followed by "...", so the end is not anchored.
    /** @param {string} text */
    const differs = (text) => new RegExp(`^differs from ${S7}: the section body does not contain ${text}`);
    assert.ok(hasProblem(problems, F, '/items/0/status', differs('"Status: Has agreed to participate fully."')), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/1/documentedRelevance', differs('"Documented relevance: Endorses this movement."')), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/2/suggestedRemoteContribution', differs('"Suggested remote contribution: Provides legal representa\\.\\.\\.$')), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/3/name', differs('"## 04. Renamed Sangathan"')), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/4/officialEvidenceUrl', differs('"Official evidence: <https://mkssindia.org/elsewhere>"')), dump(problems));
    assert.ok(hasProblem(problems, F, '/items/5/agendaLinksText', differs('"Agenda links: 009, 011–020, 051–060, 099."')), dump(problems));
    assert.ok(hasProblem(problems, F, '/selectionBasis', differs('"All entries confirmed."')), dump(problems));
    assert.ok(hasProblem(problems, F, '/additionalNetworkLead', differs('"NCPRI has joined."')), dump(problems));
    assert.equal(problems.length, 8, dump(problems));
  });

  it('pack fidelity: caveats, bullets, route texts and pinned sentences must stay with the pack', () => {
    const problems = problemsAfter((l) => {
      l.data.commitments.caveat = 'These are binding guarantees.';
      l.data.commitments.items[0].description = 'everyone must use Aadhaar.';
      l.data['participation-routes'].caveat = 'We respond to emergencies.';
      l.data['participation-routes'].items[2].text = 'A poll creates legal authority.';
      l.data['participation-routes'].items[0].name = 'Fast track';
      l.data['process-targets'].caveat = 'Statutory deadlines.';
      l.data['process-targets'].sourceText = 'Targets are mandatory.';
      l.data['refusal-responses'].caveat = 'Fines apply.';
      l.data['refusal-responses'].items[0].response = 'close the case.';
      l.data['contribution-types'].form.caveat = 'Volunteers provide legal representation.';
      l.data['contribution-types'].form.fields.push('signature');
      l.data['contribution-types'].items[1].name = 'Litigation';
      l.data.routes.caveat = 'Follow these routes in order.';
      l.data.pack.disclaimer = 'All listed organisations participate.';
    });
    /** @param {string} file @param {string} ptr @param {RegExp} re */
    const expect = (file, ptr, re) => assert.ok(hasProblem(problems, file, ptr, re), `${file} ${ptr}\n${dump(problems)}`);
    expect('data/commitments.json', '/caveat', /differs from content\/pack\/02-public-commitments-to-test\.md: .*"These are binding guarantees\."/);
    expect('data/commitments.json', '/items/0', /does not contain "- Open intake: everyone must use Aadhaar\."/);
    expect('data/participation-routes.json', '/caveat', /differs from content\/pack\/03-three-routes\.md/);
    expect('data/participation-routes.json', '/items/2/text', /does not contain "A poll creates legal authority\."/);
    expect('data/participation-routes.json', '/items/0/name', /does not contain "## Fast track"/);
    expect('data/process-targets.json', '/caveat', /differs from content\/pack\/04-existing-foundations-and-proposed-additions\.md/);
    expect('data/process-targets.json', '/sourceText', /does not contain "Targets are mandatory\."/);
    expect('data/refusal-responses.json', '/caveat', /differs from content\/pack\/05-when-power-refuses-to-listen\.md/);
    expect('data/refusal-responses.json', '/items/0', /does not contain "- Silence: close the case\."/);
    expect('data/contribution-types.json', '/form/caveat', /differs from content\/pack\/06-a-useful-first-contribution\.md/);
    expect('data/contribution-types.json', '/form/fields', /does not contain "A simple contribution form: issue ID; proposed correctio\.\.\.$/);
    expect('data/contribution-types.json', '/items/1', /does not contain "- Litigation: correct one owner\/remedy map/);
    expect('data/routes.json', '/caveat', new RegExp(`^must keep the Appendix B sentence "${ROUTES_CAVEAT_SENTENCE}" \\(got "Follow these routes in order\\."\\)$`));
    expect('data/pack.json', '/disclaimer', new RegExp(`^must keep the title-page sentence "${PACK_DISCLAIMER_SENTENCE}"`));
    assert.equal(problems.length, 14, dump(problems));
    assert.equal(ROUTES_CAVEAT_SENTENCE, 'These routes are options, not a compulsory ladder.');
    assert.equal(PACK_DISCLAIMER_SENTENCE, 'No organisation listed here has agreed to participate.');
  });

  it('privacy: strings that look like personal contact data are reported without being echoed', () => {
    assert.equal(personalDataKind('Use institutional public routes.'), null);
    assert.equal(personalDataKind('call 9876543210'), 'a 10-digit mobile number');
    assert.equal(personalDataKind('id 123456789012'), 'a 12-digit identifier');
    assert.equal(personalDataKind('id 1234 5678 9012'), 'a grouped 12-digit identifier');
    assert.equal(personalDataKind('write to someone@example.org'), 'an e-mail address');
    assert.equal(personalDataKind('tel:112'), 'a mailto: or tel: link');
    assert.equal(personalDataKind('Mailto: nobody'), 'a mailto: or tel: link');
    assert.equal(personalDataKind('2026-10-13 and 1234567890'), null, 'a 10-digit number not starting 6-9 is not a mobile number');
    // Kept in step with src/workflow/guards.mjs VALUE_PATTERNS: grouped and prefixed numbers, VID, PAN, EPIC.
    assert.equal(personalDataKind('call +91 98765 43210'), 'a 10-digit mobile number');
    assert.equal(personalDataKind('call 0091-98765-43210'), 'a 10-digit mobile number');
    assert.equal(personalDataKind('call 098765 43210'), 'a 10-digit mobile number');
    assert.equal(personalDataKind('id 1234.5678.9012'), 'a grouped 12-digit identifier');
    assert.equal(personalDataKind('VID 1234567890123456'), 'a 16-digit identifier');
    assert.equal(personalDataKind('PAN ABCDE1234F'), 'a PAN-like identifier');
    assert.equal(personalDataKind('EPIC ABC1234567'), 'a voter EPIC-like identifier');
    assert.equal(personalDataKind('issues 001 002 003 004 and 2026-10-13 2026-10-14'), null, 'short numbers are not collapsed into an identifier');
    assert.equal(personalDataKind('CPGRAMS 2024 and RTI 2005; 60/90 days'), null);
    const problems = problemsAfter((l) => {
      l.data.issues[0].raise.push('9876543210');
      l.data.sources.intro += ' 123456789012';
      l.data.pack.tagline += ' 1234 5678 9012';
      l.data.organisations.items[0].status += ' Write to someone@example.org.';
      l.sections[8].body += '\nContact: mailto:someone@example.org';
      l.sections[7].body += '\nCall tel:112';
      l.data.issues[1].raise.push('PAN ABCDE1234F');
    });
    /** @param {string} kind */
    const re = (kind) => new RegExp(`^looks like personal contact data \\(${kind}\\); the pack includes only institutional public routes$`);
    assert.ok(hasProblem(problems, 'data/issues.json', '/0/raise/3', re('a 10-digit mobile number')), dump(problems));
    assert.ok(hasProblem(problems, 'data/sources.json', '/intro', re('a 12-digit identifier')), dump(problems));
    assert.ok(hasProblem(problems, 'data/pack.json', '/tagline', re('a grouped 12-digit identifier')), dump(problems));
    assert.ok(hasProblem(problems, 'data/organisations.json', '/items/0/status', re('an e-mail address')), dump(problems));
    assert.ok(hasProblem(problems, 'content/pack/09-first-organising-cycle.md', '/body', re('an e-mail address')), dump(problems));
    assert.ok(hasProblem(problems, 'content/pack/08-a-short-invitation.md', '/body', re('a mailto: or tel: link')), dump(problems));
    assert.ok(hasProblem(problems, 'data/issues.json', '/1/raise/3', re('a PAN-like identifier')), dump(problems));
    for (const p of problems) {
      assert.ok(!p.message.includes('9876543210') && !p.message.includes('someone@example.org') && !p.message.includes('123456789012') && !p.message.includes('ABCDE1234F'), `value echoed: ${formatProblem(p)}`);
    }
  });

  it('export safety: formula-leading strings and list items containing the CSV separator are rejected', () => {
    const problems = problemsAfter((l) => {
      l.data.issues[1].title = '=1+1';
      l.data.issues[2].possibleChange = '@SUM(A1)';
      l.data.issues[3].evidence[0] = '+cmd';
      l.data.issues[4].raise[0] = '-' + l.data.issues[4].raise[0];
      l.data.sources.intro = '\t' + l.data.sources.intro;
      l.data.issues[5].answer[0] = 'Collector | Tahsildar';
      l.data.organisations.items[0].suggestedRemoteContribution = 'Review | audit';
    });
    const formula = /^must not start with a spreadsheet formula character \(=, \+, -, @, tab or CR\)/;
    assert.ok(hasProblem(problems, 'data/issues.json', '/1/title', formula), dump(problems));
    assert.ok(hasProblem(problems, 'data/issues.json', '/2/possibleChange', formula), dump(problems));
    assert.ok(hasProblem(problems, 'data/issues.json', '/3/evidence/0', formula), dump(problems));
    assert.ok(hasProblem(problems, 'data/issues.json', '/4/raise/0', formula), dump(problems));
    assert.ok(hasProblem(problems, 'data/sources.json', '/intro', formula), dump(problems));
    assert.ok(hasProblem(problems, 'data/issues.json', '/5/answer/0', /^must not contain the CSV list separator " \| " \(scripts\/export-csv\.mjs joins answer with it/), dump(problems));
    // The separator rule applies to exported list fields only; a prose field with " | " is faithful data
    // (it is still reported here, but by the fidelity rule, not the separator rule).
    assert.ok(!hasProblem(problems, 'data/organisations.json', '/items/0/suggestedRemoteContribution', /list separator/), dump(problems));
    assert.ok(hasProblem(problems, 'data/organisations.json', '/items/0/suggestedRemoteContribution', /differs from/), dump(problems));
    assert.equal(problems.filter((p) => formula.test(p.message)).length, 5, dump(problems));
  });

  it('formatProblem prints "<file>: <json-pointer>: <message>"', () => {
    assert.equal(formatProblem({ file: 'data/issues.json', path: '/4/domainId', message: 'x' }), 'data/issues.json: /4/domainId: x');
    assert.equal(formatProblem({ file: 'data/pack.json', path: '', message: 'y' }), 'data/pack.json: /: y');
  });
});

// ---------------------------------------------------------------------------
// Load-time problems (encoding, parse errors, file set) on planted copies
// ---------------------------------------------------------------------------

describe('loadRepo: load-time problems', () => {
  it('reports a BOM, invalid JSON, a missing data file, an unexpected data file and an orphan schema, each once at "/"', () => {
    const tmp = copyRepo('load');
    const sources = path.join(tmp, 'data', 'sources.json');
    writeFileSync(sources, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(sources)]));
    writeFileSync(path.join(tmp, 'data', 'routes.json'), '{ bad json');
    writeFileSync(path.join(tmp, 'data', 'extra.json'), '{}');
    writeFileSync(path.join(tmp, 'schema', 'orphan.schema.json'), '{}');
    rmSync(path.join(tmp, 'data', 'commitments.json'));
    /** @type {[string, RegExp][]} */ const expected = [
      ['data/extra.json', /^unexpected data file: add it to docs\/architecture\.md, schema\/ and scripts\/validate\.mjs, or remove it$/],
      ['data/routes.json', /^invalid JSON: /],
      ['data/commitments.json', /^file is missing$/],
      ['data/sources.json', /^file starts with a UTF-8 BOM; data files must be UTF-8 without BOM$/],
      ['schema/orphan.schema.json', /^schema has no matching data file in data\/$/],
    ];
    const loaded = loadRepo(tmp);
    assert.equal(loaded.problems.length, expected.length, dump(loaded.problems));
    for (const [file, re] of expected) {
      const matching = loaded.problems.filter((p) => p.file === file);
      assert.equal(matching.length, 1, `${file}\n${dump(loaded.problems)}`);
      assert.equal(matching[0].path, '/');
      assert.match(matching[0].message, re);
    }
    assert.ok(!Object.hasOwn(loaded.data, 'routes') && !Object.hasOwn(loaded.data, 'sources') && !Object.hasOwn(loaded.data, 'commitments'));
    assert.ok(Object.hasOwn(loaded.data, 'issues') && Object.hasOwn(loaded.schemas, 'routes'));
    // The later layers skip what failed to load instead of cascading.
    assert.deepEqual(validateRepo(tmp).problems, loaded.problems);
  });

  it('reports missing data/, schema/ and content/pack directories on an empty root', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'pda-empty-'));
    TMP_DIRS.push(tmp);
    const { problems } = validateRepo(tmp);
    for (const dir of ['data', 'schema', 'content/pack']) assert.ok(hasProblem(problems, dir, '/', /^directory is missing$/), dump(problems));
    for (const name of DATA_FILES) {
      assert.ok(hasProblem(problems, `data/${name}.json`, '/', /^file is missing$/), dump(problems));
      assert.ok(hasProblem(problems, `schema/${name}.schema.json`, '/', /^file is missing$/), dump(problems));
    }
    for (const p of problems) assert.equal(p.path, '/', formatProblem(p));
  });

  it('accepts a legitimate U+FFFD but rejects malformed UTF-8 in data files and pack sections', () => {
    const okCopy = copyRepo('fffd');
    editJson(okCopy, 'data/pack.json', (doc) => {
      doc.tagline += ' \uFFFD';
    });
    assert.deepEqual(validateRepo(okCopy).problems, []);

    const bad = copyRepo('badutf8');
    writeFileSync(path.join(bad, 'data', 'commitments.json'), Buffer.concat([Buffer.from('{"caveat":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]));
    const section = path.join(bad, 'content', 'pack', '09-first-organising-cycle.md');
    writeFileSync(section, Buffer.concat([readFileSync(section), Buffer.from([0xc3, 0x28])]));
    const { problems } = validateRepo(bad);
    assert.ok(hasProblem(problems, 'data/commitments.json', '/', /^file is not valid UTF-8 \(/), dump(problems));
    assert.ok(hasProblem(problems, 'content/pack/09-first-organising-cycle.md', '/', /^file is not valid UTF-8 \(/), dump(problems));
    assert.equal(problems.filter((p) => p.file === 'content/pack/09-first-organising-cycle.md').length, 1, 'no cascade into frontmatter or body checks');
    assert.equal(problems.length, 2, dump(problems));
  });
});

// ---------------------------------------------------------------------------
// Validator CLI
// ---------------------------------------------------------------------------

describe('validate.mjs command line', () => {
  const script = path.join(ROOT, 'scripts', 'validate.mjs');
  /** @type {string[]} */ const tmpDirs = [];
  after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  /** @param {string[]} args */
  const run = (args) => {
    try {
      return { status: 0, stdout: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '' };
    } catch (e) {
      const err = /** @type {{ status: number, stdout: string, stderr: string }} */ (e);
      return { status: err.status, stdout: err.stdout, stderr: err.stderr };
    }
  };

  it('parseArgs understands --quiet and --root', () => {
    assert.deepEqual(parseArgs(['--quiet', '--root', '/x']), { quiet: true, root: path.resolve('/x'), help: false, error: null });
    assert.equal(parseArgs(['--root=/y']).root, path.resolve('/y'));
    assert.match(String(parseArgs(['--bogus']).error), /unknown argument/);
  });

  it('exits 2 with the usage line on stderr for an unknown argument or a missing --root value', () => {
    const bogus = run(['--bogus']);
    assert.equal(bogus.status, 2);
    assert.equal(bogus.stdout, '');
    assert.match(bogus.stderr, /^validate: unknown argument "--bogus"\nusage: node scripts\/validate\.mjs/);
    const noRoot = run(['--root']);
    assert.equal(noRoot.status, 2);
    assert.match(noRoot.stderr, /--root needs a directory/);
  });

  it('exits 0 with a one-line summary on the real repository, and prints nothing with --quiet', () => {
    const clean = run([]);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.equal(clean.stdout.trim().split('\n').length, 1);
    assert.match(clean.stdout, /^validate: OK\. .*100 issue families in 10 domains.*9 pack sections/);
    const quiet = run(['--quiet']);
    assert.equal(quiet.status, 0);
    assert.equal(quiet.stdout, '');
  });

  it('exits 1 and prints every problem as "file: pointer: message" on a broken copy', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'pda-validate-'));
    tmpDirs.push(tmp);
    for (const dir of ['data', 'schema', 'content']) cpSync(path.join(ROOT, dir), path.join(tmp, dir), { recursive: true });
    const copy = JSON.parse(readFileSync(path.join(tmp, 'data', 'issues.json'), 'utf8'));
    copy[4].domainId = 'd02';
    copy[5].challengeRoutes.push('Z');
    writeFileSync(path.join(tmp, 'data', 'issues.json'), JSON.stringify(copy));
    const result = run(['--root', tmp]);
    assert.equal(result.status, 1);
    const lines = result.stdout.trim().split('\n');
    assert.ok(lines.includes('data/issues.json: /4/domainId: issue 005 is outside the range 011–020 of domain d02'), result.stdout);
    assert.ok(lines.includes('data/issues.json: /5/challengeRoutes/3: unknown route code "Z" (valid: A, I, R, H, J, P, V)'), result.stdout);
    assert.ok(lines.includes('data/issues.json: /5/challengeRoutes/3: must be one of "A", "I", "R", "H", "J", "P", "V" (got "Z")'), result.stdout);
    for (const line of lines) assert.match(line, /^[^:]+: \/[^:]*: .+$/, line);
    assert.match(result.stderr, /validate: \d+ problems found/);
    const quiet = run(['--root', tmp, '--quiet']);
    assert.equal(quiet.status, 1);
    assert.equal(quiet.stderr, '');
    assert.equal(quiet.stdout, result.stdout);
  });
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

describe('CSV writer', () => {
  it('csvField quotes commas, double quotes, CR and LF per RFC 4180 and leaves plain text alone', () => {
    assert.equal(csvField('plain text'), 'plain text');
    assert.equal(csvField('Parisar, Pune'), '"Parisar, Pune"');
    assert.equal(csvField('say "hi"'), '"say ""hi"""');
    assert.equal(csvField('line1\nline2'), '"line1\nline2"');
    assert.equal(csvField('a\r\nb'), '"a\r\nb"');
    assert.equal(csvField(''), '');
    assert.equal(csvField(null), '');
    assert.equal(csvField(undefined), '');
    assert.equal(csvField(7), '7');
    assert.equal(csvField(' leading and trailing '), ' leading and trailing ');
    assert.equal(csvField('semi; colon | pipe'), 'semi; colon | pipe');
  });

  it('toCsv writes a header row, LF line endings, a trailing LF and no CRLF', () => {
    const csv = toCsv(['a', 'b'], [['1', 'x,y'], ['2', 'he said "no"']]);
    assert.equal(csv, 'a,b\n1,"x,y"\n2,"he said ""no"""\n');
    assert.ok(!csv.includes('\r'));
    assert.throws(() => toCsv(['a', 'b'], [['only one']]), /row 0 has 1 fields, expected 2/);
  });

  it('joinList uses " | " and refuses items that contain it', () => {
    assert.equal(LIST_SEPARATOR, ' | ');
    assert.equal(LIST_SEPARATOR, CSV_LIST_SEPARATOR, 'the validator rejects list items containing the same separator the exporter uses');
    assert.equal(joinList(['A', 'I', 'P']), 'A | I | P');
    assert.equal(joinList([]), '');
    assert.throws(() => joinList(['x | y', 'z']), /^Error: list item 0 contains the list separator " \| " \("x \| y"\)$/);
    assert.equal(joinList(['x|y', 'z']), 'x|y | z', 'a bare pipe without spaces is not the separator');
  });

  it('row builders report every reference and shape problem together, and write nothing', () => {
    assert.throws(
      () => issuesRows([{ id: '001', domainId: 'd99' }, { id: '002', domainId: 'd98', raise: ['a'], answer: ['b | c'], evidence: [], challengeRoutes: [] }], domains),
      (e) => {
        const lines = /** @type {Error} */ (e).message.split('\n');
        assert.equal(lines[0], 'issues.csv: 7 problems, nothing written (run node scripts/validate.mjs)');
        assert.deepEqual(lines.slice(1), [
          'issue 001: unknown domainId "d99"',
          'issue 001: raise: must be a list (got undefined)',
          'issue 001: answer: must be a list (got undefined)',
          'issue 001: evidence: must be a list (got undefined)',
          'issue 001: challengeRoutes: must be a list (got undefined)',
          'issue 002: unknown domainId "d98"',
          'issue 002: answer: list item 0 contains the list separator " | " ("b | c")',
        ]);
        return true;
      },
    );
    assert.throws(
      () => organisationIssueLinksRows([{ id: 'org-98', name: 'x', agendaIssueIds: ['999', '001', '998'] }, { id: 'org-99', name: 'y', agendaIssueIds: 'all' }], issues),
      (e) => {
        assert.deepEqual(/** @type {Error} */ (e).message.split('\n'), [
          'organisation-issue-links.csv: 3 problems, nothing written (run node scripts/validate.mjs)',
          'organisation org-98: agenda issue "999" does not exist',
          'organisation org-98: agenda issue "998" does not exist',
          'organisation org-99: agendaIssueIds must be a list (got "all")',
        ]);
        return true;
      },
    );
    assert.throws(() => organisationsRows([{ id: 'org-01', agendaIssueIds: null }]), /^Error: organisations\.csv: 1 problem, nothing written \(run node scripts\/validate\.mjs\)\norganisation org-01: agendaIssueIds: must be a list \(got null\)$/);
  });

  it('issues table: 100 rows with the eight required columns in order', () => {
    assert.deepEqual(ISSUE_COLUMNS, ['id', 'title', 'domain', 'raise', 'answer', 'possibleChange', 'evidence', 'challengeRoutes']);
    const rows = issuesRows(issues, domains);
    assert.equal(rows.length, 100);
    for (const row of rows) assert.equal(row.length, ISSUE_COLUMNS.length);
    assert.deepEqual(rows[0], [
      '001',
      'Fair electoral rolls and wrongful exclusion',
      'Democracy, public voice and media',
      'Voters | migrants | election observers',
      'Electoral Registration Officer | election authorities',
      'Correct entries; publish review procedures and audit results',
      'Deletion notices | appeals | reversals | roll audit',
      'A | I | P',
    ]);
    assert.equal(rows[76][0], '077');
    assert.equal(rows[76][2], 'Agriculture, rural livelihoods and food systems');
    assert.throws(() => issuesRows([{ id: '001', domainId: 'd99', raise: [], answer: [], evidence: [], challengeRoutes: [] }], domains), /unknown domainId "d99"/);
  });

  it('organisations table: 13 rows; links table: one row per agenda link', () => {
    const orgRows = organisationsRows(organisations.items);
    assert.equal(orgRows.length, 13);
    for (const row of orgRows) assert.equal(row.length, ORGANISATION_COLUMNS.length);
    assert.equal(orgRows[0][ORGANISATION_COLUMNS.indexOf('agendaIssueIds')], '001 | 002 | 003 | 004 | 005');
    const links = organisationIssueLinksRows(organisations.items, issues);
    const expected = organisations.items.reduce((n, o) => n + o.agendaIssueIds.length, 0);
    assert.equal(links.length, expected);
    assert.equal(expected, 128);
    assert.deepEqual(links[0], ['org-01', 'Association for Democratic Reforms / National Election Watch', '001', 'Fair electoral rolls and wrongful exclusion']);
    assert.deepEqual(LINK_COLUMNS, ['organisationId', 'organisationName', 'issueId', 'issueTitle']);
    assert.throws(() => organisationIssueLinksRows([{ id: 'org-99', name: 'x', agendaIssueIds: ['999'] }], issues), /agenda issue "999" does not exist/);
  });

  it('buildTables returns the three tables', () => {
    assert.deepEqual(buildTables(ROOT).map((t) => [t.name, t.rows.length]), [
      ['issues.csv', 100],
      ['organisations.csv', 13],
      ['organisation-issue-links.csv', 128],
    ]);
  });
});

describe('CSV export round trip', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pda-exports-'));
  after(() => rmSync(tmp, { recursive: true, force: true }));

  it('writes the three files into a new directory, UTF-8 without BOM, LF only, header plus rows', () => {
    const outDir = path.join(tmp, 'nested', 'exports');
    assert.ok(!existsSync(outDir));
    const written = writeExports({ root: ROOT, outDir });
    assert.deepEqual(written.map((w) => [w.name, w.rows]), [
      ['issues.csv', 100],
      ['organisations.csv', 13],
      ['organisation-issue-links.csv', 128],
    ]);
    for (const w of written) {
      const buf = readFileSync(w.path);
      assert.ok(!(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf), `${w.name} has a BOM`);
      const text = buf.toString('utf8');
      assert.ok(!text.includes('\r'), `${w.name} contains CR`);
      assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), `${w.name} must end with exactly one LF`);
      assert.equal(text.split('\n').length - 1, w.rows + 1, `${w.name} line count`);
    }
  });

  it('parsing the files back yields the original rows, including quoted names and en dashes', () => {
    const outDir = path.join(tmp, 'nested', 'exports');
    const tables = buildTables(ROOT);
    for (const t of tables) {
      const parsed = parseCsv(readFileSync(path.join(outDir, t.name), 'utf8'));
      assert.deepEqual(parsed[0], t.columns, `${t.name} header`);
      assert.deepEqual(parsed.slice(1), t.rows.map((r) => r.map(String)), `${t.name} rows`);
    }
    const orgs = parseCsv(readFileSync(path.join(outDir, 'organisations.csv'), 'utf8'));
    const nameCol = ORGANISATION_COLUMNS.indexOf('name');
    assert.ok(orgs.slice(1).some((r) => r[nameCol] === 'Parisar, Pune'));
    assert.ok(orgs.slice(1).some((r) => r[ORGANISATION_COLUMNS.indexOf('agendaLinksText')] === '009–010, 091–096'));
  });

  it('the command line exits 2 on a bad argument and 1 with every problem on a broken copy, writing nothing', () => {
    const script = path.join(ROOT, 'scripts', 'export-csv.mjs');
    /** @param {string[]} args */
    const run = (args) => {
      try {
        return { status: 0, stdout: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '' };
      } catch (e) {
        const err = /** @type {{ status: number, stdout: string, stderr: string }} */ (e);
        return { status: err.status, stdout: err.stdout, stderr: err.stderr };
      }
    };
    const bogus = run(['--bogus']);
    assert.equal(bogus.status, 2);
    assert.match(bogus.stderr, /^export-csv: unknown argument "--bogus"\nusage: node scripts\/export-csv\.mjs/);
    assert.equal(run(['--out']).status, 2);

    const broken = copyRepo('export-broken');
    editJson(broken, 'data/issues.json', (doc) => {
      delete doc[0].raise;
      doc[0].domainId = 'd99';
      doc[1].domainId = 'd98';
    });
    const outDir = path.join(tmp, 'broken-out');
    const result = run(['--root', broken, '--out', outDir]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const lines = result.stderr.trim().split('\n');
    for (const line of lines) assert.match(line, /^export-csv: /, line);
    assert.deepEqual(lines, [
      'export-csv: issues.csv: 3 problems, nothing written (run node scripts/validate.mjs)',
      'export-csv: issue 001: unknown domainId "d99"',
      'export-csv: issue 001: raise: must be a list (got undefined)',
      'export-csv: issue 002: unknown domainId "d98"',
    ]);
    assert.ok(!existsSync(outDir), 'nothing is written when a table has problems');
    const missing = run(['--root', path.join(broken, 'nowhere')]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /^export-csv: ENOENT/);
  });

  it('the command line creates exports/ under --out and reports row counts', () => {
    const outDir = path.join(tmp, 'cli-out');
    const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'export-csv.mjs'), '--out', outDir], { encoding: 'utf8' });
    assert.match(stdout, /issues\.csv \(100 rows\)/);
    assert.match(stdout, /organisations\.csv \(13 rows\)/);
    assert.match(stdout, /organisation-issue-links\.csv \(128 rows\)/);
    assert.ok(existsSync(path.join(outDir, 'issues.csv')));
    const quiet = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'export-csv.mjs'), '--out', outDir, '--quiet'], { encoding: 'utf8' });
    assert.equal(quiet, '');
  });
});
