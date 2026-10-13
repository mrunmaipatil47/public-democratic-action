/**
 * `routes.html`: Appendix B with the caveat.
 * @module site/pages/routes
 */

import { escapeHtml as e, issueLink, langAttr, layout } from '../html.mjs';

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const ctx = base.forPage('routes.html');
  const { t, site } = ctx;
  const la = langAttr(ctx);
  const { routes, issues } = site.data;

  const sections = routes.items
    .map((route) => {
      const named = issues.filter((issue) => issue.challengeRoutes.includes(route.code));
      const links = named.map((issue) => issueLink(ctx, issue, { idOnly: true })).join(', ');
      return `<section id="${e(route.code)}" class="route card" aria-labelledby="route-${e(route.code)}-heading">
<h2 id="route-${e(route.code)}-heading"${la}><span class="badge badge-${e(route.code)}">${e(route.code)}</span> ${e(route.name)}</h2>
<p${la}>${e(route.description)}</p>
<p class="count">${e(t('routes.named', { count: named.length }))}</p>
<p class="id-list"><span class="label">${e(t('routes.issuesLink'))}:</span> ${links}</p>
</section>`;
    })
    .join('\n');

  const body = `<h1>${e(t('routes.heading'))}</h1>
<p class="intro">${e(t('routes.intro'))}</p>
${sections}
<p class="caveat"${la}>${e(routes.caveat)}</p>`;

  return [
    {
      path: 'routes.html',
      html: layout(ctx, { title: t('routes.title'), description: t('routes.description'), nav: 'routes', body }),
    },
  ];
}
