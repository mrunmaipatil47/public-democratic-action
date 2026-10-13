/**
 * `domains/<slug>.html` ×10.
 * @module site/pages/domains
 */

import { domainHeading, en, escapeHtml as e, issueRow, langAttr, layout, ul } from '../html.mjs';
import { must } from '../load.mjs';
import { routeKey } from './issues.mjs';

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const { domains } = base.site.data;
  return domains.map((domain, i) => {
    const pagePath = `domains/${domain.slug}.html`;
    const ctx = base.forPage(pagePath);
    const { t, site, relRoot } = ctx;
    const la = langAttr(ctx);
    const prev = domains[i - 1];
    const next = domains[i + 1];
    const rows = domain.issueIds.map((id) => issueRow(ctx, must(site.index.issuesById.get(id), `issue ${id}`))).join('\n');
    const pager = [
      prev ? `<a rel="prev" href="${e(prev.slug)}.html">${e(t('domain.previous'))}: ${en(ctx, e(domainHeading(prev)))}</a>` : '',
      `<a href="${relRoot}issues/index.html">${e(t('issue.allIssues'))}</a>`,
      next ? `<a rel="next" href="${e(next.slug)}.html">${e(t('domain.next'))}: ${en(ctx, e(domainHeading(next)))}</a>` : '',
    ].filter(Boolean);

    const body = `<h1${la}>${e(domainHeading(domain))}</h1>
<p class="count">${e(t('domain.count', { count: domain.issueIds.length }))}</p>
${routeKey(ctx)}
<ul class="issue-list">
${rows}
</ul>
<nav aria-label="${e(t('domain.pagination'))}" class="pager">
${ul(pager)}
</nav>`;

    return {
      path: pagePath,
      html: layout(ctx, {
        title: domainHeading(domain),
        description: t('domain.description', { from: domain.range[0], to: domain.range[1], name: domain.name }),
        nav: 'issues',
        body,
      }),
    };
  });
}
