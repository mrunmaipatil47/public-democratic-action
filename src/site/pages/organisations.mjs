/**
 * `organisations.html`: 13 cards with status verbatim, both links and agenda links as links.
 * @module site/pages/organisations
 */

import { dl, en, escapeHtml as e, externalLink, issueLink, langAttr, layout } from '../html.mjs';
import { must, sectionByNumber } from '../load.mjs';
import { orgNumber } from './shared.mjs';

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const ctx = base.forPage('organisations.html');
  const { t, site } = ctx;
  const la = langAttr(ctx);
  const organisations = site.data.organisations;
  const section = sectionByNumber(site, 7);

  const cards = organisations.items
    .map((org) => {
      const agenda = org.agendaIssueIds.map((id) => issueLink(ctx, must(site.index.issuesById.get(id), `issue ${id}`), { idOnly: true })).join(', ');
      const fields = dl([
        [t('org.relevance'), en(ctx, e(org.documentedRelevance))],
        [t('org.agenda'), `<span class="agenda-text"${la}>${e(org.agendaLinksText)}</span>: ${agenda}`],
        [t('org.contribution'), en(ctx, e(org.suggestedRemoteContribution))],
      ]);
      return `<article class="card org" id="${e(org.id)}" aria-labelledby="${e(org.id)}-heading">
<h2 id="${e(org.id)}-heading"${la}>${e(orgNumber(org.number))}. ${e(org.name)}</h2>
${fields}
<p class="status"><strong>${e(t('org.status'))}:</strong> ${en(ctx, e(org.status))}</p>
<ul class="links">
  <li>${externalLink(ctx, org.officialEvidenceUrl, e(t('org.evidence')))}</li>
  <li>${externalLink(ctx, org.publicRouteUrl, e(t('org.route')))}</li>
</ul>
</article>`;
    })
    .join('\n');

  const body = `<h1${la}>${e(String(section.section))}. ${e(section.title)}</h1>
<p class="selection-basis"${la}>${e(organisations.selectionBasis)}</p>
${cards}
<p class="network-lead"${la}>${e(organisations.additionalNetworkLead)}</p>`;

  return [
    {
      path: 'organisations.html',
      html: layout(ctx, { title: t('organisations.title'), description: t('organisations.description'), nav: 'organisations', body }),
    },
  ];
}
