#!/usr/bin/env node
/**
 * Build the accessible static site into `site/` (or `--out <dir>`).
 *
 *   node scripts/build-site.mjs [--out site] [--lang en] [--lang hi] [--base-url https://…/]
 *
 * The build is deterministic: the only date in the output is the pack date, and
 * every file is derived from data/, content/pack/, i18n/ and assets/. Each language
 * is a self-contained root (English at the top level, others under `<code>/`) so a
 * language root can be served or copied on its own. `sitemap.xml`, `robots.txt`
 * and `404.html` are written once, at the top level.
 *
 * Exports `build()` so tests can build into a temporary directory without spawning.
 * Validation problems (unknown language, keys missing from a translation, unsafe ids,
 * broken cross-references) are collected and thrown together as one Error whose
 * `problems` array lists each of them; `main()` prints one per line.
 *
 * @module scripts/build-site
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { escapeHtml, makeTranslator, relRootFor } from '../src/site/html.mjs';
import { DATA_FILES, loadSite, loadStrings, throwProblems } from '../src/site/load.mjs';
import { PAGE_RENDERERS, notFound } from '../src/site/pages/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (parent of scripts/). */
export const REPO_ROOT = path.resolve(here, '..');
/** Where GitHub Pages serves the project site; overridable with --base-url. */
export const DEFAULT_BASE_URL = 'https://mrunmaipatil47.github.io/public-democratic-action/';
/** Default output directory, relative to the repository root. */
export const DEFAULT_OUT = 'site';
/** Default language list. */
export const DEFAULT_LANGS = ['en'];
/** Files copied from assets/ into every language root's assets/. */
export const ASSET_FILES = ['styles.css', 'print.css', 'enhance.js'];

/**
 * @typedef {object} BuildOptions
 * @property {string} [out]       output directory (absolute, or relative to the current working directory)
 * @property {string[]} [langs]   language codes; `en` is written at the top level, others under `<code>/`
 * @property {string} [baseUrl]   absolute URL the site will be served from, for sitemap.xml and 404.html
 * @property {string} [root]      repository root (tests may point elsewhere)
 */

/**
 * @typedef {import('../src/site/html.mjs').LangInfo & { strings: Record<string, string> }} BuildLang
 */

/**
 * @typedef {object} BuildContext
 * @property {string} lang
 * @property {(key: string, params?: Record<string, string | number>) => string} t
 * @property {import('../src/site/html.mjs').LangInfo} langInfo
 * @property {import('../src/site/html.mjs').LangInfo[]} langs
 * @property {string} baseUrl
 * @property {import('../src/site/load.mjs').SiteData} site
 * @property {(pagePath: string, relRoot?: string) => import('../src/site/html.mjs').PageContext} forPage
 */

/**
 * @typedef {object} BuildResult
 * @property {string} out            absolute output directory
 * @property {string[]} files        every written file, relative to `out`, sorted
 * @property {string[]} pages        every HTML page listed in the sitemap, relative to `out`
 * @property {string[]} langs
 * @property {string} baseUrl
 * @property {number} durationMs
 */

/**
 * Ensure the base URL is absolute and ends with a slash.
 * @param {string} url
 * @returns {string}
 */
export function normaliseBaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`--base-url must be an absolute URL, got "${url}"`);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error(`--base-url must use http or https, got "${url}"`);
  const text = parsed.toString();
  return text.endsWith('/') ? text : `${text}/`;
}

/**
 * The search index: one entry per issue family with a text snippet.
 * @param {import('../src/site/load.mjs').SiteData} site
 * @returns {Array<{ id: string, title: string, domain: string, domainId: string, routes: string[], url: string, text: string }>}
 */
export function searchIndex(site) {
  return site.data.issues.map((issue) => {
    const domain = site.index.domainsById.get(issue.domainId);
    const text = [
      `Raise: ${issue.raise.join(', ')}.`,
      `Answer: ${issue.answer.join('; ')}.`,
      `Possible change: ${issue.possibleChange}.`,
      `Evidence: ${issue.evidence.join(', ')}.`,
    ].join(' ');
    return {
      id: issue.id,
      title: issue.title,
      domain: domain.name,
      domainId: issue.domainId,
      routes: [...issue.challengeRoutes],
      url: `issues/${issue.id}.html`,
      text,
    };
  });
}

/**
 * @param {string[]} pages page paths relative to the out dir
 * @param {string} baseUrl
 * @param {string} lastmod the pack date
 * @returns {string}
 */
export function sitemapXml(pages, baseUrl, lastmod) {
  const urls = [...pages]
    .sort()
    .map((page) => `  <url>\n    <loc>${escapeHtml(baseUrl + page)}</loc>\n    <lastmod>${escapeHtml(lastmod)}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * The output paths that would land outside `out` (`../x.html`, `/etc/passwd`). Ids and slugs are
 * validated in loadSite, so this is the last line of defence should a renderer ever build a path
 * from unchecked input.
 * @param {string} out absolute output directory
 * @param {string[]} relatives paths relative to `out`
 * @returns {string[]}
 */
export function escapingPaths(out, relatives) {
  const base = path.resolve(out);
  return relatives.filter((relative) => !path.resolve(base, relative).startsWith(base + path.sep));
}

/**
 * @param {string[]} codes
 * @returns {string[]}
 */
function uniqueLangs(codes) {
  /** @type {string[]} */
  const out = [];
  for (const raw of codes) {
    for (const code of String(raw).split(',')) {
      const trimmed = code.trim();
      if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    }
  }
  return out;
}

/**
 * Build the site.
 * @param {BuildOptions} [options]
 * @returns {BuildResult}
 */
export function build(options = {}) {
  const started = performance.now();
  const root = path.resolve(options.root || REPO_ROOT);
  const out = path.resolve(options.out || path.join(root, DEFAULT_OUT));
  if (out === root || root.startsWith(out + path.sep)) {
    throw new Error(`Refusing to build into ${out}: it contains the repository`);
  }
  const langs = uniqueLangs(options.langs && options.langs.length ? options.langs : DEFAULT_LANGS);
  const baseUrl = normaliseBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const site = loadSite(root);

  /** @type {string[]} */
  const problems = [];
  /** @type {BuildLang[]} */
  const buildLangs = [];
  for (const code of langs) {
    try {
      const { strings, meta } = loadStrings(root, code);
      // Every language must carry every key of en.json; a gap would otherwise reach the
      // output as unmarked English inside a page in another language.
      const missing = Object.keys(site.englishStrings).filter((key) => !(key in strings));
      if (missing.length) problems.push(`i18n/${code}.json is missing ${missing.length} key(s): ${missing.join(', ')}`);
      buildLangs.push({ code, name: meta.language, prefix: code === 'en' ? '' : `${code}/`, status: meta.status, strings });
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  throwProblems(problems, 'Cannot build the site');
  /** @type {import('../src/site/html.mjs').LangInfo[]} */
  const publicLangs = buildLangs.map(({ code, name, prefix, status }) => ({ code, name, prefix, status }));

  /** @type {Map<string, string | Buffer>} */
  const files = new Map();
  /** @type {string[]} */
  const pages = [];

  const assets = ASSET_FILES.map((name) => [name, fs.readFileSync(path.join(root, 'assets', name))]);
  const index = `${JSON.stringify(searchIndex(site), null, 2)}\n`;

  /** @type {BuildContext | null} */
  let firstContext = null;

  for (const lang of buildLangs) {
    const t = makeTranslator(lang.strings);
    const langInfo = publicLangs.find((info) => info.code === lang.code);
    /** @type {BuildContext} */
    const base = {
      lang: lang.code,
      t,
      langInfo,
      langs: publicLangs,
      baseUrl,
      site,
      forPage(pagePath, relRoot) {
        return { ...base, pagePath, relRoot: relRoot === undefined ? relRootFor(pagePath) : relRoot };
      },
    };
    if (!firstContext) firstContext = base;

    for (const renderer of PAGE_RENDERERS) {
      for (const page of renderer.render(base)) {
        const target = `${lang.prefix}${page.path}`;
        if (files.has(target)) throw new Error(`Two pages want to be written to ${target}`);
        files.set(target, page.html);
        pages.push(target);
      }
    }
    for (const [name, content] of assets) files.set(`${lang.prefix}assets/${name}`, content);
    for (const name of DATA_FILES) files.set(`${lang.prefix}data/${name}.json`, site.raw[`${name}.json`]);
    files.set(`${lang.prefix}search-index.json`, index);
  }

  files.set('404.html', notFound.render(/** @type {BuildContext} */ (firstContext))[0].html);
  files.set('sitemap.xml', sitemapXml(pages, baseUrl, site.data.pack.date));
  files.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${baseUrl}sitemap.xml\n`);

  const sorted = [...files.keys()].sort();
  const escaping = escapingPaths(out, sorted);
  throwProblems(
    escaping.map((relative) => `refusing to write "${relative}": it resolves outside ${out}`),
    'Cannot build the site',
  );
  for (const relative of sorted) {
    const target = path.join(out, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, files.get(relative));
  }

  return { out, files: sorted, pages: [...pages].sort(), langs, baseUrl, durationMs: performance.now() - started };
}

const USAGE = `Usage: node scripts/build-site.mjs [options]

  --out <dir>        output directory (default: site/)
  --lang <code>      language to build; repeatable (default: en). en is written at
                     the top level, other codes under <code>/
  --base-url <url>   absolute URL for sitemap.xml and 404.html
                     (default: ${DEFAULT_BASE_URL})
  --quiet            print nothing on success
  -h, --help         show this help
`;

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: 'string' },
      lang: { type: 'string', multiple: true },
      'base-url': { type: 'string' },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const result = build({ out: values.out, langs: values.lang, baseUrl: values['base-url'] });
  if (!values.quiet) {
    const where = path.relative(process.cwd(), result.out) || '.';
    process.stdout.write(
      `Built ${result.files.length} files (${result.pages.length} pages; languages: ${result.langs.join(', ')}) into ${where}/ in ${Math.round(result.durationMs)} ms\n`,
    );
  }
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    // Validation errors carry every problem found; print each on its own line.
    const problems = /** @type {any} */ (error)?.problems;
    if (Array.isArray(problems) && problems.length) {
      process.stderr.write(`build-site: ${problems.length} problem(s) found; nothing was written:\n`);
      for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    } else {
      process.stderr.write(`build-site: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    process.exit(1);
  }
}
