/**
 * Load `data/*.json`, `content/pack/*.md` and `i18n/*.json` into one object
 * with the cross-reference indexes the page renderers need.
 *
 * Validation here is the site generator's own guard (scripts/validate.mjs is the full
 * validator): ids and slugs that become file names or fragments must have a safe shape,
 * and every cross-reference must resolve. Problems are collected and thrown together
 * (`error.problems`), so one run reports every problem, not only the first.
 *
 * @module site/load
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './markdown.mjs';

/** Issue ids are three digits; they become `issues/<id>.html`. */
export const ISSUE_ID = /^\d{3}$/;
/** Slugs become `domains/<slug>.html` and file names; lower-case, digits and single hyphens only. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Domain and organisation ids become fragment ids and data attributes. */
export const SAFE_ID = /^[a-z][a-z0-9-]*$/;
/** Route codes are one capital letter (A I R H J P V). */
export const ROUTE_CODE = /^[A-Z]$/;

/**
 * Throw one Error that lists every collected problem, or return when there is none.
 * @param {string[]} problems
 * @param {string} summary
 */
export function throwProblems(problems, summary) {
  if (!problems.length) return;
  const error = new Error(`${summary}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  /** @type {any} */ (error).problems = [...problems];
  throw error;
}

/**
 * Return `value`, or throw when it is undefined or null. `loadSite` cross-checks every id
 * before any page is rendered, so a Map lookup can only come back empty through a programming
 * error; renderers write `must(map.get(id), label)` instead of threading `| undefined`
 * through every signature.
 * @template T
 * @param {T | undefined | null} value
 * @param {string} label what was looked up, for the error message
 * @returns {T}
 */
export function must(value, label) {
  if (value === undefined || value === null) throw new Error(`Missing ${label}`);
  return value;
}

/**
 * @typedef {object} Issue
 * @property {string} id
 * @property {string} slug
 * @property {string} title
 * @property {string} domainId
 * @property {string[]} raise
 * @property {string[]} answer
 * @property {string} possibleChange
 * @property {string[]} evidence
 * @property {string[]} challengeRoutes
 */

/**
 * @typedef {object} Domain
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {[string, string]} range
 * @property {string[]} issueIds
 */

/**
 * @typedef {object} Route
 * @property {string} code
 * @property {string} name
 * @property {string} slug
 * @property {string} description
 */

/**
 * @typedef {object} Organisation
 * @property {string} id
 * @property {number} number
 * @property {string} name
 * @property {string} slug
 * @property {string} documentedRelevance
 * @property {string} agendaLinksText
 * @property {string[]} agendaIssueIds
 * @property {string} suggestedRemoteContribution
 * @property {string} status
 * @property {string} officialEvidenceUrl
 * @property {string} publicRouteUrl
 */

/**
 * @typedef {object} PackSection
 * @property {string} file       file name inside content/pack/
 * @property {number} section    1..9
 * @property {string} title      frontmatter title
 * @property {string} slug       frontmatter slug
 * @property {string} text       whole file including frontmatter
 * @property {string} body       markdown body without frontmatter
 */

/**
 * @typedef {object} SiteData
 * @property {string} root
 * @property {Record<string, any>} data            parsed data files keyed by camelCase name
 * @property {Record<string, string>} raw          raw JSON text keyed by file name, for byte-for-byte copies
 * @property {PackSection[]} sections              sections 1..9 in order
 * @property {{ issuesById: Map<string, Issue>, domainsById: Map<string, Domain>, routesByCode: Map<string, Route>, orgsByIssueId: Map<string, Organisation[]>, issuePosition: Map<string, number> }} index
 * @property {Record<string, string>} englishStrings  en.json UI strings (fallback and the English half of the translation notice)
 */

/** Data files copied into site/data/ and loaded for rendering. */
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

/**
 * `process-targets` → `processTargets`.
 * @param {string} name
 * @returns {string}
 */
function camel(name) {
  return name.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
}

/**
 * Load one language's UI strings. Keys beginning with `_` are metadata.
 * @param {string} root repository root
 * @param {string} lang language code
 * @returns {{ strings: Record<string, string>, meta: { language: string, status: string, note: string } }}
 */
export function loadStrings(root, lang) {
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang)) {
    throw new Error(`Invalid language code "${lang}"`);
  }
  const file = path.join(root, 'i18n', `${lang}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No i18n file for language "${lang}" (expected ${file}); see i18n/README.md`);
  }
  /** @type {Record<string, string>} */
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  /** @type {Record<string, string>} */
  const strings = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('_')) continue;
    if (typeof value !== 'string') throw new Error(`${file}: "${key}" must be a string`);
    strings[key] = value;
  }
  return {
    strings,
    meta: {
      language: String(parsed._language || lang),
      status: String(parsed._status || 'unknown'),
      note: String(parsed._note || ''),
    },
  };
}

/**
 * Load everything the site generator needs from the repository.
 * @param {string} root repository root
 * @returns {SiteData}
 */
export function loadSite(root) {
  /** @type {Record<string, any>} */
  const data = {};
  /** @type {Record<string, string>} */
  const raw = {};
  for (const name of DATA_FILES) {
    const text = fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8');
    raw[`${name}.json`] = text;
    data[camel(name)] = JSON.parse(text);
  }

  const packDir = path.join(root, 'content', 'pack');
  /** @type {PackSection[]} */
  const sections = fs
    .readdirSync(packDir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = fs.readFileSync(path.join(packDir, file), 'utf8');
      const { frontmatter, body } = parseFrontmatter(text);
      const section = Number(frontmatter.section);
      return { file, section, title: String(frontmatter.title || ''), slug: String(frontmatter.slug || ''), text, body };
    })
    .sort((a, b) => a.section - b.section);
  throwProblems(
    sections.filter((s) => !Number.isInteger(s.section)).map((s) => `content/pack/${s.file}: frontmatter "section" must be an integer`),
    `Cannot build the site from ${packDir}`,
  );

  /** @type {Issue[]} */
  const issues = data.issues;
  /** @type {Domain[]} */
  const domains = data.domains;
  /** @type {Route[]} */
  const routes = data.routes.items;
  /** @type {Organisation[]} */
  const organisations = data.organisations.items;
  /** @type {string[]} */
  const problems = [];

  const issuesById = new Map(issues.map((issue) => [issue.id, issue]));
  const domainsById = new Map(domains.map((domain) => [domain.id, domain]));
  const routesByCode = new Map(routes.map((route) => [route.code, route]));
  const issuePosition = new Map(issues.map((issue, i) => [issue.id, i]));
  /** @type {Map<string, Organisation[]>} */
  const orgsByIssueId = new Map();

  for (const route of routes) {
    if (!ROUTE_CODE.test(String(route.code))) problems.push(`routes.json: route code "${route.code}" must be one capital letter`);
    if (!SLUG.test(String(route.slug))) problems.push(`routes.json: route ${route.code} has an unsafe slug "${route.slug}"`);
  }
  for (const org of organisations) {
    if (!SAFE_ID.test(String(org.id))) problems.push(`organisations.json: unsafe organisation id "${org.id}"`);
    if (!SLUG.test(String(org.slug))) problems.push(`organisations.json: ${org.id} has an unsafe slug "${org.slug}"`);
    for (const id of org.agendaIssueIds) {
      if (!issuesById.has(id)) {
        problems.push(`organisations.json: ${org.id} links unknown issue "${id}"`);
        continue;
      }
      const linked = orgsByIssueId.get(id);
      if (linked) linked.push(org);
      else orgsByIssueId.set(id, [org]);
    }
  }
  for (const domain of domains) {
    if (!SAFE_ID.test(String(domain.id))) problems.push(`domains.json: unsafe domain id "${domain.id}"`);
    if (!SLUG.test(String(domain.slug))) problems.push(`domains.json: ${domain.id} has an unsafe slug "${domain.slug}"`);
    for (const id of domain.issueIds) {
      if (!issuesById.has(id)) problems.push(`domains.json: ${domain.id} lists unknown issue "${id}"`);
    }
  }
  for (const issue of issues) {
    if (!ISSUE_ID.test(String(issue.id))) problems.push(`issues.json: unsafe issue id "${issue.id}" (expected three digits)`);
    if (!SLUG.test(String(issue.slug))) problems.push(`issues.json: ${issue.id} has an unsafe slug "${issue.slug}"`);
    if (!domainsById.has(issue.domainId)) problems.push(`issues.json: ${issue.id} has unknown domain "${issue.domainId}"`);
    for (const code of issue.challengeRoutes) {
      if (!routesByCode.has(code)) problems.push(`issues.json: ${issue.id} has unknown route "${code}"`);
    }
  }
  throwProblems(problems, `Cannot build the site from ${path.join(root, 'data')}`);

  const englishStrings = loadStrings(root, 'en').strings;

  return {
    root,
    data,
    raw,
    sections,
    index: { issuesById, domainsById, routesByCode, orgsByIssueId, issuePosition },
    englishStrings,
  };
}

/**
 * Find a pack section by its number.
 * @param {SiteData} site
 * @param {number} number
 * @returns {PackSection}
 */
export function sectionByNumber(site, number) {
  const section = site.sections.find((s) => s.section === number);
  if (!section) throw new Error(`content/pack: section ${number} is missing`);
  return section;
}
