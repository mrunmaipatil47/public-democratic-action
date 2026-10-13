/**
 * `404.html`. A host serves this page for any missing path, so its links cannot be
 * relative to a known depth; they use the configured base URL instead. This is the
 * one page that does not use relative links, and so it is also the one page that
 * loads no stylesheet and no script: it carries a small inline `<style>` and makes
 * no request to any origin (see `STANDALONE_STYLE` in src/site/html.mjs).
 * @module site/pages/not-found
 */

import { escapeHtml as e, layout, ul } from '../html.mjs';

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const absoluteRoot = `${base.baseUrl}${base.langInfo.prefix}`;
  // Only this language: 404.html is written once, so a switcher or `hreflang` alternates would
  // point at `<base>/<code>/404.html`, which no build writes.
  const ctx = { ...base.forPage('404.html', absoluteRoot), langs: [base.langInfo] };
  const { t } = ctx;
  const body = `<h1>${e(t('notFound.title'))}</h1>
<p>${e(t('notFound.text'))}</p>
${ul([
  `<a href="${e(absoluteRoot)}index.html">${e(t('notFound.home'))}</a>`,
  `<a href="${e(absoluteRoot)}issues/index.html">${e(t('notFound.issues'))}</a>`,
])}`;
  return [
    {
      path: '404.html',
      html: layout(ctx, { title: t('notFound.title'), description: t('notFound.description'), nav: '', body, standalone: true }),
    },
  ];
}
