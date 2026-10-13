#!/usr/bin/env node
/**
 * Validate the structured data and pack sections of Public Voice Between Elections.
 *
 * Usage:
 *   node scripts/validate.mjs [--quiet] [--root <dir>]
 *
 * Checks, in this order:
 *   1. every file in data/ is UTF-8 JSON without a BOM and has a schema in schema/;
 *   2. every data file matches its JSON Schema (draft 2020-12 subset, checked by the small
 *      dependency-free checker below: type, required, properties, additionalProperties, enum,
 *      const, pattern, minLength, maxLength, items, minItems, maxItems, uniqueItems, minimum,
 *      maximum, oneOf, anyOf, nullable via type arrays);
 *   3. the cross-reference rules of docs/architecture.md, Module 1: issue ids 001..100 in
 *      order, unique slugs, domain membership by range, valid unique challenge-route codes,
 *      organisation agendaIssueIds equal to the expansion of agendaLinksText, https URLs that
 *      parse, exactly the seven route codes, process-target ids and enums, pack.counts, and
 *      nine content/pack sections with frontmatter section 1..9 and the full key set;
 *   4. pack fidelity: organisation fields, caveats, commitments, refusal responses, participation
 *      routes and contribution types must occur verbatim in the body of the pack section they
 *      come from, and pinned sentences (the title-page disclaimer, the Appendix B caveat) stay;
 *   5. privacy and export safety: no data string or section body looks like personal contact
 *      data (e-mail, 12-digit identifier, 10-digit mobile number, mailto:/tel:), no data string
 *      starts with a spreadsheet formula character, and no list item contains the CSV list
 *      separator used by scripts/export-csv.mjs.
 *
 * Every problem is printed as "<file>: <json-pointer>: <message>". Exit code 0 and a one-line
 * summary when clean, exit code 1 otherwise. --quiet suppresses the summary.
 *
 * No dependencies. The building blocks are exported for tests and other scripts.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{ path: string, message: string }} SchemaProblem */
/** @typedef {{ file: string, path: string, message: string }} Problem */
/** @typedef {Record<string, any>} Schema */
/**
 * @typedef {object} Section
 * @property {string} file   repo-relative path, e.g. content/pack/01-why-this-proposal-exists.md
 * @property {string} name   file name
 * @property {Record<string, any>} frontmatter
 * @property {string} body
 * @property {string|null} error
 * @property {string} [errorPath]  pointer the error is reported at (default "/frontmatter")
 */
/**
 * @typedef {object} Loaded
 * @property {string} root
 * @property {Record<string, any>} data        parsed data files by base name (issues, pack, ...)
 * @property {Record<string, Schema>} schemas  parsed schemas by base name
 * @property {Section[]} sections              content/pack/*.md in file-name order
 * @property {Problem[]} problems              load-time problems (missing, unparseable, unexpected)
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Repository root, derived from this file's location so the script works from any cwd. */
export const DEFAULT_ROOT = path.resolve(HERE, '..');

export const SCHEMA_ID_BASE = 'https://github.com/mrunmaipatil47/public-democratic-action/schema/';
export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** Data files named in docs/architecture.md, "Data model". One schema each. */
export const DATA_FILES = [
  'pack',
  'issues',
  'domains',
  'routes',
  'organisations',
  'commitments',
  'participation-routes',
  'refusal-responses',
  'contribution-types',
  'sources',
  'process-targets',
];

/** Appendix B of the pack: the seven challenge routes, in the pack's order. */
export const ROUTE_NAMES = Object.freeze({
  A: 'Administrative review',
  I: 'Information / RTI',
  R: 'Regulator or specialist redress',
  H: 'Rights or protection route',
  J: 'Qualified legal review / competent court or tribunal',
  P: 'Policy hearing / legislative scrutiny / lawful advocacy',
  V: 'Vigilance or audit referral',
});
export const ROUTE_CODES = Object.keys(ROUTE_NAMES);

/** Section 3 of the pack: the three participation routes, in order. */
export const PARTICIPATION_ROUTE_IDS = ['individual-remedy', 'systemic-review', 'policy-or-law'];
/** Section 2 (open intake): the channels people can raise concerns through. */
export const CHANNELS = ['assisted', 'offline', 'telephone', 'postal', 'digital'];
/**
 * Process-target stages the pack counts from admission: section 4 says "hearing/decision normally
 * within 60/90 days of admission". The pack names no reference point for the other stages;
 * counting receipt, routing, response and admission from receipt is this repository's reading.
 */
export const STAGES_FROM_ADMISSION = ['hearing', 'decision'];

/** Title page of the pack: data/pack.json `disclaimer` must keep this sentence. */
export const PACK_DISCLAIMER_SENTENCE = 'No organisation listed here has agreed to participate.';
/** Appendix B caveat (Appendix B is not in content/pack): data/routes.json `caveat` must keep this sentence. */
export const ROUTES_CAVEAT_SENTENCE = 'These routes are options, not a compulsory ladder.';

/** Separator scripts/export-csv.mjs joins list fields with; items of those fields may not contain it. */
export const CSV_LIST_SEPARATOR = ' | ';
/** Data keys exported as joined CSV columns. */
export const CSV_LIST_FIELDS = Object.freeze(['raise', 'answer', 'evidence', 'challengeRoutes', 'agendaIssueIds']);

/**
 * Personal-contact patterns, duplicated from src/workflow/guards.mjs VALUE_PATTERNS (plus the
 * mailto:/tel: schemes) so Module 1 stays self-contained; keep both lists in step. Section 7:
 * "Use institutional public routes; no personal activist contact database is included." A
 * matched value is never echoed in a message.
 * @type {ReadonlyArray<readonly [string, RegExp]>}
 */
export const PERSONAL_DATA_PATTERNS = Object.freeze([
  ['a 12-digit identifier', /(?<!\d)\d{12}(?!\d)/],
  ['a grouped 12-digit identifier', /(?<!\d)\d{4}[ -]\d{4}[ -]\d{4}(?!\d)/],
  ['a 10-digit mobile number', /(?<!\d)[6-9]\d{9}(?!\d)/],
  ['an e-mail address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['a mailto: or tel: link', /\b(?:mailto|tel):/i],
]);

/**
 * Leading characters spreadsheet programs treat as a formula. exports/*.csv is public, and RFC
 * 4180 quoting does not neutralise them, so data strings may not start with one.
 */
const FORMULA_START_RE = /^[=+\-@\t\r]/;

/** Item counts fixed by docs/architecture.md that pack.counts does not cover. */
export const EXPECTED_COUNTS = Object.freeze({
  commitments: 7,
  'participation-routes': 3,
  'refusal-responses': 7,
  'contribution-types': 8,
  'process-targets': 7,
});

/** Frontmatter keys tools/import-pack.py writes into every content/pack section. */
export const SECTION_FRONTMATTER_KEYS = [
  'title',
  'type',
  'project',
  'section',
  'slug',
  'tags',
  'source',
  'source_version',
  'created',
  'updated',
  'status',
];
export const SECTION_COUNT = 9;
export const PROJECT_ID = 'public-democratic-action';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISSUE_ID_RE = /^\d{3}$/;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** @param {unknown} v @returns {any[]} */
function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** @param {number} n @param {number} width */
function pad(n, width) {
  return String(n).padStart(width, '0');
}

/** RFC 6901 escaping for one reference token. @param {string} token */
export function escapePointer(token) {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Short JSON rendering of a value for messages. @param {unknown} v */
function describe(v) {
  if (v === undefined) return 'undefined';
  let s;
  try {
    s = JSON.stringify(v);
  } catch {
    s = String(v);
  }
  if (s === undefined) s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

/** Canonical JSON (sorted keys) for deep equality. @param {unknown} v @returns {unknown} */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (isPlainObject(v)) {
    /** @type {Record<string, unknown>} */ const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  return v;
}

/** @param {unknown} a @param {unknown} b */
export function deepEqual(a, b) {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** Strict ISO calendar date (YYYY-MM-DD, real date, UTC). @param {unknown} s */
export function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * The kind of personal contact data a string looks like, or null when it looks like none.
 * @param {string} text
 * @returns {string|null}
 */
export function personalDataKind(text) {
  for (const [kind, re] of PERSONAL_DATA_PATTERNS) if (re.test(text)) return kind;
  return null;
}

/**
 * Expand an agenda-links text such as "001–005, 022, 071–080" into zero-padded issue ids.
 * Mirrors expand_ids() in tools/import-pack.py. Accepts an en dash or a hyphen as the range mark.
 * @param {string} spec
 * @returns {{ ids: string[], error: string|null }}
 */
export function expandIdSpec(spec) {
  /** @type {string[]} */ const ids = [];
  if (typeof spec !== 'string') return { ids, error: `must be a string (got ${describe(spec)})` };
  const parts = spec.trim().replace(/\.$/, '').split(/,\s*/);
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const range = /^(\d{3})\s*[–-]\s*(\d{3})$/.exec(part);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a > b) return { ids, error: `range "${part}" runs backwards` };
      for (let i = a; i <= b; i += 1) ids.push(pad(i, 3));
    } else if (ISSUE_ID_RE.test(part)) {
      ids.push(part);
    } else {
      return { ids, error: `cannot parse id spec part "${part}" in "${spec}"` };
    }
  }
  if (ids.length === 0) return { ids, error: 'expands to no issue ids' };
  return { ids, error: null };
}

// ---------------------------------------------------------------------------
// JSON Schema subset checker
// ---------------------------------------------------------------------------

const ANNOTATION_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'examples',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly',
]);
const SUPPORTED_KEYWORDS = new Set([
  'type',
  'enum',
  'const',
  'required',
  'properties',
  'additionalProperties',
  'pattern',
  'minLength',
  'maxLength',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'oneOf',
  'anyOf',
]);

/** @type {Map<string, RegExp>} */
const regexCache = new Map();
/** @param {string} pattern */
function regexFor(pattern) {
  let re = regexCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern, 'u');
    regexCache.set(pattern, re);
  }
  return re;
}

/** @param {unknown} value @param {string} type */
function matchesType(value, type) {
  switch (type) {
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
    case 'boolean':
      return typeof value === type;
    default:
      return false;
  }
}

/**
 * Report schema keywords the built-in checker does not implement, so a schema never promises
 * more than the validator enforces. Returns messages prefixed with the schema pointer.
 * @param {unknown} schema
 * @param {string} [pointer]
 * @returns {string[]}
 */
export function lintSchema(schema, pointer = '') {
  /** @type {string[]} */ const out = [];
  const here = pointer || '/';
  if (!isPlainObject(schema)) {
    out.push(`${here}: schema must be an object (got ${describe(schema)})`);
    return out;
  }
  for (const key of Object.keys(schema)) {
    if (ANNOTATION_KEYWORDS.has(key) || SUPPORTED_KEYWORDS.has(key)) continue;
    out.push(`${here}: unsupported keyword "${key}" (the built-in checker would ignore it)`);
  }
  if ('properties' in schema) {
    if (!isPlainObject(schema.properties)) out.push(`${pointer}/properties: must be an object`);
    else for (const [k, sub] of Object.entries(schema.properties)) out.push(...lintSchema(sub, `${pointer}/properties/${escapePointer(k)}`));
  }
  if ('additionalProperties' in schema && typeof schema.additionalProperties !== 'boolean') {
    if (isPlainObject(schema.additionalProperties)) out.push(...lintSchema(schema.additionalProperties, `${pointer}/additionalProperties`));
    else out.push(`${pointer}/additionalProperties: must be a boolean or a schema`);
  }
  if ('items' in schema) {
    if (isPlainObject(schema.items)) out.push(...lintSchema(schema.items, `${pointer}/items`));
    else out.push(`${pointer}/items: must be a schema object (boolean or tuple forms are not supported)`);
  }
  for (const kw of ['oneOf', 'anyOf']) {
    if (!(kw in schema)) continue;
    if (!Array.isArray(schema[kw]) || schema[kw].length === 0) out.push(`${pointer}/${kw}: must be a non-empty array of schemas`);
    else schema[kw].forEach((sub, i) => out.push(...lintSchema(sub, `${pointer}/${kw}/${i}`)));
  }
  if ('type' in schema) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    for (const t of types) {
      if (!['null', 'boolean', 'object', 'array', 'number', 'integer', 'string'].includes(t)) out.push(`${pointer}/type: unknown type ${describe(t)}`);
    }
  }
  // Malformed values of supported keywords would silently disable a check (required, uniqueItems,
  // minItems) or fail every value (enum), so their shapes are checked too.
  if ('required' in schema && !(Array.isArray(schema.required) && schema.required.every((k) => typeof k === 'string'))) {
    out.push(`${pointer}/required: must be an array of property names (got ${describe(schema.required)})`);
  }
  if ('enum' in schema && !(Array.isArray(schema.enum) && schema.enum.length > 0)) out.push(`${pointer}/enum: must be a non-empty array (got ${describe(schema.enum)})`);
  if ('uniqueItems' in schema && typeof schema.uniqueItems !== 'boolean') out.push(`${pointer}/uniqueItems: must be a boolean (got ${describe(schema.uniqueItems)})`);
  for (const kw of ['minItems', 'maxItems', 'minLength', 'maxLength']) {
    if (kw in schema && !(Number.isInteger(schema[kw]) && schema[kw] >= 0)) out.push(`${pointer}/${kw}: must be a non-negative integer (got ${describe(schema[kw])})`);
  }
  for (const kw of ['minimum', 'maximum']) {
    if (kw in schema && !(typeof schema[kw] === 'number' && Number.isFinite(schema[kw]))) out.push(`${pointer}/${kw}: must be a finite number (got ${describe(schema[kw])})`);
  }
  if ('pattern' in schema) {
    if (typeof schema.pattern !== 'string') out.push(`${pointer}/pattern: must be a string (got ${describe(schema.pattern)})`);
    else {
      try {
        regexFor(schema.pattern);
      } catch (e) {
        out.push(`${pointer}/pattern: invalid regular expression (${/** @type {Error} */ (e).message})`);
      }
    }
  }
  return out;
}

/**
 * Check a value against a schema (the subset above). Returns one problem per violation, each
 * with an RFC 6901 JSON pointer into the value ("/" for the root).
 * @param {Schema} schema
 * @param {unknown} value
 * @param {string} [pointer]  pointer of `value` inside the document being checked
 * @returns {SchemaProblem[]}
 */
export function checkSchema(schema, value, pointer = '') {
  /** @type {SchemaProblem[]} */ const problems = [];
  /** @param {string} message @param {string} [at] */
  const fail = (message, at = pointer) => problems.push({ path: at || '/', message });

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      fail(`must be ${types.join(' or ')} (got ${describe(value)})`);
      return problems; // further keyword checks would only cascade
    }
  }
  if (schema.enum !== undefined && !asArray(schema.enum).some((e) => deepEqual(e, value))) {
    fail(`must be one of ${asArray(schema.enum).map((e) => describe(e)).join(', ')} (got ${describe(value)})`);
  }
  if (schema.const !== undefined && !deepEqual(schema.const, value)) {
    fail(`must be equal to ${describe(schema.const)} (got ${describe(value)})`);
  }

  if (typeof value === 'string') {
    if (schema.pattern !== undefined && !regexFor(String(schema.pattern)).test(value)) {
      fail(`must match pattern ${schema.pattern} (got ${describe(value)})`);
    }
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) fail(`must be at least ${schema.minLength} character(s) long (got ${length})`);
    if (schema.maxLength !== undefined && length > schema.maxLength) fail(`must be at most ${schema.maxLength} character(s) long (got ${length})`);
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be >= ${schema.minimum} (got ${value})`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be <= ${schema.maximum} (got ${value})`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`must have at least ${schema.minItems} item(s) (got ${value.length})`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`must have at most ${schema.maxItems} item(s) (got ${value.length})`);
    if (schema.uniqueItems === true) {
      /** @type {Map<string, number>} */ const seen = new Map();
      value.forEach((item, i) => {
        const key = JSON.stringify(canon(item));
        const first = seen.get(key);
        if (first !== undefined) fail(`duplicate item ${describe(item)} (same as index ${first})`, `${pointer}/${i}`);
        else seen.set(key, i);
      });
    }
    if (isPlainObject(schema.items)) {
      value.forEach((item, i) => problems.push(...checkSchema(schema.items, item, `${pointer}/${i}`)));
    }
  }

  if (isPlainObject(value)) {
    for (const key of asArray(schema.required)) {
      if (!Object.hasOwn(value, key)) fail(`must have required property "${key}"`);
    }
    const props = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [key, sub] of Object.entries(props)) {
      if (Object.hasOwn(value, key)) problems.push(...checkSchema(sub, value[key], `${pointer}/${escapePointer(key)}`));
    }
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
      for (const key of Object.keys(value)) {
        if (Object.hasOwn(props, key)) continue;
        const at = `${pointer}/${escapePointer(key)}`;
        if (schema.additionalProperties === false) fail(`must not have additional property "${key}"`, at);
        else if (isPlainObject(schema.additionalProperties)) problems.push(...checkSchema(schema.additionalProperties, value[key], at));
      }
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const matched = schema.oneOf.filter((sub) => checkSchema(sub, value, pointer).length === 0).length;
    if (matched !== 1) fail(`must match exactly one of ${schema.oneOf.length} subschemas (matched ${matched})`);
  }
  if (Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some((sub) => checkSchema(sub, value, pointer).length === 0);
    if (!matched) fail(`must match at least one of ${schema.anyOf.length} subschemas (matched none)`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Frontmatter (the small YAML subset the importer writes)
// ---------------------------------------------------------------------------

/**
 * Parse one frontmatter value. Returns an error instead of a guess for input outside the subset
 * the importer writes, so a section is reported rather than silently accepted with wrong values.
 * @param {string} raw
 * @returns {{ value?: any, error?: string }}
 */
function parseScalar(raw) {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return { value: s.slice(1, -1).replace(/\\"/g, '"') };
  if (s.startsWith('[') && s.endsWith(']')) {
    if (s.includes('"') || s.includes("'")) return { error: 'inline lists may not contain quoted items (the importer writes bare items such as [type/pack-section, from/google-doc])' };
    return {
      value: s
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    };
  }
  if (/^-?\d+$/.test(s)) return { value: Number(s) };
  return { value: s };
}

/**
 * Parse a markdown file with a `---` frontmatter block of `key: value` lines. Values may be a
 * double-quoted string, an inline list `[a, b]`, an integer or a bare string (dates stay strings).
 * @param {string} text
 * @returns {{ frontmatter: Record<string, any>, body: string, error: string|null }}
 */
export function parseFrontmatter(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0] !== '---') return { frontmatter: {}, body: text, error: 'missing frontmatter: the file must start with a "---" line' };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { frontmatter: {}, body: '', error: 'unterminated frontmatter: no closing "---" line' };
  /** @type {Record<string, any>} */ const frontmatter = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (!m) return { frontmatter, body: '', error: `frontmatter line ${i + 1} is not "key: value" (${describe(line)})` };
    if (Object.hasOwn(frontmatter, m[1])) return { frontmatter, body: '', error: `frontmatter key "${m[1]}" appears twice` };
    const scalar = m[2] === undefined ? { value: '' } : parseScalar(m[2]);
    if (scalar.error !== undefined) return { frontmatter, body: '', error: `frontmatter key "${m[1]}": ${scalar.error}` };
    frontmatter[m[1]] = scalar.value;
  }
  return { frontmatter, body: lines.slice(end + 1).join('\n'), error: null };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Decode a file as UTF-8, rejecting malformed byte sequences (a legitimate U+FFFD in the text is
 * accepted). A leading BOM is dropped by the decoder; callers that forbid it check the bytes first.
 * @param {Buffer} buf
 * @returns {{ text?: string, error?: string }}
 */
function decodeUtf8(buf) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf) };
  } catch (e) {
    return { error: `file is not valid UTF-8 (${/** @type {Error} */ (e).message})` };
  }
}

/**
 * Read a JSON file strictly: no BOM, valid UTF-8, parseable.
 * @param {string} absPath
 * @returns {{ value?: any, error?: string }}
 */
function readJsonStrict(absPath) {
  if (!existsSync(absPath)) return { error: 'file is missing' };
  const buf = readFileSync(absPath);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { error: 'file starts with a UTF-8 BOM; data files must be UTF-8 without BOM' };
  const decoded = decodeUtf8(buf);
  if (decoded.error !== undefined) return { error: decoded.error };
  const text = /** @type {string} */ (decoded.text);
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    return { error: `invalid JSON: ${/** @type {Error} */ (e).message}` };
  }
}

/** @param {string} p */
function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Load data/, schema/ and content/pack/ from a repository root. Never throws on bad content;
 * load-time problems are collected in `problems`.
 * @param {string} [root]
 * @returns {Loaded}
 */
export function loadRepo(root = DEFAULT_ROOT) {
  /** @type {Problem[]} */ const problems = [];
  /** @type {Record<string, any>} */ const data = {};
  /** @type {Record<string, Schema>} */ const schemas = {};
  /** @type {Section[]} */ const sections = [];

  const dataDir = path.join(root, 'data');
  if (!existsSync(dataDir)) problems.push({ file: 'data', path: '/', message: 'directory is missing' });
  for (const f of existsSync(dataDir) ? readdirSync(dataDir).sort() : []) {
    if (!f.endsWith('.json')) continue;
    const name = f.slice(0, -'.json'.length);
    if (!DATA_FILES.includes(name)) {
      problems.push({ file: `data/${f}`, path: '/', message: 'unexpected data file: add it to docs/architecture.md, schema/ and scripts/validate.mjs, or remove it' });
    }
  }
  for (const name of DATA_FILES) {
    const rel = `data/${name}.json`;
    const r = readJsonStrict(path.join(root, rel));
    if (r.error) problems.push({ file: rel, path: '/', message: r.error });
    else data[name] = r.value;
  }

  const schemaDir = path.join(root, 'schema');
  if (!existsSync(schemaDir)) problems.push({ file: 'schema', path: '/', message: 'directory is missing' });
  for (const f of existsSync(schemaDir) ? readdirSync(schemaDir).sort() : []) {
    if (!f.endsWith('.schema.json')) continue;
    const name = f.slice(0, -'.schema.json'.length);
    if (!DATA_FILES.includes(name)) problems.push({ file: `schema/${f}`, path: '/', message: 'schema has no matching data file in data/' });
  }
  for (const name of DATA_FILES) {
    const rel = `schema/${name}.schema.json`;
    const r = readJsonStrict(path.join(root, rel));
    if (r.error) problems.push({ file: rel, path: '/', message: r.error });
    else schemas[name] = r.value;
  }

  const packDir = path.join(root, 'content', 'pack');
  if (!existsSync(packDir)) {
    problems.push({ file: 'content/pack', path: '/', message: 'directory is missing' });
  } else {
    for (const f of readdirSync(packDir).sort()) {
      if (!f.endsWith('.md')) continue;
      const rel = toPosix(path.join('content', 'pack', f));
      const decoded = decodeUtf8(readFileSync(path.join(packDir, f)));
      if (decoded.error !== undefined) {
        sections.push({ file: rel, name: f, frontmatter: {}, body: '', error: decoded.error, errorPath: '/' });
        continue;
      }
      const parsed = parseFrontmatter(/** @type {string} */ (decoded.text));
      sections.push({ file: rel, name: f, frontmatter: parsed.frontmatter, body: parsed.body, error: parsed.error });
    }
  }
  return { root, data, schemas, sections, problems };
}

// ---------------------------------------------------------------------------
// Schema layer
// ---------------------------------------------------------------------------

/**
 * Check every loaded data file against its schema, and every schema against the checker's
 * supported subset and the repository's $id / dialect conventions.
 * @param {Loaded} loaded
 * @returns {Problem[]}
 */
export function checkDataAgainstSchemas(loaded) {
  /** @type {Problem[]} */ const problems = [];
  for (const name of DATA_FILES) {
    const schema = loaded.schemas[name];
    const schemaFile = `schema/${name}.schema.json`;
    if (schema === undefined) continue; // reported at load time
    if (!isPlainObject(schema)) {
      problems.push({ file: schemaFile, path: '/', message: `schema must be an object (got ${describe(schema)})` });
      continue;
    }
    if (schema.$schema !== JSON_SCHEMA_DIALECT) problems.push({ file: schemaFile, path: '/$schema', message: `must be "${JSON_SCHEMA_DIALECT}"` });
    const expectedId = `${SCHEMA_ID_BASE}${name}.schema.json`;
    if (schema.$id !== expectedId) problems.push({ file: schemaFile, path: '/$id', message: `must be "${expectedId}"` });
    for (const key of ['title', 'description']) {
      if (typeof schema[key] !== 'string' || !schema[key].trim()) problems.push({ file: schemaFile, path: `/${key}`, message: 'must be a non-empty string' });
    }
    for (const msg of lintSchema(schema)) {
      const idx = msg.indexOf(': ');
      problems.push({ file: schemaFile, path: msg.slice(0, idx), message: msg.slice(idx + 2) });
    }
    if (!Object.hasOwn(loaded.data, name)) continue; // reported at load time
    for (const p of checkSchema(schema, loaded.data[name])) problems.push({ file: `data/${name}.json`, ...p });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Cross-reference layer
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Stats
 * @property {number} dataFiles
 * @property {number} schemas
 * @property {number} issues
 * @property {number} domains
 * @property {number} routes
 * @property {number} organisations
 * @property {number} agendaLinks
 * @property {number} sources
 * @property {number} processTargets
 * @property {number} sections
 * @property {number} urls
 */

/** @param {string} key */
function isUrlKey(key) {
  return /url$/i.test(key) || key === 'sourceDocument' || key === 'source';
}
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
/** Links embedded in prose (data strings and section bodies), e.g. "<https://example.org/>". */
const EMBEDDED_URL_RE = /\bhttps?:\/\/[^\s<>()]+/gi;

/**
 * Apply the cross-reference rules of docs/architecture.md, Module 1, to loaded data.
 * Tolerates malformed input (the schema layer reports shape errors); every rule is skipped when
 * its inputs are not of the expected shape.
 * @param {Loaded} loaded
 * @returns {{ problems: Problem[], stats: Stats }}
 */
export function crossCheck(loaded) {
  /** @type {Problem[]} */ const problems = [];
  /** @param {string} file @param {string} ptr @param {string} message */
  const push = (file, ptr, message) => problems.push({ file, path: ptr || '/', message });
  /** @type {Stats} */
  const stats = {
    dataFiles: Object.keys(loaded.data).length,
    schemas: Object.keys(loaded.schemas).length,
    issues: 0,
    domains: 0,
    routes: 0,
    organisations: 0,
    agendaLinks: 0,
    sources: 0,
    processTargets: 0,
    sections: 0,
    urls: 0,
  };
  const { data, sections } = loaded;

  /** @param {string} file @param {string} ptr @param {unknown} value */
  const checkUrl = (file, ptr, value) => {
    stats.urls += 1;
    if (typeof value !== 'string') return;
    if (!value.startsWith('https://')) {
      push(file, ptr, `must be an https:// URL (got ${describe(value)})`);
      return;
    }
    let url;
    try {
      url = new URL(value);
    } catch {
      push(file, ptr, `is not a parseable URL (got ${describe(value)})`);
      return;
    }
    if (!url.hostname) push(file, ptr, `URL has no host (got ${describe(value)})`);
  };

  // --- issues ---------------------------------------------------------------
  const issues = asArray(data.issues).filter(isPlainObject);
  const issueIds = new Set(issues.map((it) => it.id).filter((id) => typeof id === 'string'));
  const domains = asArray(data.domains).filter(isPlainObject);
  const domainsById = new Map(domains.filter((d) => typeof d.id === 'string').map((d) => [d.id, d]));
  const routeItems = isPlainObject(data.routes) ? asArray(data.routes.items).filter(isPlainObject) : [];
  const validRouteCodes = new Set(ROUTE_CODES);
  /** Two zero-padded issue ids. @param {unknown} range @returns {range is [string, string]} */
  const isRange = (range) => Array.isArray(range) && range.length === 2 && range.every((x) => typeof x === 'string' && ISSUE_ID_RE.test(x));
  /** A well-formed range that also runs forwards; a backwards range is reported once, at the domain. @param {unknown} range */
  const isUsableRange = (range) => isRange(range) && Number(range[0]) <= Number(range[1]);

  if (Array.isArray(data.issues)) {
    const F = 'data/issues.json';
    stats.issues = issues.length;
    if (issues.length !== 100) push(F, '/', `must contain exactly 100 issue families (got ${issues.length})`);
    /** @type {Map<string, number>} */ const slugSeen = new Map();
    /** @type {Map<string, number>} */ const idSeen = new Map();
    issues.forEach((it, i) => {
      const expectedId = pad(i + 1, 3);
      if (it.id !== expectedId) push(F, `/${i}/id`, `must be "${expectedId}" (ids run 001..100 in order; got ${describe(it.id)})`);
      if (typeof it.id === 'string') {
        if (idSeen.has(it.id)) push(F, `/${i}/id`, `duplicate id "${it.id}" (also at index ${idSeen.get(it.id)})`);
        else idSeen.set(it.id, i);
      }
      if (typeof it.slug === 'string') {
        if (slugSeen.has(it.slug)) push(F, `/${i}/slug`, `duplicate slug "${it.slug}" (also used by issue ${issues[/** @type {number} */ (slugSeen.get(it.slug))].id})`);
        else slugSeen.set(it.slug, i);
      }
      if (typeof it.domainId === 'string') {
        const d = domainsById.get(it.domainId);
        if (!d) {
          if (domains.length) push(F, `/${i}/domainId`, `unknown domain "${it.domainId}"`);
        } else if (isUsableRange(d.range) && typeof it.id === 'string' && ISSUE_ID_RE.test(it.id)) {
          const n = Number(it.id);
          if (n < Number(d.range[0]) || n > Number(d.range[1])) {
            push(F, `/${i}/domainId`, `issue ${it.id} is outside the range ${d.range[0]}–${d.range[1]} of domain ${it.domainId}`);
          }
        }
      }
      if (Array.isArray(it.challengeRoutes)) {
        if (it.challengeRoutes.length === 0) push(F, `/${i}/challengeRoutes`, 'must name at least one challenge route');
        /** @type {Set<string>} */ const seen = new Set();
        it.challengeRoutes.forEach((code, j) => {
          if (!validRouteCodes.has(code)) push(F, `/${i}/challengeRoutes/${j}`, `unknown route code ${describe(code)} (valid: ${ROUTE_CODES.join(', ')})`);
          else if (seen.has(code)) push(F, `/${i}/challengeRoutes/${j}`, `duplicate route code "${code}"`);
          seen.add(code);
        });
      }
    });
  }

  // --- domains --------------------------------------------------------------
  if (Array.isArray(data.domains)) {
    const F = 'data/domains.json';
    stats.domains = domains.length;
    /** @type {Map<string, number>} */ const slugSeen = new Map();
    /** @type {Map<string, number>} */ const covered = new Map();
    domains.forEach((d, i) => {
      const expectedId = `d${pad(i + 1, 2)}`;
      if (d.id !== expectedId) push(F, `/${i}/id`, `must be "${expectedId}" (domain ids run d01..d10 in order; got ${describe(d.id)})`);
      if (typeof d.slug === 'string') {
        if (slugSeen.has(d.slug)) push(F, `/${i}/slug`, `duplicate slug "${d.slug}" (also at index ${slugSeen.get(d.slug)})`);
        else slugSeen.set(d.slug, i);
      }
      const range = isRange(d.range) ? d.range : null;
      let rangeOk = range !== null;
      if (range && !isUsableRange(range)) {
        push(F, `/${i}/range`, `range ${range[0]}–${range[1]} runs backwards`);
        rangeOk = false; // the issueIds comparison and per-issue membership would only repeat this defect
      }
      if (range && rangeOk && Array.isArray(d.issueIds)) {
        const expected = expandIdSpec(`${range[0]}–${range[1]}`).ids;
        if (!deepEqual(expected, d.issueIds)) push(F, `/${i}/issueIds`, `must list exactly the ids ${range[0]}–${range[1]} in order (got ${describe(d.issueIds)})`);
        if (issues.length) {
          const actual = issues.filter((it) => it.domainId === d.id).map((it) => it.id);
          if (!deepEqual(actual, d.issueIds)) push(F, `/${i}/issueIds`, `does not match the issues whose domainId is "${d.id}" (issues.json has ${describe(actual)})`);
        }
      }
      for (const id of asArray(d.issueIds)) {
        if (typeof id !== 'string') continue;
        if (covered.has(id)) push(F, `/${i}/issueIds`, `issue ${id} is also listed by domain at index ${covered.get(id)}`);
        else covered.set(id, i);
      }
    });
    if (domains.length) {
      const missing = [];
      for (let n = 1; n <= 100; n += 1) if (!covered.has(pad(n, 3))) missing.push(pad(n, 3));
      if (missing.length) push(F, '/', `domain ranges must partition 001–100; not covered: ${missing.join(', ')}`);
    }
  }

  // --- routes ---------------------------------------------------------------
  if (isPlainObject(data.routes) && Array.isArray(data.routes.items)) {
    const F = 'data/routes.json';
    stats.routes = routeItems.length;
    const codes = routeItems.map((r) => r.code);
    if (!deepEqual(codes, ROUTE_CODES)) push(F, '/items', `route codes must be exactly ${ROUTE_CODES.join(', ')} in that order (got ${describe(codes)})`);
    /** @type {Map<string, number>} */ const slugSeen = new Map();
    routeItems.forEach((r, i) => {
      if (typeof r.code === 'string' && Object.hasOwn(ROUTE_NAMES, r.code) && r.name !== ROUTE_NAMES[/** @type {keyof typeof ROUTE_NAMES} */ (r.code)]) {
        push(F, `/items/${i}/name`, `must be "${ROUTE_NAMES[/** @type {keyof typeof ROUTE_NAMES} */ (r.code)]}" for code ${r.code} (Appendix B; got ${describe(r.name)})`);
      }
      if (typeof r.slug === 'string') {
        if (slugSeen.has(r.slug)) push(F, `/items/${i}/slug`, `duplicate slug "${r.slug}" (also at index ${slugSeen.get(r.slug)})`);
        else slugSeen.set(r.slug, i);
      }
    });
  }

  // --- organisations --------------------------------------------------------
  if (isPlainObject(data.organisations) && Array.isArray(data.organisations.items)) {
    const F = 'data/organisations.json';
    const orgs = data.organisations.items.filter(isPlainObject);
    stats.organisations = orgs.length;
    /** @type {Map<string, number>} */ const slugSeen = new Map();
    /** @type {Map<string, number>} */ const nameSeen = new Map();
    orgs.forEach((o, i) => {
      if (o.number !== i + 1) push(F, `/items/${i}/number`, `must be ${i + 1} (organisations are numbered 1..N in order; got ${describe(o.number)})`);
      if (Number.isInteger(o.number)) {
        const expectedId = `org-${pad(o.number, 2)}`;
        if (o.id !== expectedId) push(F, `/items/${i}/id`, `must be "${expectedId}" for number ${o.number} (got ${describe(o.id)})`);
      }
      if (typeof o.slug === 'string') {
        if (slugSeen.has(o.slug)) push(F, `/items/${i}/slug`, `duplicate slug "${o.slug}" (also at index ${slugSeen.get(o.slug)})`);
        else slugSeen.set(o.slug, i);
      }
      if (typeof o.name === 'string') {
        if (nameSeen.has(o.name)) push(F, `/items/${i}/name`, `duplicate organisation name (also at index ${nameSeen.get(o.name)})`);
        else nameSeen.set(o.name, i);
      }
      if (Array.isArray(o.agendaIssueIds)) {
        stats.agendaLinks += o.agendaIssueIds.length;
        if (typeof o.agendaLinksText === 'string') {
          const expanded = expandIdSpec(o.agendaLinksText);
          if (expanded.error) push(F, `/items/${i}/agendaLinksText`, expanded.error);
          else if (!deepEqual(expanded.ids, o.agendaIssueIds)) {
            push(F, `/items/${i}/agendaIssueIds`, `must equal the expansion of agendaLinksText "${o.agendaLinksText}" = ${describe(expanded.ids)} (got ${describe(o.agendaIssueIds)})`);
          }
        }
        /** @type {Set<string>} */ const seen = new Set();
        o.agendaIssueIds.forEach((id, j) => {
          if (issueIds.size && !issueIds.has(id)) push(F, `/items/${i}/agendaIssueIds/${j}`, `unknown issue id ${describe(id)}`);
          if (seen.has(id)) push(F, `/items/${i}/agendaIssueIds/${j}`, `duplicate issue id ${describe(id)}`);
          seen.add(id);
        });
      }
    });
  }

  // --- sources --------------------------------------------------------------
  if (isPlainObject(data.sources) && Array.isArray(data.sources.items)) {
    const F = 'data/sources.json';
    const items = data.sources.items.filter(isPlainObject);
    stats.sources = items.length;
    items.forEach((s, i) => {
      if (s.number !== i + 1) push(F, `/items/${i}/number`, `must be ${i + 1} (sources are numbered 1..N in order; got ${describe(s.number)})`);
    });
  }

  // --- process targets ------------------------------------------------------
  if (isPlainObject(data['process-targets']) && Array.isArray(data['process-targets'].targets)) {
    const F = 'data/process-targets.json';
    const targets = data['process-targets'].targets.filter(isPlainObject);
    stats.processTargets = targets.length;
    const participationIds = isPlainObject(data['participation-routes'])
      ? asArray(data['participation-routes'].items).filter(isPlainObject).map((p) => p.id)
      : PARTICIPATION_ROUTE_IDS;
    const appliesToValues = new Set([...CHANNELS, ...participationIds]);
    // Unique target ids are checked with the other fixed lists below.
    targets.forEach((t, i) => {
      if (typeof t.from === 'string' && !['received', 'admitted'].includes(t.from)) push(F, `/targets/${i}/from`, `must be "received" or "admitted" (got ${describe(t.from)})`);
      if (typeof t.dayType === 'string' && !['calendar', 'working'].includes(t.dayType)) push(F, `/targets/${i}/dayType`, `must be "calendar" or "working" (got ${describe(t.dayType)})`);
      if (typeof t.stage === 'string' && typeof t.from === 'string') {
        const fromAdmission = STAGES_FROM_ADMISSION.includes(t.stage);
        const expectedFrom = fromAdmission ? 'admitted' : 'received';
        if (['received', 'admitted'].includes(t.from) && t.from !== expectedFrom) {
          const why = fromAdmission
            ? 'section 4: "hearing/decision normally within 60/90 days of admission"'
            : `the pack names no reference point for the ${t.stage} stage; counting it from receipt is this repository's reading (STAGES_FROM_ADMISSION in scripts/validate.mjs), not the pack's words`;
          push(F, `/targets/${i}/from`, `stage "${t.stage}" counts from "${expectedFrom}" (${why})`);
        }
      }
      asArray(t.appliesTo).forEach((v, j) => {
        if (!appliesToValues.has(v)) push(F, `/targets/${i}/appliesTo/${j}`, `must be a channel (${CHANNELS.join(', ')}) or a participation route id (${participationIds.join(', ')}); got ${describe(v)}`);
      });
    });
  }

  // --- participation routes and other fixed lists ----------------------------
  if (isPlainObject(data['participation-routes']) && Array.isArray(data['participation-routes'].items)) {
    const ids = data['participation-routes'].items.filter(isPlainObject).map((p) => p.id);
    if (!deepEqual(ids, PARTICIPATION_ROUTE_IDS)) push('data/participation-routes.json', '/items', `ids must be exactly ${PARTICIPATION_ROUTE_IDS.join(', ')} in that order (got ${describe(ids)})`);
  }
  for (const [name, listKey] of [
    ['commitments', 'items'],
    ['participation-routes', 'items'],
    ['refusal-responses', 'items'],
    ['contribution-types', 'items'],
    ['process-targets', 'targets'],
  ]) {
    const doc = data[name];
    if (!isPlainObject(doc) || !Array.isArray(doc[listKey])) continue;
    const expected = EXPECTED_COUNTS[/** @type {keyof typeof EXPECTED_COUNTS} */ (name)];
    if (doc[listKey].length !== expected) push(`data/${name}.json`, `/${listKey}`, `expected ${expected} items per docs/architecture.md data model (got ${doc[listKey].length})`);
    /** @type {Map<string, number>} */ const idSeen = new Map();
    doc[listKey].filter(isPlainObject).forEach((item, i) => {
      if (typeof item.id !== 'string') return;
      if (idSeen.has(item.id)) push(`data/${name}.json`, `/${listKey}/${i}/id`, `duplicate id "${item.id}" (also at index ${idSeen.get(item.id)})`);
      else idSeen.set(item.id, i);
    });
  }

  // --- pack -----------------------------------------------------------------
  const pack = isPlainObject(data.pack) ? data.pack : null;
  if (pack) {
    const F = 'data/pack.json';
    if (typeof pack.date === 'string' && !isIsoDate(pack.date)) push(F, '/date', `must be a real ISO date YYYY-MM-DD (got ${describe(pack.date)})`);
    if (typeof pack.disclaimer === 'string' && !pack.disclaimer.includes(PACK_DISCLAIMER_SENTENCE)) {
      push(F, '/disclaimer', `must keep the title-page sentence ${describe(PACK_DISCLAIMER_SENTENCE)} (got ${describe(pack.disclaimer)})`);
    }
    if (isPlainObject(pack.counts)) {
      /** @type {Record<string, { file: string, actual: number|null }>} */
      const actual = {
        issues: { file: 'issues', actual: Array.isArray(data.issues) ? data.issues.length : null },
        domains: { file: 'domains', actual: Array.isArray(data.domains) ? data.domains.length : null },
        routes: { file: 'routes', actual: isPlainObject(data.routes) && Array.isArray(data.routes.items) ? data.routes.items.length : null },
        organisations: { file: 'organisations', actual: isPlainObject(data.organisations) && Array.isArray(data.organisations.items) ? data.organisations.items.length : null },
        sources: { file: 'sources', actual: isPlainObject(data.sources) && Array.isArray(data.sources.items) ? data.sources.items.length : null },
      };
      for (const [key, { file, actual: n }] of Object.entries(actual)) {
        if (n === null || !Object.hasOwn(pack.counts, key)) continue;
        if (pack.counts[key] !== n) push(F, `/counts/${key}`, `is ${describe(pack.counts[key])} but data/${file}.json has ${n}`);
      }
    }
  }

  // --- every string in data/: URLs, personal contact data, export safety --------------------
  /** @param {string} file @param {string} ptr @param {string} text */
  const checkPersonalData = (file, ptr, text) => {
    const kind = personalDataKind(text);
    if (kind) push(file, ptr, `looks like personal contact data (${kind}); the pack includes only institutional public routes`);
  };
  /**
   * @param {string} file @param {unknown} value @param {string} ptr @param {string} key
   */
  const walk = (file, value, ptr, key) => {
    if (typeof value === 'string') {
      if (isUrlKey(key) || SCHEME_RE.test(value)) checkUrl(file, ptr, value);
      else for (const m of value.matchAll(EMBEDDED_URL_RE)) checkUrl(file, ptr, m[0]);
      checkPersonalData(file, ptr, value);
      if (FORMULA_START_RE.test(value)) push(file, ptr, 'must not start with a spreadsheet formula character (=, +, -, @, tab or CR): the public exports/*.csv would execute it');
      if (CSV_LIST_FIELDS.includes(key) && value.includes(CSV_LIST_SEPARATOR)) {
        push(file, ptr, `must not contain the CSV list separator ${describe(CSV_LIST_SEPARATOR)} (scripts/export-csv.mjs joins ${key} with it and the field could not be split back)`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(file, v, `${ptr}/${i}`, key));
    } else if (isPlainObject(value)) {
      for (const [k, v] of Object.entries(value)) walk(file, v, `${ptr}/${escapePointer(k)}`, k);
    }
  };
  for (const name of DATA_FILES) if (Object.hasOwn(data, name)) walk(`data/${name}.json`, data[name], '', '');

  // --- content/pack sections -------------------------------------------------
  stats.sections = sections.length;
  if (sections.length !== SECTION_COUNT) push('content/pack', '/', `expected ${SECTION_COUNT} section files (01-*.md .. 09-*.md), found ${sections.length}`);
  sections.forEach((s, i) => {
    const F = s.file;
    if (s.error) {
      push(F, s.errorPath ?? '/frontmatter', s.error);
      return;
    }
    const fm = s.frontmatter;
    for (const key of SECTION_FRONTMATTER_KEYS) {
      if (!Object.hasOwn(fm, key)) push(F, '/frontmatter', `must have frontmatter key "${key}"`);
      else if (fm[key] === '' || (Array.isArray(fm[key]) && fm[key].length === 0)) push(F, `/frontmatter/${key}`, 'must not be empty');
    }
    for (const key of Object.keys(fm)) {
      if (!SECTION_FRONTMATTER_KEYS.includes(key)) push(F, `/frontmatter/${key}`, `unexpected frontmatter key (allowed: ${SECTION_FRONTMATTER_KEYS.join(', ')})`);
    }
    const expectedSection = i + 1;
    if (fm.section !== expectedSection) push(F, '/frontmatter/section', `must be ${expectedSection} (sections run 1..${SECTION_COUNT} in file order; got ${describe(fm.section)})`);
    if (typeof fm.slug === 'string' && fm.slug && !SLUG_RE.test(fm.slug)) push(F, '/frontmatter/slug', `must be kebab-case (got ${describe(fm.slug)})`);
    if (Number.isInteger(fm.section) && typeof fm.slug === 'string' && fm.slug) {
      const expectedName = `${pad(fm.section, 2)}-${fm.slug}.md`;
      if (s.name !== expectedName) push(F, '/', `file name must be "${expectedName}" (NN-slug.md from the frontmatter section and slug)`);
    }
    if (Object.hasOwn(fm, 'type') && fm.type !== 'note') push(F, '/frontmatter/type', `must be "note" (got ${describe(fm.type)})`);
    if (Object.hasOwn(fm, 'project') && fm.project !== PROJECT_ID) push(F, '/frontmatter/project', `must be "${PROJECT_ID}" (got ${describe(fm.project)})`);
    if (Object.hasOwn(fm, 'tags') && !Array.isArray(fm.tags)) push(F, '/frontmatter/tags', `must be an inline list such as [type/pack-section, from/google-doc] (got ${describe(fm.tags)})`);
    if (Object.hasOwn(fm, 'source')) {
      checkUrl(F, '/frontmatter/source', fm.source);
      if (pack && typeof pack.sourceDocument === 'string' && fm.source !== pack.sourceDocument) push(F, '/frontmatter/source', `must equal pack.sourceDocument "${pack.sourceDocument}" (got ${describe(fm.source)})`);
    }
    if (Object.hasOwn(fm, 'source_version') && pack && typeof pack.version === 'string' && fm.source_version !== pack.version) {
      push(F, '/frontmatter/source_version', `must equal pack.version "${pack.version}" (got ${describe(fm.source_version)})`);
    }
    for (const key of ['created', 'updated']) {
      if (Object.hasOwn(fm, key) && !isIsoDate(fm[key])) push(F, `/frontmatter/${key}`, `must be a real ISO date YYYY-MM-DD (got ${describe(fm[key])})`);
    }
    if (isIsoDate(fm.created) && isIsoDate(fm.updated) && fm.updated < fm.created) push(F, '/frontmatter/updated', `must not be earlier than created (${fm.created})`);
    if (Object.hasOwn(fm, 'status') && typeof fm.status !== 'string') push(F, '/frontmatter/status', `must be a string (got ${describe(fm.status)})`);
    if (!s.body.trim()) push(F, '/body', 'must not be empty');
    for (const m of s.body.matchAll(EMBEDDED_URL_RE)) checkUrl(F, '/body', m[0]);
    checkPersonalData(F, '/body', s.body);
    const h1s = s.body.split('\n').filter((line) => /^# /.test(line));
    if (h1s.length !== 1) push(F, '/body', `must have exactly one level-1 heading (found ${h1s.length})`);
    else if (Number.isInteger(fm.section) && typeof fm.title === 'string') {
      const expectedH1 = `# ${fm.section}. ${fm.title}`;
      if (h1s[0] !== expectedH1) push(F, '/body', `level-1 heading must be ${describe(expectedH1)} (got ${describe(h1s[0])})`);
    }
  });

  // --- pack fidelity: data strings must occur verbatim in the section they come from --------
  // content/pack/*.md is the source of truth for prose (docs/architecture.md, principle 3). A hand
  // edit of data/ that contradicts the pack, such as upgrading an organisation's status to an
  // agreement the pack does not record, is reported here rather than silently exported.
  /** @type {Map<number, Section>} */ const sectionByNumber = new Map();
  for (const s of sections) {
    if (!s.error && Number.isInteger(s.frontmatter.section) && !sectionByNumber.has(s.frontmatter.section)) sectionByNumber.set(s.frontmatter.section, s);
  }
  /**
   * Require `prefix + value + suffix` to occur verbatim in the body of pack section `n`. Skipped
   * when that section is missing or unparsable (reported above) or the value is not a string
   * (reported by the schema layer).
   * @param {string} file @param {string} ptr @param {number} n @param {string} prefix @param {unknown} value @param {string} [suffix]
   */
  const requireInSection = (file, ptr, n, prefix, value, suffix = '') => {
    const s = sectionByNumber.get(n);
    if (!s || typeof value !== 'string') return;
    const line = `${prefix}${value}${suffix}`;
    if (!s.body.includes(line)) push(file, ptr, `differs from ${s.file}: the section body does not contain ${describe(line)}`);
  };
  /**
   * `- Name: description` bullets of sections 2, 5 and 6.
   * @param {string} file @param {number} n @param {any[]} items @param {string} nameKey @param {string} textKey
   */
  const requireBullets = (file, n, items, nameKey, textKey) => {
    items.filter(isPlainObject).forEach((item, i) => {
      if (typeof item[nameKey] === 'string') requireInSection(file, `/items/${i}`, n, `- ${item[nameKey]}: `, item[textKey]);
    });
  };

  if (isPlainObject(data.organisations)) {
    const F = 'data/organisations.json';
    requireInSection(F, '/selectionBasis', 7, '', data.organisations.selectionBasis);
    requireInSection(F, '/additionalNetworkLead', 7, '', data.organisations.additionalNetworkLead);
    asArray(data.organisations.items).filter(isPlainObject).forEach((o, i) => {
      const P = `/items/${i}`;
      if (Number.isInteger(o.number)) requireInSection(F, `${P}/name`, 7, `## ${pad(o.number, 2)}. `, o.name);
      requireInSection(F, `${P}/documentedRelevance`, 7, 'Documented relevance: ', o.documentedRelevance);
      requireInSection(F, `${P}/agendaLinksText`, 7, 'Agenda links: ', o.agendaLinksText, '.');
      requireInSection(F, `${P}/suggestedRemoteContribution`, 7, 'Suggested remote contribution: ', o.suggestedRemoteContribution);
      requireInSection(F, `${P}/status`, 7, 'Status: ', o.status);
      requireInSection(F, `${P}/officialEvidenceUrl`, 7, 'Official evidence: <', o.officialEvidenceUrl, '>');
      requireInSection(F, `${P}/publicRouteUrl`, 7, 'Public institutional route: <', o.publicRouteUrl, '>');
    });
  }
  if (isPlainObject(data.commitments)) {
    requireInSection('data/commitments.json', '/caveat', 2, '', data.commitments.caveat);
    requireBullets('data/commitments.json', 2, asArray(data.commitments.items), 'name', 'description');
  }
  if (isPlainObject(data['participation-routes'])) {
    const F = 'data/participation-routes.json';
    requireInSection(F, '/caveat', 3, '', data['participation-routes'].caveat);
    asArray(data['participation-routes'].items).filter(isPlainObject).forEach((p, i) => {
      requireInSection(F, `/items/${i}/name`, 3, '## ', p.name);
      requireInSection(F, `/items/${i}/text`, 3, '', p.text);
    });
  }
  if (isPlainObject(data['process-targets'])) {
    requireInSection('data/process-targets.json', '/sourceText', 4, '', data['process-targets'].sourceText);
    requireInSection('data/process-targets.json', '/caveat', 4, '', data['process-targets'].caveat);
  }
  if (isPlainObject(data['refusal-responses'])) {
    requireInSection('data/refusal-responses.json', '/caveat', 5, '', data['refusal-responses'].caveat);
    requireBullets('data/refusal-responses.json', 5, asArray(data['refusal-responses'].items), 'situation', 'response');
  }
  if (isPlainObject(data['contribution-types'])) {
    const F = 'data/contribution-types.json';
    requireBullets(F, 6, asArray(data['contribution-types'].items), 'name', 'description');
    if (isPlainObject(data['contribution-types'].form)) {
      const form = data['contribution-types'].form;
      if (Array.isArray(form.fields) && form.fields.every((f) => typeof f === 'string')) requireInSection(F, '/form/fields', 6, 'A simple contribution form: ', form.fields.join('; '), '.');
      requireInSection(F, '/form/caveat', 6, '', form.caveat);
    }
  }
  if (isPlainObject(data.routes) && typeof data.routes.caveat === 'string' && !data.routes.caveat.includes(ROUTES_CAVEAT_SENTENCE)) {
    push('data/routes.json', '/caveat', `must keep the Appendix B sentence ${describe(ROUTES_CAVEAT_SENTENCE)} (got ${describe(data.routes.caveat)})`);
  }

  return { problems, stats };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** @param {Problem} p */
export function formatProblem(p) {
  return `${p.file}: ${p.path || '/'}: ${p.message}`;
}

/** @param {Stats} s */
export function summarise(s) {
  return (
    `validate: OK. Checked ${s.dataFiles} data files against ${s.schemas} schemas; ` +
    `${s.issues} issue families in ${s.domains} domains, ${s.routes} challenge routes, ` +
    `${s.organisations} organisations with ${s.agendaLinks} agenda links, ${s.sources} sources, ` +
    `${s.processTargets} process targets, ${s.sections} pack sections, ${s.urls} https URLs.`
  );
}

/**
 * Run every check on a repository root.
 * @param {string} [root]
 * @returns {{ problems: Problem[], stats: Stats, summary: string }}
 */
export function validateRepo(root = DEFAULT_ROOT) {
  const loaded = loadRepo(root);
  const schemaProblems = checkDataAgainstSchemas(loaded);
  const { problems: crossProblems, stats } = crossCheck(loaded);
  const problems = [...loaded.problems, ...schemaProblems, ...crossProblems];
  return { problems, stats, summary: summarise(stats) };
}

/**
 * @param {string[]} argv
 * @returns {{ quiet: boolean, root: string, help: boolean, error: string|null }}
 */
export function parseArgs(argv) {
  const opts = { quiet: false, root: DEFAULT_ROOT, help: false, error: /** @type {string|null} */ (null) };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--root') {
      if (i + 1 >= argv.length) opts.error = '--root needs a directory';
      else opts.root = path.resolve(argv[(i += 1)]);
    } else if (a.startsWith('--root=')) opts.root = path.resolve(a.slice('--root='.length));
    else opts.error = `unknown argument "${a}"`;
  }
  return opts;
}

const USAGE = 'usage: node scripts/validate.mjs [--quiet] [--root <dir>]';

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    console.error(`validate: ${opts.error}\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  const { problems, summary } = validateRepo(opts.root);
  for (const p of problems) console.log(formatProblem(p));
  if (problems.length) {
    if (!opts.quiet) console.error(`validate: ${problems.length} problem${problems.length === 1 ? '' : 's'} found`);
    return 1;
  }
  if (!opts.quiet) console.log(summary);
  return 0;
}

/** True when this file is the script Node was asked to run (not when imported). */
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) process.exitCode = main(process.argv.slice(2));
