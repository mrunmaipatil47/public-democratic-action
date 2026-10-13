/**
 * `sources.html`: Appendix C.
 * @module site/pages/sources
 */

import { en, escapeHtml as e, langAttr, layout, safeUrl } from '../html.mjs';
import { packVersionLabel } from './shared.mjs';

/**
 * A source entry: title linked, URL shown in full for offline and postal use.
 * The title and the URL are pack text; the hidden "(external site)" suffix is chrome.
 * @param {import('../html.mjs').PageContext} ctx
 * @param {{ title: string, url: string }} item
 * @returns {string}
 */
export function sourceItem(ctx, item) {
  return `<a href="${safeUrl(item.url)}" rel="noopener">${en(ctx, e(item.title))}<span class="visually-hidden"> ${e(ctx.t('link.external'))}</span></a><br><span class="url"${langAttr(ctx)}>${e(item.url)}</span>`;
}

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const ctx = base.forPage('sources.html');
  const { t, site } = ctx;
  const la = langAttr(ctx);
  const sources = site.data.sources;
  const pack = site.data.pack;

  const items = sources.items.map((item) => `  <li value="${e(String(item.number))}">${sourceItem(ctx, item)}</li>`).join('\n');

  const body = `<h1>${e(t('sources.heading'))}</h1>
<p class="intro"${la}>${e(sources.intro)}</p>
<ol class="sources">
${items}
</ol>
<section id="pack-source">
<h2>${e(t('sources.packSource'))}</h2>
<p>${e(t('sources.packSourceText'))}</p>
<p>${sourceItem(ctx, { title: `${pack.title} (${packVersionLabel(pack)}, ${pack.dateText})`, url: pack.sourceDocument })}</p>
<p class="caveat"${la}>${e(pack.workingContext)}</p>
</section>`;

  return [
    {
      path: 'sources.html',
      html: layout(ctx, { title: t('sources.title'), description: t('sources.description'), nav: 'sources', body }),
    },
  ];
}
