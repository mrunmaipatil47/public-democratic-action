/**
 * Module 3 tests: the site builds into a temporary directory and every generated page
 * satisfies the accessibility and traceability rules in docs/architecture.md.
 */
// @ts-nocheck -- the assertions index Map.get() and String.match() results that the preceding
// assertions have already proved present; guarding each one would hide the test's intent.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { REPO_ROOT, build, escapingPaths, normaliseBaseUrl, searchIndex, sitemapXml } from '../scripts/build-site.mjs';
import { contentTypeFor, createServer, languageRoots, resolveWithinRoot } from '../scripts/serve.mjs';
import { STANDALONE_STYLE, en, langAttr, makeTranslator, relRootFor, safeUrl, table } from '../src/site/html.mjs';
import { loadSite, must, throwProblems } from '../src/site/load.mjs';
import { escapeHtml, isSafeUrl, markdownToHtml, parseFrontmatter, renderInline, slugify } from '../src/site/markdown.mjs';
import { APPENDIX_A_INTRO, APPENDIX_B_TITLE, FOUR_QUESTIONS, ORGANISATIONS_CAVEAT, PACK_STATUS, VALIDATION_QUOTE, packVersionLabel } from '../src/site/pages/shared.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pda-site-test-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const pack = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'pack.json'), 'utf8'));
const issues = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'issues.json'), 'utf8'));
const SOURCE_DOC = path.join(REPO_ROOT, 'content', 'source', 'public-voice-between-elections-v0.1.md');
const BASE = 'https://mrunmaipatil47.github.io/public-democratic-action/';
const DEVANAGARI = /[\u0900-\u097F]/;

/**
 * @param {string} dir
 * @returns {string[]} every file under dir, relative, sorted
 */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  (function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  })(dir);
  return out.sort();
}

/**
 * @param {string} dir
 * @returns {Map<string, string>} html pages by relative path
 */
function readPages(dir) {
  return new Map(walk(dir).filter((f) => f.endsWith('.html')).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
}

/**
 * @param {string} html
 * @returns {number[]} heading levels in document order
 */
function headingLevels(html) {
  return [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
}

const VOID_ELEMENTS = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'wbr']);

/**
 * Every non-blank text node of a generated page with the language it is announced in:
 * the nearest ancestor's `lang` attribute (the generator always closes its tags, so a
 * tag stack is enough). `marked` is true when that attribute sits below the <html>
 * element, i.e. the text was deliberately marked rather than inheriting the page language.
 * Text inside <title>, <style> and <script> is skipped.
 * @param {string} html
 * @returns {Array<{ text: string, lang: string | null, marked: boolean, path: string }>}
 */
function textNodes(html) {
  /** @type {Array<{ text: string, lang: string | null, marked: boolean, path: string }>} */
  const out = [];
  /** @type {Array<{ tag: string, lang: string | null, marked: boolean }>} */
  const stack = [];
  const current = () => (stack.length ? stack[stack.length - 1].lang : null);
  const marked = () => (stack.length ? stack[stack.length - 1].marked : false);
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/gi;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    const text = html.slice(last, m.index);
    const tags = stack.map((s) => s.tag);
    if (text.trim() && !tags.some((tag) => tag === 'title' || tag === 'style' || tag === 'script')) {
      out.push({ text, lang: current(), marked: marked(), path: tags.join('>') });
    }
    last = re.lastIndex;
    if (m[0].startsWith('<!')) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (VOID_ELEMENTS.has(tag) || m[3].trimEnd().endsWith('/')) continue;
    const lang = /\slang="([^"]*)"/.exec(m[3]);
    stack.push({ tag, lang: lang ? lang[1] : current(), marked: lang ? stack.length > 0 : marked() });
  }
  return out;
}

/**
 * WCAG 2.x relative luminance of a `#rrggbb` colour.
 * @param {string} hex
 * @returns {number}
 */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} contrast ratio, >= 1
 */
function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * `--name: #rrggbb` declarations in a CSS block.
 * @param {string} block
 * @returns {Record<string, string>}
 */
function parseTokens(block) {
  /** @type {Record<string, string>} */
  const tokens = {};
  for (const m of block.matchAll(/--([a-zA-Z][a-zA-Z0-9-]*):\s*(#[0-9a-fA-F]{6})\b/g)) tokens[m[1]] = m[2].toLowerCase();
  return tokens;
}

/**
 * The light and dark token sets of a stylesheet (dark overrides light).
 * @param {string} css
 * @returns {{ light: Record<string, string>, dark: Record<string, string> }}
 */
function themeTokens(css) {
  const light = parseTokens(/:root\s*\{([^}]*)\}/.exec(css)[1]);
  const dark = { ...light, ...parseTokens(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)[1]) };
  return { light, dark };
}

/**
 * Copy data/, content/pack/, i18n/ and assets/ into a fresh fixture root and let the caller
 * break something before the build sees it.
 * @param {string} name
 * @param {(fixture: { root: string, json: (rel: string) => any, write: (rel: string, value: unknown) => void, append: (rel: string, text: string) => void }) => void} edit
 * @returns {string} fixture root
 */
function makeFixture(name, edit) {
  const root = path.join(tmp, 'fixtures', name);
  for (const dir of ['data', 'content/pack', 'i18n', 'assets']) {
    fs.cpSync(path.join(REPO_ROOT, dir), path.join(root, dir), { recursive: true });
  }
  const json = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  const write = (rel, value) => fs.writeFileSync(path.join(root, rel), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  const append = (rel, text) => fs.appendFileSync(path.join(root, rel), text);
  edit({ root, json, write, append });
  return root;
}

describe('markdown converter', () => {
  test('headings h1–h4, paragraphs and bullet lists', () => {
    const md = '# Title\n\nFirst para\nsecond line.\n\n## Sub\n\n- one\n- two\n\n#### Deep\n\n##### not a heading';
    const { html } = markdownToHtml(md);
    assert.match(html, /^<h1>Title<\/h1>/);
    assert.match(html, /<p>First para\nsecond line\.<\/p>/);
    assert.match(html, /<h2>Sub<\/h2>/);
    assert.match(html, /<ul>\n {2}<li>one<\/li>\n {2}<li>two<\/li>\n<\/ul>/);
    assert.match(html, /<h4>Deep<\/h4>/);
    assert.match(html, /<p>##### not a heading<\/p>/);
    assert.doesNotMatch(html, /<h5/);
  });

  test('links, autolinks, bold and italics; backticks are literal text (the contract lists nothing else)', () => {
    assert.equal(renderInline('see [the pack](https://example.org/p?a=1&b=2)'), 'see <a href="https://example.org/p?a=1&amp;b=2">the pack</a>');
    assert.equal(renderInline('go <https://example.org/x?y=1&z=2> now'), 'go <a href="https://example.org/x?y=1&amp;z=2">https://example.org/x?y=1&amp;z=2</a> now');
    assert.equal(renderInline('**bold** and *italic*'), '<strong>bold</strong> and <em>italic</em>');
    assert.equal(renderInline('a * b and 2*3'), 'a * b and 2*3');
    assert.equal(renderInline('run `npm test` now'), 'run `npm test` now', 'no code spans');
    assert.equal(renderInline('wiki [a](https://en.wikipedia.org/wiki/Foo_(bar)) end'), 'wiki <a href="https://en.wikipedia.org/wiki/Foo_(bar)">a</a> end', 'balanced parentheses stay in the URL');
    assert.equal(renderInline('write to [us](mailto:someone@example.org)'), 'write to <a href="mailto:someone@example.org">us</a>');
  });

  test('emphasis markers inside a URL never reach the href or the link text; emphasis around and inside a link still works', () => {
    assert.equal(renderInline('see <https://example.org/a*b*c>'), 'see <a href="https://example.org/a*b*c">https://example.org/a*b*c</a>');
    assert.equal(renderInline('see [docs](https://example.org/x**y**z) now'), 'see <a href="https://example.org/x**y**z">docs</a> now');
    assert.equal(renderInline('*see [the docs](https://example.org/p*q) now*'), '<em>see <a href="https://example.org/p*q">the docs</a> now</em>');
    assert.equal(renderInline('[**bold** link](https://example.org/)'), '<a href="https://example.org/"><strong>bold</strong> link</a>');
    assert.equal(renderInline('a\0b <https://example.org/\0>'), 'ab <a href="https://example.org/">https://example.org/</a>', 'NUL is dropped, never confused with a parked link');
  });

  test('only http, https and mailto URLs become links; javascript:, data:, vbscript:, relative and protocol-relative stay literal', () => {
    for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,hi', 'vbscript:msgbox', '../x.html', '//evil.example/', 'ftp://x.example/', 'https://']) {
      assert.equal(isSafeUrl(url), false, url);
      const rendered = renderInline(`x [here](${url}) y`);
      assert.doesNotMatch(rendered, /<a\b/, `${url} rendered as a link: ${rendered}`);
      assert.equal(rendered, escapeHtml(`x [here](${url}) y`));
    }
    for (const url of ['https://a.example/', 'http://a.example/p?q=1', 'mailto:a@b.example', 'HTTPS://A.EXAMPLE/']) assert.equal(isSafeUrl(url), true, url);
    assert.equal(renderInline('<javascript:alert(1)>'), '&lt;javascript:alert(1)&gt;');
    const { html } = markdownToHtml('See [here](javascript:alert(1)) and [ok](https://example.org/ok).');
    assert.equal(html, '<p>See [here](javascript:alert(1)) and <a href="https://example.org/ok">ok</a>.</p>');
  });

  test('escapes HTML in text before applying inline syntax', () => {
    assert.equal(renderInline('<script>alert("x")</script> & **<b>**'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; <strong>&lt;b&gt;</strong>');
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    const { html } = markdownToHtml('<div>raw</div>\n\n- <li>x</li>');
    assert.equal(html, '<p>&lt;div&gt;raw&lt;/div&gt;</p>\n<ul>\n  <li>&lt;li&gt;x&lt;/li&gt;</li>\n</ul>');
  });

  test('frontmatter is stripped and parsed as a flat object', () => {
    const md = '---\ntitle: "Why this exists"\nsection: 3\ntags: [type/pack-section, from/google-doc]\nsource: https://docs.google.com/document/d/abc/\nempty: []\n---\n\n# Heading\n\nBody.';
    const { frontmatter, body } = parseFrontmatter(md);
    assert.deepEqual(frontmatter, {
      title: 'Why this exists',
      section: '3',
      tags: ['type/pack-section', 'from/google-doc'],
      source: 'https://docs.google.com/document/d/abc/',
      empty: [],
    });
    assert.equal(body, '# Heading\n\nBody.');
    const converted = markdownToHtml(md);
    assert.equal(converted.frontmatter.title, 'Why this exists');
    assert.equal(converted.html, '<h1>Heading</h1>\n<p>Body.</p>');
    assert.deepEqual(parseFrontmatter('no frontmatter').frontmatter, {});
    assert.equal(parseFrontmatter('---\nkey: value\n').body, '---\nkey: value\n', 'unterminated fence is body');
  });

  test('heading shift, ids and dropFirstHeading', () => {
    const md = '# 3. Three routes\n\n## Individual remedy\n\n## Individual remedy\n\ntext';
    const shifted = markdownToHtml(md, { headingShift: 1, idPrefix: 's3-' });
    assert.match(shifted.html, /<h2 id="s3-3-three-routes">3\. Three routes<\/h2>/);
    assert.match(shifted.html, /<h3 id="s3-individual-remedy">/);
    assert.match(shifted.html, /<h3 id="s3-individual-remedy-2">/, 'duplicate ids get a suffix');
    assert.deepEqual(shifted.headings.map((h) => h.level), [2, 3, 3]);
    const dropped = markdownToHtml(md, { dropFirstHeading: true });
    assert.doesNotMatch(dropped.html, /Three routes/);
    assert.match(dropped.html, /^<h2>Individual remedy<\/h2>/);
    assert.equal(markdownToHtml('###### six', { headingShift: 3 }).html, '<p>###### six</p>', 'only #..#### are headings');
    assert.equal(markdownToHtml('#### four', { headingShift: 3 }).html, '<h6>four</h6>', 'levels clamp at h6');
  });

  test('slugify', () => {
    assert.equal(slugify('6. A useful first contribution—without attending a street action'), '6-a-useful-first-contribution-without-attending-a-street-action');
    assert.equal(slugify('   '), 'section');
  });
});

describe('html helpers', () => {
  test('relRootFor computes the per-page prefix', () => {
    assert.equal(relRootFor('index.html'), '');
    assert.equal(relRootFor('issues/077.html'), '../');
    assert.equal(relRootFor('a/b/c.html'), '../../');
  });

  test('translator substitutes placeholders and fails loudly on missing keys', () => {
    const t = makeTranslator({ 'x.count': '{shown} of {total}', only: 'hi' }, { fallback: 'fb' });
    assert.equal(t('x.count', { shown: 3, total: 100 }), '3 of 100');
    assert.equal(t('fallback'), 'fb');
    assert.throws(() => t('missing.key'), /Missing i18n string: missing\.key/);
  });

  test('safeUrl escapes http(s) and mailto URLs and throws for every other scheme', () => {
    assert.equal(safeUrl('https://example.org/?a=1&b=2'), 'https://example.org/?a=1&amp;b=2');
    assert.equal(safeUrl('mailto:a@b.example'), 'mailto:a@b.example');
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//host/path', 'relative.html', '']) {
      assert.throws(() => safeUrl(url), /Unsafe URL/, url);
    }
  });

  test('langAttr and en mark English content only on non-English pages', () => {
    assert.equal(langAttr({ lang: 'en' }), '');
    assert.equal(langAttr({ lang: 'hi' }), ' lang="en"');
    assert.equal(en({ lang: 'en' }, 'x'), 'x');
    assert.equal(en({ lang: 'hi' }, 'x'), '<span lang="en">x</span>');
    assert.equal(en({ lang: 'mr' }, '<p>x</p>', 'div'), '<div lang="en"><p>x</p></div>');
  });

  test('normaliseBaseUrl', () => {
    assert.equal(normaliseBaseUrl('https://example.org/site'), 'https://example.org/site/');
    assert.equal(normaliseBaseUrl('https://example.org/site/'), 'https://example.org/site/');
    assert.throws(() => normaliseBaseUrl('not a url'), /absolute URL/);
    assert.throws(() => normaliseBaseUrl('ftp://example.org/'), /http or https/);
    // A page path is appended to the base, so `…?x=1/index.html` or `…#f/index.html` would be wrong everywhere.
    assert.throws(() => normaliseBaseUrl('https://example.org/sub?x=1'), /query string or fragment/);
    assert.throws(() => normaliseBaseUrl('https://example.org/sub#f'), /query string or fragment/);
  });

  test('must returns the value or names what was missing; table() refuses an unsafe id', () => {
    assert.equal(must(0, 'zero'), 0);
    assert.equal(must('x', 'x'), 'x');
    assert.throws(() => must(undefined, 'issue 999'), /Missing issue 999/);
    assert.throws(() => must(null, 'route Z'), /Missing route Z/);
    assert.throws(() => table({ id: 'bad id', caption: 'c', head: ['a'], rows: [] }), /unsafe id/);
    assert.throws(() => table({ id: '1x', caption: 'c', head: ['a'], rows: [] }), /unsafe id/);
    const html = table({ id: 'demo', caption: 'A <title>', head: ['H'], rows: [['r1', 'c1']] });
    assert.ok(html.startsWith('<p class="table-title" id="demo-title" aria-hidden="true">A &lt;title&gt;</p>\n<div class="table-wrap" tabindex="0" role="region" aria-labelledby="demo-caption">'));
    assert.ok(html.includes('<caption id="demo-caption" class="visually-hidden">A &lt;title&gt;</caption>'));
  });

  test('escapingPaths and throwProblems', () => {
    assert.deepEqual(escapingPaths('/x/out', ['a.html', 'b/../c.html', 'hi/issues/077.html']), []);
    assert.deepEqual(escapingPaths('/x/out', ['a.html', '../d.html', '/etc/passwd', 'hi/issues/../../../e']), ['../d.html', '/etc/passwd', 'hi/issues/../../../e']);
    assert.doesNotThrow(() => throwProblems([], 'x'));
    assert.throws(
      () => throwProblems(['first', 'second'], 'Two problems'),
      (error) => error instanceof Error && error.message === 'Two problems:\n  - first\n  - second' && Array.isArray(error.problems) && error.problems.length === 2,
    );
  });
});

describe('pack text quoted in the generator', () => {
  const source = fs.readFileSync(SOURCE_DOC, 'utf8');

  test('every hand-copied constant in src/site/pages/shared.mjs appears verbatim in content/source', () => {
    assert.ok(source.includes(APPENDIX_A_INTRO), 'APPENDIX_A_INTRO');
    assert.ok(source.includes(VALIDATION_QUOTE), 'VALIDATION_QUOTE');
    assert.ok(APPENDIX_A_INTRO.endsWith(VALIDATION_QUOTE), 'the validation quote is the tail of the Appendix A intro');
    assert.ok(source.includes(`four questions: ${FOUR_QUESTIONS.join(' ')}`), 'FOUR_QUESTIONS in order');
    for (const question of FOUR_QUESTIONS) assert.ok(source.includes(question), question);
    assert.ok(source.includes(APPENDIX_B_TITLE), 'APPENDIX_B_TITLE');
    assert.ok(source.includes(ORGANISATIONS_CAVEAT), 'ORGANISATIONS_CAVEAT');
  });

  test('the version is shown as the pack labels itself', () => {
    assert.equal(packVersionLabel(pack), `${PACK_STATUS} ${pack.version}`);
    assert.ok(source.includes(`${PACK_STATUS} ${pack.version} | ${pack.dateText} | ${pack.purpose}`), 'title block line of the source document');
  });
});

describe('i18n files', () => {
  const en_ = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'i18n', 'en.json'), 'utf8'));
  const uiKeys = (obj) => Object.keys(obj).filter((k) => !k.startsWith('_')).sort();
  const placeholders = (s) => [...String(s).matchAll(/\{[a-zA-Z]+\}/g)].map((m) => m[0]).sort();

  test('en.json is complete and every value is a string', () => {
    assert.equal(en_._status, 'complete');
    for (const [k, v] of Object.entries(en_)) assert.equal(typeof v, 'string', `${k} must be a string`);
    assert.ok(uiKeys(en_).length > 100);
  });

  for (const code of ['hi', 'mr']) {
    test(`${code}.json is a draft with the same keys and placeholders as en.json`, () => {
      const other = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'i18n', `${code}.json`), 'utf8'));
      assert.equal(other._status, 'draft-unreviewed');
      assert.match(other._note, /review/i);
      assert.ok(other._language && other._language !== 'English');
      assert.deepEqual(uiKeys(other), uiKeys(en_));
      for (const key of uiKeys(en_)) {
        assert.equal(typeof other[key], 'string', `${code}.json ${key} must be a string`);
        assert.ok(other[key].trim().length > 0, `${code}.json ${key} is empty`);
        assert.deepEqual(placeholders(other[key]), placeholders(en_[key]), `${code}.json ${key} placeholders differ`);
      }
    });
  }

  test('every UI string in the generator exists in en.json', () => {
    const files = walk(path.join(REPO_ROOT, 'src', 'site')).filter((f) => f.endsWith('.mjs'));
    const source = files.map((f) => fs.readFileSync(path.join(REPO_ROOT, 'src', 'site', f), 'utf8')).join('\n');
    const used = new Set([...source.matchAll(/\bt\(\s*'([a-zA-Z.-]+)'/g)].map((m) => m[1]));
    for (const key of used) assert.ok(key in en_, `en.json is missing "${key}"`);
  });

  test('interface strings do not overstate what the forms ask or what is generated', () => {
    assert.doesNotMatch(en_['contribute.submitText'], /nothing more/);
    assert.doesNotMatch(en_['about.provenanceText'], /nothing is hand-edited/i);
    assert.doesNotMatch(en_['sources.packSourceText'], /^Everything on this site/);
    assert.match(en_['sources.packSourceText'], /i18n\//);
    assert.match(en_['issue.organisations'], /the pack suggests/);
  });
});

describe('site build (English)', () => {
  const out = path.join(tmp, 'en');
  /** @type {import('../scripts/build-site.mjs').BuildResult} */
  let result;
  /** @type {Map<string, string>} */
  let pages;
  /** @type {Set<string>} */
  let files;

  before(() => {
    result = build({ out });
    pages = readPages(out);
    files = new Set(walk(out));
  });

  test('builds in under five seconds and reports what it wrote', () => {
    assert.ok(result.durationMs < 5000, `took ${result.durationMs} ms`);
    assert.deepEqual(result.langs, ['en']);
    assert.deepEqual(result.files, [...files]);
    assert.equal(result.pages.length, 120);
  });

  test('writes 100 issue pages, 10 domain pages and every named page', () => {
    assert.equal([...files].filter((f) => /^issues\/\d{3}\.html$/.test(f)).length, 100);
    assert.equal([...files].filter((f) => /^domains\/[a-z0-9-]+\.html$/.test(f)).length, 10);
    for (const name of [
      'index.html', 'issues/index.html', 'routes.html', 'organisations.html', 'process.html', 'contribute.html',
      'organising-cycle.html', 'sources.html', 'about.html', 'print/pack.html', '404.html', 'sitemap.xml', 'robots.txt',
      'search-index.json', 'assets/styles.css', 'assets/print.css', 'assets/enhance.js',
    ]) assert.ok(files.has(name), `${name} missing`);
    for (const name of ['pack', 'issues', 'domains', 'routes', 'organisations', 'commitments', 'participation-routes',
      'refusal-responses', 'contribution-types', 'sources', 'process-targets']) {
      const copy = fs.readFileSync(path.join(out, 'data', `${name}.json`));
      assert.ok(copy.equals(fs.readFileSync(path.join(REPO_ROOT, 'data', `${name}.json`))), `data/${name}.json copy differs`);
    }
    for (const asset of ['styles.css', 'print.css', 'enhance.js']) {
      assert.ok(fs.readFileSync(path.join(out, 'assets', asset)).equals(fs.readFileSync(path.join(REPO_ROOT, 'assets', asset))));
    }
  });

  test('every page has lang, one h1, a main, a skip link, a title and the shared chrome', () => {
    for (const [file, html] of pages) {
      assert.match(html, /^<!doctype html>\n<html lang="en">/, `${file}: html lang`);
      assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${file}: exactly one h1`);
      assert.match(html, /<main id="main" tabindex="-1"/, `${file}: main`);
      assert.match(html, /<a class="skip-link" href="#main">Skip to main content<\/a>/, `${file}: skip link`);
      assert.match(html, /<title>[^<]+ · Public Voice Between Elections<\/title>/, `${file}: title format`);
      assert.match(html, /<meta charset="utf-8">/, `${file}: charset`);
      assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/, `${file}: viewport`);
      assert.match(html, /<meta name="description" content="[^"]+">/, `${file}: description`);
      // Issue pages cover sensitive subjects, so no external site learns which page a visitor came from.
      assert.match(html, /<meta name="referrer" content="no-referrer">/, `${file}: referrer policy`);
      assert.match(html, /<nav aria-label="Main"/, `${file}: main nav`);
      for (const item of ['Home', 'Issues', 'Challenge routes', 'Organisations', 'Process', 'Contribute', 'Organising cycle', 'Sources', 'About']) {
        assert.match(html, new RegExp(`<li><a href="[^"]*"( aria-current="page")?>${item}</a></li>`), `${file}: nav ${item}`);
      }
      assert.match(html, /<footer class="site-footer">/, `${file}: footer`);
      assert.ok(html.includes('Code: MIT licence. Content and data: CC BY-SA 4.0.'), `${file}: licence lines`);
      assert.ok(html.includes(escapeHtml(pack.aiAssistedNotice)), `${file}: AI-assisted notice`);
      assert.ok(html.includes(`<time datetime="${pack.date}">`), `${file}: pack date`);
      assert.ok(html.includes(pack.sourceDocument), `${file}: source document link`);
      // The pack's own label ("Draft v0.1"), then the date once, human-readable, with the ISO form only in `datetime`.
      assert.ok(
        html.includes(`${PACK_STATUS} ${pack.version} · Pack date <time datetime="${pack.date}">${pack.dateText}</time></p>`),
        `${file}: the pack's own status word next to the version, the date once`,
      );
      assert.doesNotMatch(html, /Version Draft|<\/time> \(/, `${file}: no "Version" prefix, no repeated date`);
      // Only <html> carries lang="en" on English pages (the language list on about.html names each language in itself).
      assert.equal((html.replace('<span lang="en">English</span>', '').match(/ lang="en"/g) || []).length, 1, `${file}: redundant lang="en" marks`);
    }
  });

  test('every page carries the pack disclaimer verbatim as a note inside the header landmark', () => {
    const expected = `<p role="note" class="disclaimer">${escapeHtml(pack.disclaimer)}</p>`;
    for (const [file, html] of pages) {
      assert.ok(html.includes(expected), `${file}: disclaimer`);
      // Inside <header>, so screen-reader users who move by landmark do not skip it.
      const header = html.match(/<header class="site-header">.*?<\/header>/s)[0];
      assert.ok(header.includes(expected), `${file}: disclaimer inside the header`);
      assert.doesNotMatch(html, /<\/header>\s*<p role="note"/, `${file}: nothing between the header and main`);
    }
  });

  test('heading levels never skip', () => {
    for (const [file, html] of pages) {
      const levels = headingLevels(html);
      assert.equal(levels[0], 1, `${file}: first heading is h1`);
      for (let i = 1; i < levels.length; i++) {
        assert.ok(levels[i] <= levels[i - 1] + 1, `${file}: h${levels[i - 1]} followed by h${levels[i]}`);
      }
    }
  });

  test('no empty links, no undefined, no [object Object], no raw template braces', () => {
    for (const [file, html] of pages) {
      assert.doesNotMatch(html, /<a\b[^>]*>\s*<\/a>/, `${file}: empty link`);
      assert.doesNotMatch(html, /undefined/, `${file}: undefined`);
      assert.doesNotMatch(html, /\[object Object\]/, `${file}: [object Object]`);
      assert.doesNotMatch(html, /\bNaN\b/, `${file}: NaN`);
      assert.doesNotMatch(html, /\$\{/, `${file}: unrendered template`);
    }
    for (const file of ['sitemap.xml', 'robots.txt', 'search-index.json', 'assets/enhance.js', 'assets/styles.css']) {
      const text = fs.readFileSync(path.join(out, file), 'utf8');
      assert.doesNotMatch(text, /undefined|\[object Object\]/, `${file}`);
    }
  });

  test('every internal href and src resolves to a generated file, and fragments resolve in-page', () => {
    for (const [file, html] of pages) {
      const dir = path.posix.dirname(file);
      const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
      for (const m of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
        const ref = m[1];
        if (ref.startsWith(result.baseUrl) && ref !== result.baseUrl) {
          // Only 404.html may link to itself by the configured base URL, and then only to files that exist.
          assert.equal(file, '404.html', `${file}: absolute self link ${ref}`);
          const target = ref.slice(result.baseUrl.length).split('#')[0];
          assert.ok(files.has(target), `${file}: ${ref} -> ${target} does not exist`);
          continue;
        }
        if (/^(https?:|mailto:)/.test(ref)) continue;
        if (ref.startsWith('#')) {
          assert.ok(ids.has(ref.slice(1)), `${file}: fragment ${ref} has no target`);
          continue;
        }
        assert.ok(ref.length > 0, `${file}: empty href`);
        assert.ok(!ref.startsWith('/'), `${file}: root-relative link ${ref}`);
        const [withoutHash, hash] = ref.split('#');
        const target = path.posix.normalize(path.posix.join(dir, withoutHash.split('?')[0]));
        assert.ok(files.has(target), `${file}: ${ref} -> ${target} does not exist`);
        if (hash && target.endsWith('.html')) {
          const targetIds = new Set([...pages.get(target).matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));
          assert.ok(targetIds.has(hash), `${file}: ${ref} fragment missing in ${target}`);
        }
      }
    }
  });

  test('no external requests: no remote stylesheets, scripts, images, fonts or imports; only javascript-free safe link schemes', () => {
    for (const [file, html] of pages) {
      assert.doesNotMatch(html, /<(?:link|script|img|iframe|video|audio|source)\b[^>]*\b(?:href|src)="(?:https?:)?\/\//, `${file}: remote resource`);
      assert.doesNotMatch(html, /style="/, `${file}: inline style attribute`);
      assert.doesNotMatch(html, /\b(?:href|src)="\s*(?:javascript|data|vbscript):/i, `${file}: unsafe URL scheme`);
      if (file !== '404.html') assert.doesNotMatch(html, /<style/, `${file}: inline style block`);
    }
    for (const css of ['assets/styles.css', 'assets/print.css']) {
      const text = fs.readFileSync(path.join(out, css), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.doesNotMatch(text, /@import|url\(|@font-face/, `${css}: external request`);
    }
    const js = fs.readFileSync(path.join(out, 'assets/enhance.js'), 'utf8');
    assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|navigator\.sendBeacon|https?:\/\//, 'enhance.js makes no requests');
  });

  test('404.html is self-contained: an inline style, no stylesheet, no script, no alternates, navigational links by base URL only', () => {
    const html = pages.get('404.html');
    assert.doesNotMatch(html, /<link\b/, 'no <link> of any kind');
    assert.doesNotMatch(html, /<script\b/, 'no script');
    assert.doesNotMatch(html, /\bsrc="/, 'nothing is loaded');
    assert.equal((html.match(/<style>/g) || []).length, 1);
    assert.ok(html.includes(`<style>${STANDALONE_STYLE}</style>`));
    assert.doesNotMatch(STANDALONE_STYLE, /@import|url\(|@font-face/);
    assert.doesNotMatch(html, /lang-nav|hreflang/, 'no language switcher on the shared 404 page');
    assert.match(html, /<h1>Page not found<\/h1>/);
    assert.match(html, /<main id="main" tabindex="-1">/);
    for (const m of html.matchAll(/\bhref="([^"]*)"/g)) {
      assert.match(m[1], /^(https?:|mailto:|#main$)/, `404.html: relative link ${m[1]} cannot resolve at an unknown depth`);
    }
    assert.ok(html.includes(`href="${BASE}index.html"`));
    assert.ok(html.includes(`href="${BASE}issues/index.html"`));
  });

  test('tables have scoped headers and captions, a visible title outside the scroll container, and a focusable labelled scroll region', () => {
    let checked = 0;
    for (const [file, html] of pages) {
      for (const m of html.matchAll(/<th\b([^>]*)>/g)) assert.match(m[1], /scope="(col|row)"/, `${file}: th without scope`);
      const tables = (html.match(/<table\b/g) || []).length;
      assert.equal((html.match(/<caption[\s>]/g) || []).length, tables, `${file}: every table has a caption`);
      const wraps = [...html.matchAll(/<div class="table-wrap"([^>]*)>/g)];
      assert.equal(wraps.length, tables, `${file}: every table sits in a scroll container`);
      for (const wrap of wraps) {
        // Keyboard users can reach columns that overflow at phone widths, and hear what the tab stop is.
        const labelled = /^ tabindex="0" role="region" aria-labelledby="([a-z0-9-]+)"$/.exec(wrap[1]);
        assert.ok(labelled, `${file}: scroll container is focusable and labelled: ${wrap[0]}`);
        const captionId = labelled[1];
        const caption = new RegExp(`<caption id="${captionId}" class="visually-hidden">([^<]+)</caption>`).exec(html);
        assert.ok(caption, `${file}: the label is the table's caption`);
        // The same title is shown as a block before the container, so it wraps instead of being clipped with the table.
        const titleId = captionId.replace(/-caption$/, '-title');
        const before = html.slice(0, wrap.index);
        assert.ok(before.endsWith(`<p class="table-title" id="${titleId}" aria-hidden="true">${caption[1]}</p>\n`), `${file}: visible title precedes the container`);
        assert.equal((html.match(new RegExp(` id="${captionId}"`, 'g')) || []).length, 1, `${file}: ${captionId} unique`);
        checked++;
      }
    }
    assert.ok(checked >= 2, `checked ${checked} tables`);
  });

  test('the stylesheet follows the design rules', () => {
    const css = fs.readFileSync(path.join(out, 'assets/styles.css'), 'utf8');
    assert.match(css, /font-family: system-ui/);
    assert.match(css, /@media \(min-width: 48em\) \{\s*html \{\s*font-size: 112\.5%/);
    assert.match(css, /--measure: 70ch/);
    assert.match(css, /:root \{[^}]*--bg: #ffffff/);
    assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root \{/);
    assert.match(css, /:focus-visible \{\s*outline: 3px solid/);
    assert.match(css, /@media print/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /\.not-stated \{/);
    for (const code of ['A', 'I', 'R', 'H', 'J', 'P', 'V']) assert.match(css, new RegExp(`\\.badge-${code} \\{`));
    // Tables: the title block outside the scroll container, a scroll cue drawn without images, the
    // sentence column of the targets table wide enough to read, and no clipping on paper.
    assert.match(css, /\.table-title \{/);
    assert.match(css, /\.table-wrap \{[^}]*background-attachment: local, local, scroll, scroll/);
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /url\(/, 'no url() in any rule, so the scroll cue makes no request');
    assert.match(css, /\.targets td:nth-child\(2\) \{\s*min-width: 16rem/);
    assert.match(css, /@media print \{[\s\S]*\.table-wrap \{\s*overflow: visible;\s*background: none;/);
    // The route key pairs each badge with its name even when the name wraps.
    assert.match(css, /\.route-key-list li \{\s*display: flex;\s*align-items: baseline/);
    // Route badges are at least 24 × 24 CSS px at the 16px base (WCAG 2.5.8), computed from the rule itself.
    const badge = /\.badge \{([^}]*)\}/.exec(css)[1];
    const fontRem = Number(/font-size: ([\d.]+)rem/.exec(badge)[1]);
    const lineHeight = Number(/line-height: ([\d.]+)/.exec(badge)[1]);
    const minWidthEm = Number(/min-width: ([\d.]+)em/.exec(badge)[1]);
    const borderPx = Number(/border: (\d+)px solid/.exec(badge)[1]);
    assert.ok(fontRem * 16 * lineHeight + 2 * borderPx >= 24, `badge height ${fontRem * 16 * lineHeight + 2 * borderPx}px`);
    assert.ok(fontRem * 16 * minWidthEm >= 24, `badge width ${fontRem * 16 * minWidthEm}px`);
    // The disclaimer and the translation notice fill the header's content box instead of adding their own gutter.
    assert.doesNotMatch(css, /\.site-header,\s*\.disclaimer/);
  });

  test('the print stylesheet breaks pages only before the appendices and drops the footer notice the closing section repeats', () => {
    const css = fs.readFileSync(path.join(out, 'assets/print.css'), 'utf8');
    assert.match(css, /\.print-pack #appendix-a,\s*\.print-pack #appendix-b,\s*\.print-pack #appendix-c \{\s*break-before: page/);
    assert.doesNotMatch(css, /\.pack-section \{\s*break-before: page/, 'sections 1–9 flow on (a break before each left pages half empty)');
    assert.doesNotMatch(css, /#appendix-a h3 \{\s*break-before: page/, 'domain groups flow on');
    assert.match(css, /main\.print-pack \+ \.site-footer \.ai-notice \{\s*display: none/);
    assert.doesNotMatch(css, /url\(|@import/);
  });

  test('enhance.js writes the live result count once typing has paused, and only when it changed', () => {
    // enhance.js runs only in a browser; without a DOM harness the test reads the source.
    const js = fs.readFileSync(path.join(out, 'assets/enhance.js'), 'utf8');
    assert.match(js, /function announce\(text, immediately\)/);
    assert.match(js, /if \(count\.textContent !== text\) count\.textContent = text;/);
    assert.match(js, /announceTimer = window\.setTimeout\(write, \d{3}\)/);
    assert.equal((js.match(/count\.textContent =/g) || []).length, 1, 'the live region is written in one place');
    assert.match(js, /addEventListener\('input', function \(\) \{\s*apply\(true, false\);/, 'typing defers the announcement');
    assert.match(js, /addEventListener\('change', function \(\) \{\s*apply\(true, true\);/, 'a select change announces at once');
  });

  test('colour contrast computed from the tokens: text pairs >= 4.5:1, focus ring >= 3:1, in light and dark mode, in both stylesheets', () => {
    const css = fs.readFileSync(path.join(out, 'assets/styles.css'), 'utf8');
    const badges = ['A', 'I', 'R', 'H', 'J', 'P', 'V'];
    for (const [mode, tokens] of Object.entries(themeTokens(css))) {
      const check = (fg, bg, minimum) => {
        assert.ok(tokens[fg] && tokens[bg], `${mode}: tokens ${fg}/${bg} defined`);
        const ratio = contrast(tokens[fg], tokens[bg]);
        assert.ok(ratio >= minimum, `${mode}: --${fg} ${tokens[fg]} on --${bg} ${tokens[bg]} is ${ratio.toFixed(2)}:1, below ${minimum}:1`);
      };
      for (const bg of ['bg', 'surface', 'note-bg']) {
        for (const fg of ['fg', 'muted', 'link', 'visited']) check(fg, bg, 4.5);
        check('focus', bg, 3);
      }
      check('bg', 'link', 4.5); // button text on a button
      check('link', 'bg', 4.5); // secondary button text
      for (const badge of [...badges.map((code) => `badge-${code}`), 'badge-default']) {
        check('badge-fg', badge, 4.5);
        check('focus', badge, 3);
      }
    }
    for (const [mode, tokens] of Object.entries(themeTokens(STANDALONE_STYLE))) {
      for (const bg of ['bg', 'surface', 'note-bg']) {
        for (const fg of ['fg', 'link', 'visited']) {
          assert.ok(contrast(tokens[fg], tokens[bg]) >= 4.5, `404 ${mode}: --${fg} on --${bg}`);
        }
        assert.ok(contrast(tokens.focus, tokens[bg]) >= 3, `404 ${mode}: focus on --${bg}`);
      }
    }
  });

  test('issues index: inert GET form without an action attribute, noscript note, live count, 100 issue links grouped by domain', () => {
    const html = pages.get('issues/index.html');
    assert.match(html, /<form id="issue-filter" class="filter" method="get">/);
    assert.doesNotMatch(html, /<form[^>]*\baction=/, 'action is omitted (an empty action="" is invalid HTML)');
    assert.match(html, /<select id="filter-domain" name="domain">/);
    assert.match(html, /<select id="filter-route" name="route">/);
    assert.match(html, /<input type="search" id="filter-q" name="q"/);
    assert.match(html, /<button type="submit">Filter<\/button>/);
    assert.match(html, /<noscript><p class="hint">Without JavaScript this form does nothing/);
    assert.match(html, /<p id="issue-count" class="count" aria-live="polite" data-template="Showing \{shown\} of \{total\} issue families\."[^>]*>Showing 100 of 100 issue families\.<\/p>/);
    assert.equal((html.match(/<option value="d\d{2}">/g) || []).length, 10);
    assert.equal((html.match(/<option value="[AIRHJPV]">/g) || []).length, 7);
    const links = new Set([...html.matchAll(/<a class="issue-title" href="\.\.\/issues\/(\d{3})\.html">/g)].map((m) => m[1]));
    assert.equal(links.size, 100);
    assert.deepEqual([...links].sort(), issues.map((i) => i.id));
    assert.equal((html.match(/<section class="domain-group" data-domain-group="d\d{2}"/g) || []).length, 10);
    assert.equal((html.match(/<h2 /g) || []).length, 11, '10 domain headings plus the route key');
    assert.equal((html.match(/data-issue-row/g) || []).length, 100);
    const row = html.match(/<li class="issue-row" data-issue-row data-id="077"[^>]*>.*?<\/li>/s)[0];
    assert.match(row, /data-domain="d08"/);
    assert.match(row, /data-routes="A R J"/);
    assert.match(row, /data-text="077 ration access and food-security exclusions eligible households/);
    assert.match(row, /<a class="badge badge-R" href="\.\.\/routes\.html#R" title="Regulator or specialist redress" aria-label="Route R: Regulator or specialist redress">R<\/a>/);
  });

  test('issue 077 lists its three routes with full names and every required block', () => {
    const html = pages.get('issues/077.html');
    assert.match(html, /<h1>077\. Ration access and food-security exclusions<\/h1>/);
    assert.match(html, /<title>077\. Ration access and food-security exclusions · Public Voice Between Elections<\/title>/);
    assert.match(html, /Domain: <a href="\.\.\/domains\/agriculture-rural-livelihoods-and-food-systems\.html">071–080\. Agriculture, rural livelihoods and food systems<\/a>/);
    const routeList = html.match(/<ul class="route-links">(.*?)<\/ul>/s)[1];
    // One link per route with the code as a badge inside it, so the letter is not printed twice.
    const names = [...routeList.matchAll(/<a class="route-link" href="\.\.\/routes\.html#([AIRHJPV])"><span class="badge badge-\1">\1<\/span> ([^<]+)<\/a>/g)].map((m) => m[2]);
    assert.deepEqual(names, ['Administrative review', 'Regulator or specialist redress', 'Qualified legal review / competent court or tribunal']);
    assert.equal((routeList.match(/<li>/g) || []).length, 3);
    assert.equal((routeList.match(/<a\b/g) || []).length, 3, 'no second link per route');
    assert.doesNotMatch(routeList, /<\/span> [AIRHJPV] — /, 'the code appears once per route');
    for (const label of ['Who can raise', 'Who must answer (indicative owner)', 'Possible change', 'Evidence to collect', 'Challenge routes']) {
      assert.match(html, new RegExp(`<dt>${label.replace(/[()]/g, '\\$&')}</dt>`), label);
    }
    assert.match(html, /<dd>Eligible households, ration workers, advocates<\/dd>/);
    assert.match(html, /<dd>Food\/civil-supplies department; statutory grievance bodies<\/dd>/);
    assert.ok(html.includes('<q>Owners require current state/sector validation. No evidence listed below is asserted to have already been collected.</q>'));
    assert.match(html, /<h2>Organisations the pack suggests approaching about this issue \(section 7\)<\/h2>/);
    assert.doesNotMatch(html, /whose suggested agenda/, 'the heading no longer implies the organisation suggested an agenda');
    // The section 7 caveat is quoted whole, not paraphrased without "with the movement" and "remote arrangements".
    assert.ok(html.includes(`<p class="hint">From section 7 of the pack. ${escapeHtml(ORGANISATIONS_CAVEAT)}</p>`), 'section 7 caveat verbatim');
    assert.doesNotMatch(html, /Willingness, capacity and affiliation remain/, 'no shortened paraphrase');
    assert.match(html, /<a href="\.\.\/organisations\.html#org-05">05\. Mazdoor Kisan Shakti Sangathan \(MKSS\)<\/a>/);
    assert.ok(html.includes('Grassroots movement with relevant practice; no current remote invitation verified.'));
    assert.match(html, /<a rel="prev" href="076\.html">Previous: 076\. Food safety and adulteration<\/a>/);
    assert.match(html, /<a rel="next" href="078\.html">Next: 078\. Climate resilience for farmers<\/a>/);
    assert.ok(html.includes('https://github.com/mrunmaipatil47/public-democratic-action/issues/new/choose'));
    assert.ok(html.includes('Relevant service complaint, supervisor, statutory departmental appeal or CPGRAMS/state system where admissible. Check exclusions and deadlines.'), 'route meaning quoted');
    assert.ok(html.includes('These routes are options, not a compulsory ladder.'));
    assert.doesNotMatch(pages.get('issues/001.html'), /rel="prev"/);
    assert.doesNotMatch(pages.get('issues/100.html'), /rel="next"/);
    assert.match(pages.get('issues/021.html'), /No organisation in section 7 of the pack lists this issue/);
  });

  test('organisations page: 13 cards, status verbatim, both links with rel=noopener, agenda ids linked', () => {
    const html = pages.get('organisations.html');
    const orgs = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'organisations.json'), 'utf8'));
    assert.equal((html.match(/<article class="card org"/g) || []).length, 13);
    assert.ok(html.indexOf(escapeHtml(orgs.selectionBasis)) < html.indexOf('id="org-01"'), 'selection basis above the cards');
    assert.ok(html.indexOf(escapeHtml(orgs.additionalNetworkLead)) > html.indexOf('id="org-13"'), 'network lead below the cards');
    for (const org of orgs.items) {
      assert.ok(html.includes(`<strong>Status:</strong> ${escapeHtml(org.status)}</p>`), `${org.id} status verbatim`);
      assert.ok(html.includes(`<a href="${escapeHtml(org.officialEvidenceUrl)}" rel="noopener" class="external">`), `${org.id} evidence link`);
      assert.ok(html.includes(`<a href="${escapeHtml(org.publicRouteUrl)}" rel="noopener" class="external">`), `${org.id} route link`);
      for (const id of org.agendaIssueIds) assert.ok(html.includes(`<a href="issues/${id}.html" aria-label="${id}. `), `${org.id} links ${id}`);
    }
    assert.doesNotMatch(html, /<img/, 'external icon is CSS, not an image');
  });

  test('process page: targets table marks what the pack leaves unstated, existing-law sentence with caveats, refusal table, no-invented-consequence paragraph', () => {
    const html = pages.get('process.html');
    const targets = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'process-targets.json'), 'utf8'));
    const refusals = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'refusal-responses.json'), 'utf8'));
    assert.match(html, /<table class="targets">/);
    assert.match(html, /<th scope="col">Stage<\/th><th scope="col">Target<\/th><th scope="col">Days<\/th><th scope="col">Day type<\/th><th scope="col">Counted from<\/th>/);
    const targetsTable = html.match(/<table class="targets">.*?<\/table>/s)[0];
    const rows = [...targetsTable.matchAll(/<tr><th scope="row">(.*?)<\/tr>/gs)].map((m) => m[0]);
    assert.equal(rows.length, targets.targets.length);
    const marker = '<span class="not-stated">(not stated in the pack)</span>';
    const cells = (row) => [...row.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g)].map((m) => m[1]);
    const byStage = Object.fromEntries(rows.map((row) => [cells(row)[1], cells(row)]));
    // The pack: "ordinary response within 21 calendar days" — both stated or implied by the sentence's structure? Only the day type is stated.
    assert.equal(byStage['Reasoned response within 21 calendar days unless governing law specifies otherwise'][3], 'calendar');
    // The pack: "systemic admission decision within 30 days" — neither a day type nor a starting point.
    assert.equal(byStage['Systemic admission decision within 30 days'][3], `calendar ${marker}`);
    assert.equal(byStage['Systemic admission decision within 30 days'][4], `receipt of the filing ${marker}`);
    // The pack: "hearing/decision normally within 60/90 days of admission" — starting point stated, day type not.
    assert.equal(byStage['Hearing normally within 60 days of admission'][3], `calendar ${marker}`);
    assert.equal(byStage['Hearing normally within 60 days of admission'][4], 'admission decision');
    assert.equal(byStage['Decision normally within 90 days of admission'][4], 'admission decision');
    assert.equal(byStage['Receipt issued within two working days when filing is assisted, offline, by telephone or by post'][3], 'working');
    assert.ok(html.includes('Where a cell says “not stated in the pack”'), 'footnote explaining the marker');
    assert.ok(html.includes('DARPG’s August 2024 grievance guidelines generally use a 21-day framework'));
    assert.ok(html.includes('[Sources 1–3]'), 'bracket escapes removed');
    assert.doesNotMatch(html, /\\\[/);
    assert.ok(html.includes(escapeHtml(targets.existingLawReference.note)));
    assert.ok(html.includes(escapeHtml(targets.caveat)));
    const refusalTable = html.match(/<table class="refusals">.*?<\/table>/s)[0];
    assert.equal((refusalTable.match(/<tr><th scope="row">/g) || []).length, 7);
    // The data keeps the pack's lower-case continuation after "Situation:"; the cell starts the sentence with a capital.
    for (const item of refusals.items) {
      const shown = item.response.charAt(0).toUpperCase() + item.response.slice(1);
      assert.ok(refusalTable.includes(`<th scope="row">${escapeHtml(item.situation)}</th><td>${escapeHtml(shown)}</td>`), item.id);
    }
    assert.doesNotMatch(refusalTable, /<td>[a-z]/, 'no response cell starts in lower case');
    assert.ok(html.includes(escapeHtml(refusals.caveat)), 'no-invented-consequence paragraph verbatim');
    assert.ok(html.includes('A poll does not create legal authority.'));
  });

  test('contribute page: eight types, nine form fields with caveat, issue forms link, invitation blockquote without a server-rendered button', () => {
    const html = pages.get('contribute.html');
    const types = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'contribution-types.json'), 'utf8'));
    const typesList = html.match(/<ul class="contribution-types">.*?<\/ul>/s)[0];
    assert.equal((typesList.match(/<li>/g) || []).length, 8);
    for (const item of types.items) assert.ok(typesList.includes(`<strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.description)}`), item.id);
    const fields = html.match(/<ol class="form-fields">.*?<\/ol>/s)[0];
    assert.equal((fields.match(/<li>/g) || []).length, 9);
    assert.ok(html.includes(escapeHtml(types.form.caveat)));
    assert.ok(html.includes('https://github.com/mrunmaipatil47/public-democratic-action/issues/new/choose'));
    assert.doesNotMatch(html, /and nothing more/, 'does not claim the forms ask for exactly the pack fields');
    assert.ok(html.includes('They ask for no personal contact details'));
    const quote = html.match(/<blockquote id="invitation"[^>]*>.*?<\/blockquote>/s)[0];
    assert.equal((quote.match(/<p>/g) || []).length, 3);
    assert.ok(quote.includes('Reviewing the draft does not imply endorsement, coalition membership or permission to use your name.'));
    assert.match(quote, /data-copy-label="Copy the invitation"/);
    assert.doesNotMatch(html, /<button/, 'the Copy button is added only by enhance.js');
    assert.match(html, /<div id="invitation-actions" class="actions no-print"><\/div>/);
    assert.ok(html.includes('An existing organisation need not become a coalition member to improve this draft.'));
  });

  test('home page: Draft v0.1 meta line, four questions, seven commitments with caveat, three routes with caveat, calls to action', () => {
    const html = pages.get('index.html');
    assert.match(html, /<h1>Public Voice Between Elections<\/h1>/);
    assert.ok(html.includes(`<p class="meta">${PACK_STATUS} ${pack.version} · <time datetime="${pack.date}">${pack.dateText}</time> · ${escapeHtml(pack.purpose)}</p>`));
    assert.equal((html.match(/<ol class="questions">.*?<\/ol>/s)[0].match(/<li>/g) || []).length, 4);
    assert.ok(html.includes('What happens when power refuses to listen?'));
    assert.equal((html.match(/<ul class="commitments">.*?<\/ul>/s)[0].match(/<li>/g) || []).length, 7);
    assert.ok(html.includes('These are proposed commitments requiring adoption. They are not existing universal legal guarantees.'));
    assert.equal((html.match(/<h3>/g) || []).length, 3);
    assert.ok(html.includes('This project is not an emergency responder.'));
    assert.match(html, /<a href="issues\/index\.html">Browse the 100 issue families<\/a>/);
    assert.match(html, /<a href="print\/pack\.html">Print or post the whole pack<\/a>/);
  });

  test('routes page: seven sections with ids matching the codes and the caveat', () => {
    const html = pages.get('routes.html');
    for (const code of ['A', 'I', 'R', 'H', 'J', 'P', 'V']) {
      assert.match(html, new RegExp(`<section id="${code}" class="route card"`));
      // The heading shows the code once, as a badge that is read out, followed by the name.
      assert.match(html, new RegExp(`<h2 id="route-${code}-heading"><span class="badge badge-${code}">${code}</span> [^<]+</h2>`), `${code} heading`);
    }
    assert.doesNotMatch(html, /<\/span> [AIRHJPV] — /, 'the code is not printed twice');
    assert.ok(html.includes('A recommendation is not necessarily a binding executable order.'));
    assert.ok(html.includes('Urgent protection and individual relief must not wait for a public hearing.'));
    const named = [...html.matchAll(/Named on (\d+) of the 100 issue cards/g)].map((m) => Number(m[1]));
    assert.equal(named.length, 7);
    assert.equal(named.reduce((a, b) => a + b, 0), issues.reduce((a, i) => a + i.challengeRoutes.length, 0));
  });

  test('domain pages list their ten issues and link neighbours', () => {
    const html = pages.get('domains/agriculture-rural-livelihoods-and-food-systems.html');
    assert.match(html, /<h1>071–080\. Agriculture, rural livelihoods and food systems<\/h1>/);
    assert.equal((html.match(/data-issue-row/g) || []).length, 10);
    assert.match(html, /<a rel="prev" href="housing-local-services-and-mobility\.html">/);
    assert.match(html, /<a rel="next" href="environment-climate-and-natural-resources\.html">/);
    assert.ok(html.includes('10 issue families in this domain.'));
  });

  test('sources and about pages: eight sources with visible URLs, honest provenance wording, Draft v0.1', () => {
    const html = pages.get('sources.html');
    const sources = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'sources.json'), 'utf8'));
    for (const item of sources.items) {
      assert.ok(html.includes(`<a href="${escapeHtml(item.url)}" rel="noopener">${escapeHtml(item.title)}`), item.title);
      assert.ok(html.includes(`<span class="url">${escapeHtml(item.url)}</span>`), `${item.number} visible URL`);
    }
    assert.ok(html.includes(escapeHtml(sources.intro)));
    assert.ok(html.includes(`${escapeHtml(pack.title)} (${PACK_STATUS} ${pack.version}, ${pack.dateText})`));
    assert.doesNotMatch(html, /Everything on this site is generated/);
    const about = pages.get('about.html');
    assert.ok(about.includes(`<dt>Pack version</dt><dd>${PACK_STATUS} ${pack.version}</dd>`));
    assert.doesNotMatch(about, /nothing is hand-edited/);
    assert.ok(about.includes('Interface labels are maintained in i18n/.'));
    assert.equal(about.split(escapeHtml(pack.disclaimer)).length - 1, 1, 'the disclaimer appears once (the banner), not again under it');
  });

  test('print pack contains sections 1–9, all 100 cards, the routes and the sources', () => {
    const html = pages.get('print/pack.html');
    assert.match(html, /<main id="main" tabindex="-1" class="print-pack">/);
    for (let n = 1; n <= 9; n++) assert.match(html, new RegExp(`<h2 id="s${n}-${n}-[a-z0-9-]+">${n}\\. `), `section ${n}`);
    for (const issue of issues) assert.ok(html.includes(`<h4>${issue.id}. ${escapeHtml(issue.title)}</h4>`), issue.id);
    assert.equal((html.match(/<article class="card issue-card"/g) || []).length, 100);
    for (const code of ['A', 'I', 'R', 'H', 'J', 'P', 'V']) assert.match(html, new RegExp(`<h3 id="pb-${code}">${code} — `));
    assert.equal((html.match(/<ol class="sources">.*?<\/ol>/s)[0].match(/<li /g) || []).length, 8);
    assert.ok(html.includes(escapeHtml(pack.workingContext)));
    assert.ok(html.includes('Additional network lead:'));
    assert.ok(html.includes(`<p class="meta">${PACK_STATUS} ${pack.version} · `));
    // The contents list is printed too (the hint above it is not); it is the only overview a postal copy has.
    assert.match(html, /<nav aria-label="Contents" class="toc">/);
    assert.match(html, /<p class="hint no-print">/);
  });

  test('sitemap, robots, search index and 404', () => {
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(locs.length, 120);
    assert.equal(locs.length, result.pages.length);
    assert.ok(locs.every((l) => l.startsWith(BASE)));
    assert.ok(!locs.some((l) => l.endsWith('404.html')));
    assert.ok(locs.includes(`${BASE}issues/077.html`));
    assert.equal((sitemap.match(new RegExp(`<lastmod>${pack.date}</lastmod>`, 'g')) || []).length, 120, 'only the pack date appears');
    assert.equal(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8'), `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`);
    const index = JSON.parse(fs.readFileSync(path.join(out, 'search-index.json'), 'utf8'));
    assert.equal(index.length, 100);
    assert.deepEqual(Object.keys(index[76]), ['id', 'title', 'domain', 'domainId', 'routes', 'url', 'text']);
    assert.equal(index[76].id, '077');
    assert.deepEqual(index[76].routes, ['A', 'R', 'J']);
    assert.equal(index[76].url, 'issues/077.html');
    assert.match(index[76].text, /^Raise: Eligible households/);
    const notFound = pages.get('404.html');
    assert.match(notFound, /<h1>Page not found<\/h1>/);
    assert.ok(notFound.includes(`href="${BASE}index.html"`));
    assert.doesNotMatch(notFound, /assets\/styles\.css|assets\/enhance\.js/, '404.html loads nothing from the base URL');
  });

  test('the build is deterministic', () => {
    const again = path.join(tmp, 'en-again');
    build({ out: again });
    const hash = (dir) => walk(dir).map((f) => `${f} ${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex')}`);
    assert.deepEqual(hash(again), hash(out));
    assert.doesNotMatch(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /20\d\d-\d\d-\d\dT/, 'no timestamps');
  });

  test('pure helpers: searchIndex and sitemapXml', () => {
    const site = loadSite(REPO_ROOT);
    assert.equal(searchIndex(site).length, 100);
    const xml = sitemapXml(['b.html', 'a.html'], 'https://x.example/', '2026-10-13');
    assert.ok(xml.indexOf('a.html') < xml.indexOf('b.html'), 'sorted');
    assert.match(xml, /<loc>https:\/\/x\.example\/a\.html<\/loc>/);
  });

  test('refuses to build into the repository root and honours --base-url', () => {
    assert.throws(() => build({ out: REPO_ROOT }), /Refusing to build/);
    const custom = path.join(tmp, 'custom-base');
    build({ out: custom, baseUrl: 'https://example.org/preview' });
    assert.match(fs.readFileSync(path.join(custom, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example\.org\/preview\/sitemap\.xml/);
    const notFound = fs.readFileSync(path.join(custom, '404.html'), 'utf8');
    assert.match(notFound, /href="https:\/\/example\.org\/preview\/index\.html"/);
    assert.doesNotMatch(notFound, /github\.io/);
  });
});

describe('site build (English + Hindi + Marathi)', () => {
  const out = path.join(tmp, 'multi');
  const hi = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'i18n', 'hi.json'), 'utf8'));
  /** @type {import('../scripts/build-site.mjs').BuildResult} */
  let result;
  /** @type {Map<string, string>} */
  let pages;
  /** @type {Set<string>} */
  let files;

  before(() => {
    result = build({ out, langs: ['en', 'hi', 'mr'], baseUrl: 'https://example.org/preview' });
    pages = readPages(out);
    files = new Set(walk(out));
  });

  test('writes a self-contained root per language and one sitemap', () => {
    assert.deepEqual(result.langs, ['en', 'hi', 'mr']);
    assert.equal(result.pages.length, 360);
    for (const prefix of ['hi/', 'mr/']) {
      for (const f of ['index.html', 'issues/index.html', 'issues/077.html', 'print/pack.html', 'assets/styles.css', 'data/issues.json', 'search-index.json']) {
        assert.ok(files.has(prefix + f), `${prefix}${f}`);
      }
      assert.ok(!files.has(`${prefix}sitemap.xml`) && !files.has(`${prefix}robots.txt`) && !files.has(`${prefix}404.html`));
    }
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.equal((sitemap.match(/<loc>/g) || []).length, 360);
    assert.ok(sitemap.includes('https://example.org/preview/hi/issues/077.html'));
  });

  test('translated chrome, English content marked lang="en", fixed English title suffix, bilingual pending notice, language switcher', () => {
    const html = pages.get('hi/issues/077.html');
    assert.match(html, /^<!doctype html>\n<html lang="hi">/);
    assert.ok(html.includes(`<title>077. Ration access and food-security exclusions · ${escapeHtml(hi['site.name'])} · Public Voice Between Elections</title>`));
    for (const [file, page] of pages) assert.match(page, /<title>[^<]+ · Public Voice Between Elections<\/title>/, `${file}: title format`);
    assert.ok(html.includes(`<a class="skip-link" href="#main">${escapeHtml(hi['site.skipLink'])}</a>`));
    assert.ok(html.includes(`<nav aria-label="${escapeHtml(hi['nav.label'])}"`));
    assert.ok(html.includes(`<dt>${escapeHtml(hi['issue.raise'])}</dt><dd><span lang="en">Eligible households, ration workers, advocates</span></dd>`), 'Hindi label, English content marked');
    assert.match(html, /<main id="main" tabindex="-1">/, 'main carries no lang: it mixes Hindi labels and English content');
    assert.match(html, /<h1 lang="en">077\. Ration access and food-security exclusions<\/h1>/);
    assert.ok(html.includes(`<p role="note" class="translation-notice"><span lang="hi">${escapeHtml(hi['lang.notice'])}</span> <span lang="en">The pack text is still in English. The menus and labels are a draft translation that has not yet been reviewed.</span></p>`));
    assert.ok(html.includes(`<p role="note" class="disclaimer" lang="en">${escapeHtml(pack.disclaimer)}</p>`), 'disclaimer stays verbatim English and is marked');
    assert.ok(html.includes(`<span lang="en">${PACK_STATUS} ${pack.version}</span>`));
    assert.ok(html.includes(`<time datetime="${pack.date}"><span lang="en">${pack.dateText}</span></time>`));
    assert.match(html, /<nav aria-label="भाषा" class="lang-nav">/);
    assert.match(html, /<a href="\.\.\/\.\.\/issues\/077\.html" hreflang="en" lang="en">English<\/a>/);
    assert.match(html, /<a href="\.\.\/\.\.\/hi\/issues\/077\.html" hreflang="hi" lang="hi" aria-current="page">हिन्दी<\/a>/);
    assert.match(html, /<a href="\.\.\/\.\.\/mr\/issues\/077\.html" hreflang="mr" lang="mr">मराठी<\/a>/);
    assert.match(html, /<link rel="alternate" hreflang="en" href="\.\.\/\.\.\/issues\/077\.html">/);
    const en_ = pages.get('issues/077.html');
    assert.match(en_, /<a href="\.\.\/hi\/issues\/077\.html" hreflang="hi" lang="hi">हिन्दी<\/a>/);
    assert.match(pages.get('index.html'), /<a href="hi\/index\.html" hreflang="hi" lang="hi">हिन्दी<\/a>/);
    assert.doesNotMatch(en_, /translation-notice/);
    assert.match(pages.get('mr/index.html'), /<html lang="mr">/);
    assert.ok(pages.get('mr/about.html').includes('मसुदा, पुनरावलोकन न केलेला'));
  });

  test('every text node is announced in its own language: Devanagari never under lang="en", pack text always under lang="en"', () => {
    const orgs = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'organisations.json'), 'utf8'));
    const routes = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'routes.json'), 'utf8'));
    const refusals = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'refusal-responses.json'), 'utf8'));
    const issue077 = issues.find((i) => i.id === '077');
    const englishOnly = new Set(
      [
        pack.disclaimer, pack.dateText, pack.workingContext, pack.title, pack.subtitle, pack.purpose,
        `${PACK_STATUS} ${pack.version}`, `077. ${issue077.title}`, issue077.title, issue077.raise.join(', '), issue077.possibleChange,
        VALIDATION_QUOTE, APPENDIX_A_INTRO, ORGANISATIONS_CAVEAT, routes.caveat, ...FOUR_QUESTIONS,
        ...orgs.items.map((o) => o.status), ...orgs.items.map((o) => o.documentedRelevance),
        ...routes.items.map((r) => r.description), ...routes.items.map((r) => `${r.code} — ${r.name}`),
        ...refusals.items.map((r) => r.response), ...refusals.items.map((r) => r.situation),
      ].map((text) => escapeHtml(text)),
    );
    let checkedEnglish = 0;
    let checkedDevanagari = 0;
    for (const [file, html] of pages) {
      if (!/^(hi|mr)\//.test(file)) continue;
      const pageLang = file.slice(0, 2);
      for (const node of textNodes(html)) {
        const text = node.text.trim().replace(/^— /, '');
        if (DEVANAGARI.test(text)) {
          checkedDevanagari++;
          assert.ok(node.lang === 'hi' || node.lang === 'mr', `${file}: "${text.slice(0, 40)}" at ${node.path} is announced as ${node.lang}`);
          // The other language's name in the switcher and on the about page is deliberately marked.
          if (node.lang !== pageLang) assert.ok(node.marked, `${file}: "${text.slice(0, 40)}" at ${node.path} is ${node.lang} on a ${pageLang} page without an explicit lang`);
        }
        if (englishOnly.has(text)) {
          checkedEnglish++;
          assert.equal(node.lang, 'en', `${file}: English pack text "${text.slice(0, 60)}" at ${node.path} is announced as ${node.lang}`);
        }
      }
    }
    assert.ok(checkedDevanagari > 1000, `checked ${checkedDevanagari} Devanagari text nodes`);
    assert.ok(checkedEnglish > 1000, `checked ${checkedEnglish} English text nodes`);
  });

  test('every page in every language passes the shared checks and links resolve across languages, including base-URL links', () => {
    for (const [file, html] of pages) {
      assert.match(html, /<html lang="(en|hi|mr)">/, file);
      assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${file}: one h1`);
      assert.match(html, /<main id="main" tabindex="-1"/, file);
      assert.match(html, /<a class="skip-link" href="#main">/, file);
      assert.doesNotMatch(html, /undefined|\[object Object\]/, file);
      assert.ok(html.includes(escapeHtml(pack.disclaimer)), `${file}: disclaimer`);
      const levels = headingLevels(html);
      for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1] + 1, `${file}: heading skip`);
      const dir = path.posix.dirname(file);
      for (const m of html.matchAll(/\b(?:href|src)="([^"#]*)(?:#[^"]*)?"/g)) {
        const ref = m[1];
        if (!ref) continue;
        if (ref.startsWith(result.baseUrl)) {
          const target = ref.slice(result.baseUrl.length);
          if (target) assert.ok(files.has(target), `${file}: ${ref} -> ${target} is never written`);
          continue;
        }
        if (/^(https?:|mailto:)/.test(ref)) continue;
        const target = path.posix.normalize(path.posix.join(dir, ref.split('?')[0]));
        assert.ok(files.has(target), `${file}: ${ref} -> ${target}`);
      }
    }
    const notFound = pages.get('404.html');
    assert.doesNotMatch(notFound, /hi\/404\.html|mr\/404\.html|hreflang/, '404.html does not point at per-language copies that do not exist');
  });

  test('unknown language codes fail with every problem listed, from the API and from the command line', () => {
    assert.throws(
      () => build({ out: path.join(tmp, 'bad-lang'), langs: ['xx', 'yy'] }),
      (error) => /No i18n file for language "xx"/.test(error.message) && /No i18n file for language "yy"/.test(error.message) && error.problems.length === 2,
    );
    assert.throws(() => build({ out: path.join(tmp, 'bad-lang-2'), langs: ['../en'] }), /Invalid language code/);
    const run = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'build-site.mjs'), '--lang', 'xx', '--lang', 'yy', '--out', path.join(tmp, 'bad-lang-cli')], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /build-site: 2 problem\(s\) found; nothing was written:\n {2}- No i18n file for language "xx".*\n {2}- No i18n file for language "yy"/);
    assert.ok(!fs.existsSync(path.join(tmp, 'bad-lang-cli')));
  });
});

describe('hostile fixtures', () => {
  test('hostile titles, names and Markdown links are escaped and never become markup or javascript: links', () => {
    const root = makeFixture('escaping', ({ json, write, append }) => {
      const data = json('data/issues.json');
      data.find((i) => i.id === '077').title = 'Ration <script>alert("x")</script> & "quotes"';
      write('data/issues.json', data);
      const orgs = json('data/organisations.json');
      orgs.items.find((o) => o.id === 'org-05').name = 'MKSS <b>& "Co"</b>';
      write('data/organisations.json', orgs);
      const routes = json('data/routes.json');
      routes.items.find((r) => r.code === 'A').name = 'Administrative <img src=x onerror=alert(1)> "review"';
      write('data/routes.json', routes);
      append('content/pack/08-a-short-invitation.md', '\n\nSee [here](javascript:alert(1)) and [ok](https://example.org/ok?a=1&b=2) and <https://example.org/auto>.\n');
    });
    const out = path.join(root, 'out');
    build({ root, out, langs: ['en', 'hi'] });
    const pages = readPages(out);
    for (const [file, html] of pages) {
      assert.doesNotMatch(html, /<script>alert|<img|<b>&/, `${file}: raw markup from data`);
      assert.doesNotMatch(html, /\b(?:href|src)="\s*javascript:/i, `${file}: javascript: link`);
    }
    const issue = pages.get('issues/077.html');
    assert.ok(issue.includes('<h1>077. Ration &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quotes&quot;</h1>'));
    assert.ok(issue.includes('<title>077. Ration &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quotes&quot; · Public Voice Between Elections</title>'));
    assert.ok(issue.includes('05. MKSS &lt;b&gt;&amp; &quot;Co&quot;&lt;/b&gt;</a>'));
    assert.ok(issue.includes('<span class="badge badge-A">A</span> Administrative &lt;img src=x onerror=alert(1)&gt; &quot;review&quot;</a>'), 'route link text escaped');
    const list = pages.get('issues/index.html');
    assert.ok(list.includes('title="Administrative &lt;img src=x onerror=alert(1)&gt; &quot;review&quot;"'), 'route badge title attribute escaped');
    assert.match(list, /data-text="077 ration &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &quot;quotes&quot;/);
    assert.match(list, /<option value="A">A — Administrative &lt;img src=x onerror=alert\(1\)&gt; &quot;review&quot;<\/option>/);
    const contribute = pages.get('contribute.html');
    assert.ok(contribute.includes('See [here](javascript:alert(1)) and <a href="https://example.org/ok?a=1&amp;b=2">ok</a> and <a href="https://example.org/auto">https://example.org/auto</a>.'));
    const index = JSON.parse(fs.readFileSync(path.join(out, 'search-index.json'), 'utf8'));
    assert.equal(index[76].title, 'Ration <script>alert("x")</script> & "quotes"', 'JSON keeps the raw text; it is data, not markup');
    assert.ok(pages.get('hi/issues/077.html').includes('<h1 lang="en">077. Ration &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quotes&quot;</h1>'));
  });

  test('a javascript: URL in a data file stops the build before anything is written', () => {
    const root = makeFixture('unsafe-url', ({ json, write }) => {
      const orgs = json('data/organisations.json');
      orgs.items[0].officialEvidenceUrl = 'javascript:alert(1)';
      write('data/organisations.json', orgs);
    });
    const out = path.join(root, 'out');
    assert.throws(() => build({ root, out }), /Unsafe URL "javascript:alert\(1\)": only http, https and mailto links are allowed/);
    assert.ok(!fs.existsSync(out), 'nothing written');
    const root2 = makeFixture('unsafe-source-url', ({ json, write }) => {
      const sources = json('data/sources.json');
      sources.items[0].url = 'data:text/html,<script>alert(1)</script>';
      write('data/sources.json', sources);
    });
    assert.throws(() => build({ root: root2, out: path.join(root2, 'out') }), /Unsafe URL "data:text\/html/);
  });

  test('a path-like issue id is rejected with a clear message and writes nothing outside the out dir', () => {
    const root = makeFixture('path-id', ({ json, write }) => {
      const data = json('data/issues.json');
      data.find((i) => i.id === '021').id = '../../escaped';
      write('data/issues.json', data);
      const domains = json('data/domains.json');
      const d03 = domains.find((d) => d.id === 'd03');
      d03.issueIds = d03.issueIds.map((id) => (id === '021' ? '../../escaped' : id));
      write('data/domains.json', domains);
    });
    const out = path.join(root, 'deep', 'out');
    assert.throws(
      () => build({ root, out }),
      (error) => error.problems.includes('issues.json: unsafe issue id "../../escaped" (expected three digits)'),
    );
    assert.ok(!fs.existsSync(out));
    assert.ok(!fs.existsSync(path.join(root, 'deep', 'escaped.html')) && !fs.existsSync(path.join(root, 'escaped.html')));
    const root2 = makeFixture('path-slug', ({ json, write }) => {
      const domains = json('data/domains.json');
      domains[0].slug = '../evil';
      write('data/domains.json', domains);
    });
    assert.throws(() => build({ root: root2, out: path.join(root2, 'out') }), /domains\.json: d01 has an unsafe slug "\.\.\/evil"/);
    assert.ok(!fs.existsSync(path.join(root2, 'evil.html')));
  });

  test('an id mismatch in domains.json is a data error, not a TypeError, and every problem is reported at once', () => {
    const root = makeFixture('bad-refs', ({ json, write }) => {
      const domains = json('data/domains.json');
      domains[0].issueIds[6] = '7';
      write('data/domains.json', domains);
      const data = json('data/issues.json');
      data.find((i) => i.id === '050').challengeRoutes.push('Z');
      write('data/issues.json', data);
      const orgs = json('data/organisations.json');
      orgs.items[1].agendaIssueIds.push('999');
      write('data/organisations.json', orgs);
    });
    assert.throws(
      () => build({ root, out: path.join(root, 'out') }),
      (error) =>
        error.problems.length === 3 &&
        error.problems.includes('domains.json: d01 lists unknown issue "7"') &&
        error.problems.includes('issues.json: 050 has unknown route "Z"') &&
        error.problems.includes('organisations.json: org-02 links unknown issue "999"') &&
        error.message.includes('Cannot build the site from') &&
        error.problems.every((problem) => error.message.includes(problem)),
    );
  });

  test('keys missing from a translation fail the build and are all listed', () => {
    const root = makeFixture('missing-keys', ({ json, write }) => {
      const strings = json('i18n/hi.json');
      delete strings['nav.home'];
      delete strings['issue.raise'];
      write('i18n/hi.json', strings);
    });
    const out = path.join(root, 'out');
    assert.throws(
      () => build({ root, out, langs: ['en', 'hi'] }),
      (error) => error.problems.length === 1 && /i18n\/hi\.json is missing 2 key\(s\): nav\.home, issue\.raise/.test(error.problems[0]),
    );
    assert.ok(!fs.existsSync(out));
    assert.doesNotThrow(() => build({ root, out, langs: ['en'] }), 'the English build does not need hi.json');
  });
});

describe('preview server', () => {
  test('content types and path containment', () => {
    assert.equal(contentTypeFor('a/b.html'), 'text/html; charset=utf-8');
    assert.equal(contentTypeFor('styles.CSS'), 'text/css; charset=utf-8');
    assert.equal(contentTypeFor('x.json'), 'application/json; charset=utf-8');
    assert.equal(contentTypeFor('x.xml'), 'application/xml; charset=utf-8');
    assert.equal(contentTypeFor('x.bin'), 'application/octet-stream');
    const root = path.resolve(tmp, 'en');
    assert.equal(resolveWithinRoot(root, '/issues/077.html'), path.join(root, 'issues', '077.html'));
    assert.equal(resolveWithinRoot(root, '/'), root);
    assert.equal(resolveWithinRoot(root, '/../../etc/passwd'), path.join(root, 'etc', 'passwd'), 'leading .. segments cannot escape the root');
    assert.equal(resolveWithinRoot(root, '/issues/../../x'), path.join(root, 'x'));
    assert.equal(resolveWithinRoot(root, 'issues/077.html'), path.join(root, 'issues', '077.html'), 'missing leading slash is tolerated');
  });

  test('languageRoots finds the top-level and per-language roots, so a --lang hi build can be previewed', () => {
    assert.deepEqual(languageRoots(path.join(tmp, 'en')), ['']);
    assert.deepEqual(languageRoots(path.join(tmp, 'multi')), ['', 'hi/', 'mr/']);
    const hiOnly = path.join(tmp, 'hi-only');
    const result = build({ out: hiOnly, langs: ['hi'] });
    assert.deepEqual(result.langs, ['hi']);
    assert.ok(!fs.existsSync(path.join(hiOnly, 'index.html')));
    assert.ok(fs.existsSync(path.join(hiOnly, 'hi', 'index.html')));
    assert.deepEqual(languageRoots(hiOnly), ['hi/']);
    assert.match(fs.readFileSync(path.join(hiOnly, '404.html'), 'utf8'), /<html lang="hi">/, '404.html uses the first requested language');
    const empty = path.join(tmp, 'empty');
    fs.mkdirSync(empty);
    assert.deepEqual(languageRoots(empty), []);
    assert.deepEqual(languageRoots(path.join(tmp, 'does-not-exist')), []);
  });

  test('serves the built site: index for directories, redirects, content types, site 404', async () => {
    const root = path.join(tmp, 'en');
    const server = createServer(root);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    const base = `http://127.0.0.1:${port}`;
    try {
      const home = await fetch(`${base}/`);
      assert.equal(home.status, 200);
      assert.equal(home.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.match(await home.text(), /<title>Home · Public Voice Between Elections<\/title>/);

      const redirect = await fetch(`${base}/issues`, { redirect: 'manual' });
      assert.equal(redirect.status, 301);
      assert.equal(redirect.headers.get('location'), '/issues/');

      const issuesIndex = await fetch(`${base}/issues/`);
      assert.equal(issuesIndex.status, 200);
      assert.match(await issuesIndex.text(), /The 100 public-interest issue families/);

      const css = await fetch(`${base}/assets/styles.css`);
      assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
      assert.equal(css.headers.get('x-content-type-options'), 'nosniff');

      const json = await fetch(`${base}/data/issues.json`);
      assert.equal(json.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal((await json.json()).length, 100);

      const missing = await fetch(`${base}/deep/path/does-not-exist.html`);
      assert.equal(missing.status, 404);
      const body = await missing.text();
      assert.match(body, /<h1>Page not found<\/h1>/);
      assert.match(body, /<style>/);
      assert.doesNotMatch(body, /<link|<script/, 'the served 404 requests nothing, at any depth');

      const traversal = await fetch(`${base}/..%2F..%2Fpackage.json`);
      assert.notEqual(traversal.status, 200);

      const post = await fetch(`${base}/`, { method: 'POST' });
      assert.equal(post.status, 405);

      const head = await fetch(`${base}/robots.txt`, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('content-type'), 'text/plain; charset=utf-8');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
