/**
 * HTML helpers and the shared page layout for the static site.
 *
 * Every string interpolated into markup goes through `escapeHtml` unless it is
 * HTML that this module (or src/site/markdown.mjs) produced itself. Every URL that
 * comes from data goes through `safeUrl`, which refuses anything but http(s) and
 * mailto. Links are always relative to the page via `ctx.relRoot`, so the site
 * works at any base path (GitHub Pages project path, local file, artifact preview).
 *
 * Language marking: the chrome is in `ctx.lang`; the pack content is English in
 * every build. `langAttr(ctx)` and `en(ctx, …)` mark English content on
 * non-English pages so assistive technology announces each part in the right
 * language (WCAG 3.1.2). On English pages they emit nothing.
 *
 * @module site/html
 */

import { must } from './load.mjs';
import { escapeHtml, isSafeUrl } from './markdown.mjs';
import { packVersionLabel } from './pages/shared.mjs';

export { escapeHtml, isSafeUrl };

/** GitHub repository that hosts the code, data and issue forms. */
export const REPO_URL = 'https://github.com/mrunmaipatil47/public-democratic-action';
/** The issue-form chooser used for corrections and evidence checks. */
export const ISSUE_FORMS_URL = `${REPO_URL}/issues/new/choose`;
/** The one-page issue brief template (docs/, owned by Module 4). `HEAD` resolves to the default branch. */
export const ISSUE_BRIEF_URL = `${REPO_URL}/blob/HEAD/docs/issue-brief-template.md`;
/** CONTRIBUTING.md on the default branch. */
export const CONTRIBUTING_URL = `${REPO_URL}/blob/HEAD/CONTRIBUTING.md`;

/**
 * @typedef {object} LangInfo
 * @property {string} code   BCP 47 code, e.g. `en`
 * @property {string} name   display name in its own language
 * @property {string} prefix output prefix relative to the top-level out dir, `''` or `hi/`
 * @property {string} status `complete` or `draft-unreviewed`
 */

/**
 * @typedef {object} PageContext
 * @property {string} lang            language of the chrome
 * @property {(key: string, params?: Record<string, string | number>) => string} t  translator
 * @property {string} relRoot         prefix from this page to its language root (`''`, `'../'`, or an absolute URL for 404.html)
 * @property {string} pagePath        page path relative to the language root, e.g. `issues/077.html`
 * @property {LangInfo} langInfo      the language being rendered
 * @property {LangInfo[]} langs       every language in this build
 * @property {string} baseUrl         absolute base URL used for sitemap and 404
 * @property {import('./load.mjs').SiteData} site
 */

/**
 * Build a translator over a flat strings object. `{name}` placeholders are replaced from `params`.
 * A key missing from `strings` and `fallback` throws, so a gap never reaches the output; the
 * build additionally checks every language file against en.json before rendering a page, so
 * for hi.json or mr.json a missing key is reported with every other problem, not one at a time.
 *
 * @param {Record<string, string>} strings
 * @param {Record<string, string>} [fallback]
 * @returns {(key: string, params?: Record<string, string | number>) => string}
 */
export function makeTranslator(strings, fallback = {}) {
  return function t(key, params) {
    let value = strings[key];
    if (value === undefined) value = fallback[key];
    if (typeof value !== 'string') throw new Error(`Missing i18n string: ${key}`);
    if (params) {
      for (const [name, replacement] of Object.entries(params)) {
        value = value.split(`{${name}}`).join(String(replacement));
      }
    }
    return value;
  };
}

/**
 * Relative prefix from a page path to its root: `issues/077.html` → `../`.
 * @param {string} pagePath
 * @returns {string}
 */
export function relRootFor(pagePath) {
  const depth = pagePath.split('/').length - 1;
  return '../'.repeat(depth);
}

/**
 * Return a URL that is safe to place in `href`, escaped for an attribute. Throws at build
 * time for any scheme other than http, https or mailto, so a `javascript:` or `data:` URL in
 * a data file stops the build instead of becoming a link.
 * @param {string} url
 * @returns {string} attribute-escaped URL
 */
export function safeUrl(url) {
  if (!isSafeUrl(url)) throw new Error(`Unsafe URL "${url}": only http, https and mailto links are allowed`);
  return escapeHtml(String(url).trim());
}

/**
 * ` lang="en"` on non-English pages, `''` on English ones. Put it on an element whose whole
 * content is pack text (English in every build).
 * @param {Pick<PageContext, 'lang'>} ctx
 * @returns {string}
 */
export function langAttr(ctx) {
  return ctx.lang === 'en' ? '' : ' lang="en"';
}

/**
 * Wrap English pack content in `<span lang="en">` (or another tag) on non-English pages.
 * Use `tag: 'div'` around block-level HTML such as converted Markdown.
 * @param {Pick<PageContext, 'lang'>} ctx
 * @param {string} html already-escaped HTML
 * @param {'span' | 'div'} [tag]
 * @returns {string}
 */
export function en(ctx, html, tag = 'span') {
  return ctx.lang === 'en' ? html : `<${tag} lang="en">${html}</${tag}>`;
}

/**
 * Join plain-text items with commas, escaping each.
 * @param {string[]} items
 * @returns {string}
 */
export function joinText(items) {
  return items.map((item) => escapeHtml(item)).join(', ');
}

/**
 * A `<ul>` of pre-rendered HTML items.
 * @param {string[]} itemsHtml
 * @param {string} [className]
 * @param {string} [attrs] extra attributes, already formatted (e.g. `langAttr(ctx)`)
 * @returns {string}
 */
export function ul(itemsHtml, className, attrs = '') {
  const cls = className ? ` class="${escapeHtml(className)}"` : '';
  return `<ul${cls}${attrs}>\n${itemsHtml.map((item) => `  <li>${item}</li>`).join('\n')}\n</ul>`;
}

/**
 * A `<dl>` of label/value pairs. Values are HTML; labels are escaped.
 * @param {Array<[string, string]>} pairs
 * @param {string} [className]
 * @param {string} [attrs] extra attributes, already formatted (e.g. `langAttr(ctx)`)
 * @returns {string}
 */
export function dl(pairs, className = 'fields', attrs = '') {
  const rows = pairs
    .map(([label, valueHtml]) => `  <div class="field"><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`)
    .join('\n');
  return `<dl class="${escapeHtml(className)}"${attrs}>\n${rows}\n</dl>`;
}

/** Table ids become element ids (`<id>-title`, `<id>-caption`); lower-case, digits and hyphens only. */
const TABLE_ID = /^[a-z][a-z0-9-]*$/;

/**
 * A data table with `<th scope="col">` headers; cells are HTML.
 *
 * A wide table scrolls sideways inside `.table-wrap` at phone widths, so the title is rendered
 * as a block *before* the scroll container (it wraps at the viewport width instead of being
 * clipped with the table) and repeated as a visually hidden `<caption>` that names the table for
 * assistive technology; the visible block is `aria-hidden` so the title is not announced twice.
 * The container is a focusable, labelled region, so keyboard users can reach columns that
 * overflow (WCAG 2.1.1) and hear what the extra tab stop is.
 * @param {{ id: string, caption: string, head: string[], rows: string[][], className?: string, attrs?: string }} spec
 *   `id` must be unique on the page
 * @returns {string}
 */
export function table({ id, caption, head, rows, className = '', attrs = '' }) {
  if (!TABLE_ID.test(id)) throw new Error(`table(): unsafe id "${id}"`);
  const cls = className ? ` class="${escapeHtml(className)}"` : '';
  const thead = head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const tbody = rows
    .map((cells) => `    <tr>${cells.map((cell, i) => (i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`)).join('')}</tr>`)
    .join('\n');
  const title = escapeHtml(caption);
  return (
    `<p class="table-title" id="${id}-title" aria-hidden="true">${title}</p>\n` +
    `<div class="table-wrap" tabindex="0" role="region" aria-labelledby="${id}-caption">\n` +
    `<table${cls}${attrs}>\n  <caption id="${id}-caption" class="visually-hidden">${title}</caption>\n` +
    `  <thead><tr>${thead}</tr></thead>\n  <tbody>\n${tbody}\n  </tbody>\n</table>\n</div>`
  );
}

/**
 * An external link with `rel="noopener"`; the arrow icon comes from CSS, and the
 * visually hidden suffix tells screen-reader users the link leaves the site.
 * @param {PageContext} ctx
 * @param {string} url
 * @param {string} labelHtml
 * @returns {string}
 */
export function externalLink(ctx, url, labelHtml) {
  return `<a href="${safeUrl(url)}" rel="noopener" class="external">${labelHtml}<span class="visually-hidden"> ${escapeHtml(ctx.t('link.external'))}</span></a>`;
}

/**
 * A route-code badge: the letter is always shown, the full name is in `title` and `aria-label`,
 * and the badge links to the route's definition on routes.html.
 * @param {PageContext} ctx
 * @param {{ code: string, name: string }} route
 * @returns {string}
 */
export function routeBadge(ctx, route) {
  const label = ctx.t('issue.route', { code: route.code, name: route.name });
  return `<a class="badge badge-${escapeHtml(route.code)}" href="${ctx.relRoot}routes.html#${escapeHtml(route.code)}" title="${escapeHtml(route.name)}" aria-label="${escapeHtml(label)}">${escapeHtml(route.code)}</a>`;
}

/**
 * A full-name route link: `A — Administrative review`. With `{ badge: true }` the code is shown
 * as a badge inside the one link (`[A] Administrative review`) instead of being printed twice.
 * @param {PageContext} ctx
 * @param {{ code: string, name: string }} route
 * @param {{ badge?: boolean }} [options]
 * @returns {string}
 */
export function routeLink(ctx, route, options = {}) {
  const href = `${ctx.relRoot}routes.html#${escapeHtml(route.code)}`;
  if (options.badge) {
    return `<a class="route-link" href="${href}"${langAttr(ctx)}><span class="badge badge-${escapeHtml(route.code)}">${escapeHtml(route.code)}</span> ${escapeHtml(route.name)}</a>`;
  }
  return `<a href="${href}"${langAttr(ctx)}>${escapeHtml(route.code)} — ${escapeHtml(route.name)}</a>`;
}

/**
 * Link to an issue page.
 * @param {PageContext} ctx
 * @param {{ id: string, title: string }} issue
 * @param {{ idOnly?: boolean }} [options]
 * @returns {string}
 */
export function issueLink(ctx, issue, options = {}) {
  const href = `${ctx.relRoot}issues/${escapeHtml(issue.id)}.html`;
  if (options.idOnly) {
    return `<a href="${href}" aria-label="${escapeHtml(`${issue.id}. ${issue.title}`)}" title="${escapeHtml(issue.title)}"${langAttr(ctx)}>${escapeHtml(issue.id)}</a>`;
  }
  return `<a href="${href}"${langAttr(ctx)}>${escapeHtml(issue.id)}. ${escapeHtml(issue.title)}</a>`;
}

/**
 * One row of the issue list, used on the issues index and the domain pages.
 * The data attributes feed the client-side filter in assets/enhance.js.
 * @param {PageContext} ctx
 * @param {import('./load.mjs').Issue} issue
 * @returns {string}
 */
export function issueRow(ctx, issue) {
  const { routesByCode } = ctx.site.index;
  const badges = issue.challengeRoutes.map((code) => routeBadge(ctx, must(routesByCode.get(code), `route ${code}`))).join(' ');
  const searchable = [
    issue.id,
    issue.title,
    ...issue.raise,
    ...issue.answer,
    issue.possibleChange,
    ...issue.evidence,
  ]
    .join(' ')
    .toLowerCase();
  return (
    `<li class="issue-row" data-issue-row data-id="${escapeHtml(issue.id)}" data-domain="${escapeHtml(issue.domainId)}"` +
    ` data-routes="${escapeHtml(issue.challengeRoutes.join(' '))}" data-text="${escapeHtml(searchable)}">` +
    `<span class="issue-id">${escapeHtml(issue.id)}</span> ` +
    `<a class="issue-title" href="${ctx.relRoot}issues/${escapeHtml(issue.id)}.html"${langAttr(ctx)}>${escapeHtml(issue.title)}</a> ` +
    `<span class="routes">${badges}</span></li>`
  );
}

/**
 * Human-readable domain heading: `001–010. Democracy, public voice and media`.
 * @param {import('./load.mjs').Domain} domain
 * @returns {string}
 */
export function domainHeading(domain) {
  return `${domain.range[0]}–${domain.range[1]}. ${domain.name}`;
}

/**
 * Unescape the importer's `\[Sources 1–3\]` bracket escapes in a pack sentence.
 * @param {string} text
 * @returns {string}
 */
export function unescapeBrackets(text) {
  return text.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
}

const NAV = [
  ['home', 'index.html'],
  ['issues', 'issues/index.html'],
  ['routes', 'routes.html'],
  ['organisations', 'organisations.html'],
  ['process', 'process.html'],
  ['contribute', 'contribute.html'],
  ['cycle', 'organising-cycle.html'],
  ['sources', 'sources.html'],
  ['about', 'about.html'],
];

/**
 * The only stylesheet 404.html gets. A host serves that page at unknown depths, so it cannot
 * load `assets/styles.css` relatively, and loading it from the configured base URL would be a
 * cross-origin request on every other host (local preview, PR previews). These rules mirror the
 * tokens and the basic typography of assets/styles.css and make no request of any kind.
 */
export const STANDALONE_STYLE = `
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1b1b1b; --link: #0b4f9c; --visited: #5b2a86; --surface: #f3f3f0; --border: #c9c9c9; --note-bg: #fff3cd; --note-border: #b45309; --focus: #b45309; }
@media (prefers-color-scheme: dark) { :root { --bg: #14171a; --fg: #e6e6e6; --link: #8fbcf5; --visited: #cdb4f0; --surface: #1f242a; --border: #4b5563; --note-bg: #332b12; --note-border: #f5a524; --focus: #f5a524; } }
html { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif; line-height: 1.55; }
@media (min-width: 48em) { html { font-size: 112.5%; } }
body { margin: 0; background: var(--bg); color: var(--fg); overflow-wrap: break-word; }
.site-header, main, .site-footer { max-width: 70ch; margin-left: auto; margin-right: auto; padding-left: 1rem; padding-right: 1rem; }
a { color: var(--link); } a:visited { color: var(--visited); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.skip-link { position: absolute; top: -100%; left: 1rem; padding: 0.5rem 1rem; background: var(--surface); color: var(--fg); border: 2px solid var(--focus); }
.skip-link:focus { top: 0.5rem; }
.site-header { padding-top: 0.75rem; border-bottom: 1px solid var(--border); }
.site-name { font-weight: 700; margin: 0 0 0.25rem; } .site-name a { color: inherit; text-decoration: none; }
.main-nav ul { list-style: none; padding: 0; margin: 0.25rem 0 0.75rem; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
.disclaimer { background: var(--note-bg); border-left: 4px solid var(--note-border); padding: 0.6rem 1rem; margin: 0.75rem 0; font-size: 0.95rem; }
.site-footer { border-top: 1px solid var(--border); margin-top: 2rem; padding-top: 1rem; font-size: 0.9rem; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
`;

/**
 * @typedef {object} PageSpec
 * @property {string} title        short page name; the layout appends ` · Public Voice Between Elections`
 * @property {string} description  meta description
 * @property {string} nav          current nav key (`home`, `issues`, …) or `''`
 * @property {string} body         inner HTML of `<main>`
 * @property {string} [mainClass]  extra class on `<main>`
 * @property {boolean} [standalone] no stylesheet links, no script and no language switcher; an inline
 *                                  `<style>` instead (404.html, which is served at unknown depths)
 */

/**
 * Wrap a page body in the shared layout.
 * @param {PageContext} ctx
 * @param {PageSpec} page
 * @returns {string}
 */
export function layout(ctx, page) {
  const { t, relRoot, lang, site, langs, langInfo, pagePath } = ctx;
  const pack = site.data.pack;
  const siteName = t('site.name');
  const englishSiteName = site.englishStrings['site.name'];
  const isEnglishChrome = lang === 'en';
  const topRoot = relRoot + (langInfo.prefix ? '../' : '');
  const la = langAttr(ctx);

  // The contract fixes the title suffix to the English site name; a translated name, when it
  // differs, sits between the page name and that constant suffix.
  const titleParts = [page.title, siteName];
  if (siteName !== englishSiteName) titleParts.push(englishSiteName);
  const title = titleParts.map((part) => escapeHtml(part)).join(' · ');

  const navItems = NAV.map(([key, href]) => {
    const current = key === page.nav ? ' aria-current="page"' : '';
    return `      <li><a href="${relRoot}${href}"${current}>${escapeHtml(t(`nav.${key}`))}</a></li>`;
  }).join('\n');

  let languageNav = '';
  let alternates = '';
  if (langs.length > 1 && !page.standalone) {
    const items = langs
      .map((info) => {
        const href = `${topRoot}${info.prefix}${pagePath}`;
        const current = info.code === lang ? ' aria-current="page"' : '';
        return `      <li><a href="${href}" hreflang="${escapeHtml(info.code)}" lang="${escapeHtml(info.code)}"${current}>${escapeHtml(info.name)}</a></li>`;
      })
      .join('\n');
    languageNav = `\n    <nav aria-label="${escapeHtml(t('lang.label'))}" class="lang-nav">\n    <ul>\n${items}\n    </ul>\n    </nav>`;
    alternates = langs
      .filter((info) => info.code !== lang)
      .map((info) => `\n  <link rel="alternate" hreflang="${escapeHtml(info.code)}" href="${topRoot}${info.prefix}${pagePath}">`)
      .join('');
  }

  const translationNotice = isEnglishChrome
    ? ''
    : `\n  <p role="note" class="translation-notice"><span lang="${escapeHtml(lang)}">${escapeHtml(t('lang.notice'))}</span> <span lang="en">${escapeHtml(site.englishStrings['lang.notice'])}</span></p>`;

  const styles = page.standalone
    ? `<style>${STANDALONE_STYLE}</style>`
    : `<link rel="stylesheet" href="${relRoot}assets/styles.css">\n  <link rel="stylesheet" href="${relRoot}assets/print.css" media="print">`;
  const script = page.standalone ? '' : `\n  <script src="${relRoot}assets/enhance.js" defer></script>`;
  const mainClass = page.mainClass ? ` class="${escapeHtml(page.mainClass)}"` : '';

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="referrer" content="no-referrer">
  <title>${title}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  ${styles}${alternates}
</head>
<body>
  <a class="skip-link" href="#main">${escapeHtml(t('site.skipLink'))}</a>
  <header class="site-header">
    <p class="site-name"><a href="${relRoot}index.html">${escapeHtml(siteName)}</a></p>
    <nav aria-label="${escapeHtml(t('nav.label'))}" class="main-nav">
    <ul>
${navItems}
    </ul>
    </nav>${languageNav}${translationNotice}
    <p role="note" class="disclaimer"${la}>${escapeHtml(pack.disclaimer)}</p>
  </header>
  <main id="main" tabindex="-1"${mainClass}>
${page.body}
  </main>
  <footer class="site-footer">
    <p><strong>${escapeHtml(siteName)}</strong> · ${en(ctx, escapeHtml(packVersionLabel(pack)))} · ${escapeHtml(t('footer.date'))} <time datetime="${escapeHtml(pack.date)}">${en(ctx, escapeHtml(pack.dateText))}</time></p>
    <p><a href="${safeUrl(pack.sourceDocument)}" rel="noopener" class="external">${escapeHtml(t('footer.source'))}<span class="visually-hidden"> ${escapeHtml(t('link.external'))}</span></a> · <a href="${REPO_URL}" rel="noopener" class="external">${escapeHtml(t('footer.repository'))}<span class="visually-hidden"> ${escapeHtml(t('link.external'))}</span></a> · <a href="${relRoot}print/pack.html">${escapeHtml(t('footer.print'))}</a> · <a href="${relRoot}organising-cycle.html">${escapeHtml(t('footer.organisingCycle'))}</a></p>
    <p>${escapeHtml(t('footer.licenceCode'))} ${escapeHtml(t('footer.licenceContent'))}</p>
    <p class="ai-notice"${la}>${escapeHtml(pack.aiAssistedNotice)}</p>
  </footer>${script}
</body>
</html>
`;
}
