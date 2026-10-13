#!/usr/bin/env node
/**
 * Export the structured data of Public Voice Between Elections as CSV.
 *
 * Usage:
 *   node scripts/export-csv.mjs [--out <dir>] [--root <dir>] [--quiet]
 *
 * Writes three files (default directory exports/, created if missing; it is gitignored):
 *   issues.csv                    id,title,domain,raise,answer,possibleChange,evidence,challengeRoutes
 *   organisations.csv             one row per organisation of section 7, agendaIssueIds joined
 *   organisation-issue-links.csv  organisationId,organisationName,issueId,issueTitle
 *
 * Format: RFC 4180 quoting (fields containing a comma, double quote, CR or LF are quoted and
 * inner quotes doubled), UTF-8 without BOM, LF line endings, header row. List fields are
 * joined with " | ". `domain` is the domain name from data/domains.json; `challengeRoutes` holds
 * the route codes (A I R H J P V) as in the data.
 *
 * The exporter trusts data/ as validated by scripts/validate.mjs; when a reference does not
 * resolve or a list field is missing it collects every such problem and throws them together
 * rather than writing a misleading file (nothing is written). The validator, not the exporter,
 * keeps the files safe to open in a spreadsheet: it rejects data strings that start with a
 * formula character (equals, plus, minus, at sign, tab or CR) and list items that contain the
 * " | " separator, so the
 * exporter can stay faithful to the data. No dependencies.
 */

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Repository root, derived from this file's location so the script works from any cwd. */
export const DEFAULT_ROOT = path.resolve(HERE, '..');

/** Separator used to join list fields (raise, answer, evidence, challengeRoutes, agendaIssueIds). */
export const LIST_SEPARATOR = ' | ';

export const ISSUE_COLUMNS = ['id', 'title', 'domain', 'raise', 'answer', 'possibleChange', 'evidence', 'challengeRoutes'];
export const ORGANISATION_COLUMNS = [
  'id',
  'number',
  'name',
  'slug',
  'documentedRelevance',
  'agendaLinksText',
  'agendaIssueIds',
  'suggestedRemoteContribution',
  'status',
  'officialEvidenceUrl',
  'publicRouteUrl',
];
export const LINK_COLUMNS = ['organisationId', 'organisationName', 'issueId', 'issueTitle'];

/** @typedef {{ name: string, columns: string[], rows: (string|number)[][] }} CsvTable */

/**
 * Render one field per RFC 4180: quote when it contains a comma, a double quote, CR or LF, and
 * double any inner quotes. null/undefined become the empty field.
 * @param {unknown} value
 */
export function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Render a header plus rows as CSV text with LF line endings and a trailing LF.
 * @param {string[]} columns
 * @param {(string|number)[][]} rows
 */
export function toCsv(columns, rows) {
  rows.forEach((row, i) => {
    if (row.length !== columns.length) throw new Error(`row ${i} has ${row.length} fields, expected ${columns.length}`);
  });
  return [columns, ...rows].map((row) => row.map(csvField).join(',')).join('\n') + '\n';
}

/**
 * Join a list field. Throws when an item contains the separator, because the joined field could
 * not be split back into the same items.
 * @param {unknown[]} list
 */
export function joinList(list) {
  return list
    .map((item, i) => {
      const s = String(item);
      if (s.includes(LIST_SEPARATOR)) throw new Error(`list item ${i} contains the list separator ${JSON.stringify(LIST_SEPARATOR)} (${JSON.stringify(s)})`);
      return s;
    })
    .join(LIST_SEPARATOR);
}

/**
 * Join a list field while building a table, recording a problem (and yielding an empty field)
 * instead of throwing, so every problem of the table is reported together.
 * @param {unknown} value @param {string} where @param {string[]} problems
 */
function listField(value, where, problems) {
  if (!Array.isArray(value)) {
    problems.push(`${where}: must be a list (got ${JSON.stringify(value) ?? String(value)})`);
    return '';
  }
  try {
    return joinList(value);
  } catch (e) {
    problems.push(`${where}: ${/** @type {Error} */ (e).message}`);
    return '';
  }
}

/**
 * Throw once with every collected problem of a table, one per line.
 * @param {string} table @param {string[]} problems
 */
function throwIfProblems(table, problems) {
  if (problems.length === 0) return;
  throw new Error(`${table}: ${problems.length} problem${problems.length === 1 ? '' : 's'}, nothing written (run node scripts/validate.mjs)\n${problems.join('\n')}`);
}

/**
 * @param {any[]} issues   data/issues.json
 * @param {any[]} domains  data/domains.json
 * @returns {(string|number)[][]}
 */
export function issuesRows(issues, domains) {
  const domainById = new Map(domains.map((d) => [d.id, d]));
  /** @type {string[]} */ const problems = [];
  const rows = issues.map((it) => {
    const where = `issue ${it.id}`;
    const domain = domainById.get(it.domainId);
    if (!domain) problems.push(`${where}: unknown domainId ${JSON.stringify(it.domainId)}`);
    return [
      it.id,
      it.title,
      domain ? domain.name : '',
      listField(it.raise, `${where}: raise`, problems),
      listField(it.answer, `${where}: answer`, problems),
      it.possibleChange,
      listField(it.evidence, `${where}: evidence`, problems),
      listField(it.challengeRoutes, `${where}: challengeRoutes`, problems),
    ];
  });
  throwIfProblems('issues.csv', problems);
  return rows;
}

/**
 * @param {any[]} organisations  data/organisations.json items
 * @returns {(string|number)[][]}
 */
export function organisationsRows(organisations) {
  /** @type {string[]} */ const problems = [];
  const rows = organisations.map((o) => [
    o.id,
    o.number,
    o.name,
    o.slug,
    o.documentedRelevance,
    o.agendaLinksText,
    listField(o.agendaIssueIds, `organisation ${o.id}: agendaIssueIds`, problems),
    o.suggestedRemoteContribution,
    o.status,
    o.officialEvidenceUrl,
    o.publicRouteUrl,
  ]);
  throwIfProblems('organisations.csv', problems);
  return rows;
}

/**
 * One row per (organisation, agenda issue) pair, in organisation order then agenda order.
 * @param {any[]} organisations  data/organisations.json items
 * @param {any[]} issues         data/issues.json
 * @returns {(string|number)[][]}
 */
export function organisationIssueLinksRows(organisations, issues) {
  const issueById = new Map(issues.map((it) => [it.id, it]));
  /** @type {(string|number)[][]} */ const rows = [];
  /** @type {string[]} */ const problems = [];
  for (const o of organisations) {
    if (!Array.isArray(o.agendaIssueIds)) {
      problems.push(`organisation ${o.id}: agendaIssueIds must be a list (got ${JSON.stringify(o.agendaIssueIds) ?? String(o.agendaIssueIds)})`);
      continue;
    }
    for (const id of o.agendaIssueIds) {
      const issue = issueById.get(id);
      if (!issue) {
        problems.push(`organisation ${o.id}: agenda issue ${JSON.stringify(id)} does not exist`);
        continue;
      }
      rows.push([o.id, o.name, issue.id, issue.title]);
    }
  }
  throwIfProblems('organisation-issue-links.csv', problems);
  return rows;
}

/**
 * @param {string} root
 * @returns {{ issues: any[], domains: any[], organisations: any[] }}
 */
export function loadData(root = DEFAULT_ROOT) {
  /** @param {string} name */
  const read = (name) => JSON.parse(readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'));
  const issues = read('issues');
  const domains = read('domains');
  const organisations = read('organisations').items;
  if (!Array.isArray(issues) || !Array.isArray(domains) || !Array.isArray(organisations)) throw new Error('data files do not have the expected shape (run node scripts/validate.mjs)');
  return { issues, domains, organisations };
}

/**
 * Build the three tables without touching the file system.
 * @param {string} [root]
 * @returns {CsvTable[]}
 */
export function buildTables(root = DEFAULT_ROOT) {
  const { issues, domains, organisations } = loadData(root);
  return [
    { name: 'issues.csv', columns: ISSUE_COLUMNS, rows: issuesRows(issues, domains) },
    { name: 'organisations.csv', columns: ORGANISATION_COLUMNS, rows: organisationsRows(organisations) },
    { name: 'organisation-issue-links.csv', columns: LINK_COLUMNS, rows: organisationIssueLinksRows(organisations, issues) },
  ];
}

/**
 * Write the three CSV files. Creates the output directory when missing.
 * @param {{ root?: string, outDir?: string }} [options]
 * @returns {{ name: string, path: string, rows: number }[]}
 */
export function writeExports({ root = DEFAULT_ROOT, outDir = path.join(root, 'exports') } = {}) {
  const tables = buildTables(root);
  mkdirSync(outDir, { recursive: true });
  return tables.map((t) => {
    const file = path.join(outDir, t.name);
    writeFileSync(file, toCsv(t.columns, t.rows), 'utf8'); // utf8 writes no BOM
    return { name: t.name, path: file, rows: t.rows.length };
  });
}

/**
 * @param {string[]} argv
 * @returns {{ quiet: boolean, root: string, outDir: string|null, help: boolean, error: string|null }}
 */
export function parseArgs(argv) {
  const opts = { quiet: false, root: DEFAULT_ROOT, outDir: /** @type {string|null} */ (null), help: false, error: /** @type {string|null} */ (null) };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--root' || a === '--out') {
      if (i + 1 >= argv.length) opts.error = `${a} needs a directory`;
      else if (a === '--root') opts.root = path.resolve(argv[(i += 1)]);
      else opts.outDir = path.resolve(argv[(i += 1)]);
    } else if (a.startsWith('--root=')) opts.root = path.resolve(a.slice('--root='.length));
    else if (a.startsWith('--out=')) opts.outDir = path.resolve(a.slice('--out='.length));
    else opts.error = `unknown argument "${a}"`;
  }
  return opts;
}

const USAGE = 'usage: node scripts/export-csv.mjs [--out <dir>] [--root <dir>] [--quiet]';

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    console.error(`export-csv: ${opts.error}\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  try {
    const written = writeExports({ root: opts.root, outDir: opts.outDir ?? undefined });
    if (!opts.quiet) {
      for (const w of written) console.log(`export-csv: wrote ${path.relative(process.cwd(), w.path) || w.path} (${w.rows} rows)`);
    }
    return 0;
  } catch (e) {
    for (const line of String(/** @type {Error} */ (e).message).split('\n')) console.error(`export-csv: ${line}`);
    return 1;
  }
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
