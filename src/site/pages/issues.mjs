/**
 * `issues/index.html` (all 100 grouped by domain with a no-JS-safe filter form)
 * and `issues/<id>.html` ×100.
 * @module site/pages/issues
 */

import {
  ISSUE_BRIEF_URL,
  ISSUE_FORMS_URL,
  dl,
  domainHeading,
  en,
  escapeHtml as e,
  externalLink,
  issueRow,
  joinText,
  langAttr,
  layout,
  routeBadge,
  routeLink,
  ul,
} from '../html.mjs';
import { must } from '../load.mjs';
import { APPENDIX_A_INTRO, ORGANISATIONS_CAVEAT, VALIDATION_QUOTE, orgNumber } from './shared.mjs';

/**
 * Route key paragraph: every badge followed by its full name.
 * @param {import('../html.mjs').PageContext} ctx
 * @returns {string}
 */
export function routeKey(ctx) {
  const la = langAttr(ctx);
  const items = ctx.site.data.routes.items
    .map((route) => `<li>${routeBadge(ctx, route)} <span${la}>${e(route.name)}</span></li>`)
    .join('\n');
  return `<section class="route-key" aria-labelledby="route-key-heading">
<h2 id="route-key-heading">${e(ctx.t('issues.routeKey'))}</h2>
<ul class="route-key-list">
${items}
</ul>
</section>`;
}

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  return [renderIndex(base), ...renderIssuePages(base)];
}

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {{ path: string, html: string }}
 */
function renderIndex(base) {
  const ctx = base.forPage('issues/index.html');
  const { t, site, relRoot } = ctx;
  const la = langAttr(ctx);
  const { issues, domains, routes } = site.data;
  const total = issues.length;

  const domainOptions = domains
    .map((d) => `      <option value="${e(d.id)}"${la}>${e(domainHeading(d))}</option>`)
    .join('\n');
  const routeOptions = routes.items
    .map((r) => `      <option value="${e(r.code)}"${la}>${e(r.code)} — ${e(r.name)}</option>`)
    .join('\n');

  // No `action` attribute: the default is the document's own URL, which is what a GET filter
  // form without JavaScript should reload (an empty `action=""` is invalid HTML).
  const form = `<form id="issue-filter" class="filter" method="get">
  <fieldset>
    <legend>${e(t('issues.filter.legend'))}</legend>
    <div class="control">
      <label for="filter-domain">${e(t('issues.filter.domain'))}</label>
      <select id="filter-domain" name="domain">
      <option value="">${e(t('issues.filter.all'))}</option>
${domainOptions}
      </select>
    </div>
    <div class="control">
      <label for="filter-route">${e(t('issues.filter.route'))}</label>
      <select id="filter-route" name="route">
      <option value="">${e(t('issues.filter.all'))}</option>
${routeOptions}
      </select>
    </div>
    <div class="control">
      <label for="filter-q">${e(t('issues.filter.text'))}</label>
      <input type="search" id="filter-q" name="q" aria-describedby="filter-q-hint" autocomplete="off">
      <p id="filter-q-hint" class="hint">${e(t('issues.filter.textHint'))}</p>
    </div>
    <div class="control actions">
      <button type="submit">${e(t('issues.filter.submit'))}</button>
      <button type="reset" data-reset-label="${e(t('issues.filter.reset'))}">${e(t('issues.filter.reset'))}</button>
    </div>
  </fieldset>
  <noscript><p class="hint">${e(t('issues.filter.noscript'))}</p></noscript>
</form>
<p id="issue-count" class="count" aria-live="polite" data-template="${e(t('issues.count', { shown: '{shown}', total: '{total}' }))}" data-none="${e(t('issues.noMatch'))}" data-total="${total}">${e(t('issues.count', { shown: total, total }))}</p>`;

  const groups = domains
    .map((domain) => {
      const rows = domain.issueIds.map((id) => issueRow(ctx, must(site.index.issuesById.get(id), `issue ${id}`))).join('\n');
      return `<section class="domain-group" data-domain-group="${e(domain.id)}" aria-labelledby="heading-${e(domain.id)}">
<h2 id="heading-${e(domain.id)}"><a href="${relRoot}domains/${e(domain.slug)}.html"${la}>${e(domainHeading(domain))}</a></h2>
<ul class="issue-list">
${rows}
</ul>
</section>`;
    })
    .join('\n');

  const body = `<h1>${e(t('issues.heading'))}</h1>
<p class="intro"${la}>${e(APPENDIX_A_INTRO)}</p>
${form}
${routeKey(ctx)}
${groups}`;

  return {
    path: 'issues/index.html',
    html: layout(ctx, { title: t('issues.title'), description: t('issues.description'), nav: 'issues', body, mainClass: 'issues-index' }),
  };
}

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
function renderIssuePages(base) {
  const { issues } = base.site.data;
  return issues.map((issue, i) => renderIssue(base, issue, issues[i - 1], issues[i + 1]));
}

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @param {import('../load.mjs').Issue} issue
 * @param {import('../load.mjs').Issue | undefined} prev
 * @param {import('../load.mjs').Issue | undefined} next
 * @returns {{ path: string, html: string }}
 */
function renderIssue(base, issue, prev, next) {
  const pagePath = `issues/${issue.id}.html`;
  const ctx = base.forPage(pagePath);
  const { t, site, relRoot } = ctx;
  const la = langAttr(ctx);
  const { routesByCode, domainsById, orgsByIssueId } = site.index;
  const domain = must(domainsById.get(issue.domainId), `domain ${issue.domainId}`);
  const routes = issue.challengeRoutes.map((code) => must(routesByCode.get(code), `route ${code}`));
  const heading = `${issue.id}. ${issue.title}`;

  // One link per route, with the code as a badge inside it, so the letter is not printed twice.
  const routeItems = routes.map((route) => routeLink(ctx, route, { badge: true }));

  const fields = dl(
    [
      [t('issue.raise'), en(ctx, joinText(issue.raise))],
      [t('issue.answer'), en(ctx, issue.answer.map((a) => e(a)).join('; '))],
      [t('issue.change'), en(ctx, e(issue.possibleChange))],
      [t('issue.evidence'), en(ctx, joinText(issue.evidence))],
      [t('issue.routes'), ul(routeItems, 'route-links')],
    ],
    'fields card',
  );

  // Route names and definitions are pack text, so the whole list is English.
  const meanings = dl(
    routes.map((route) => [`${route.code} — ${route.name}`, e(route.description)]),
    'fields route-meanings',
    la,
  );

  const orgs = orgsByIssueId.get(issue.id) || [];
  const orgList = orgs.length
    ? ul(
        orgs.map(
          (org) =>
            `<a href="${relRoot}organisations.html#${e(org.id)}"${la}>${e(orgNumber(org.number))}. ${e(org.name)}</a> <span class="status"${la}>— ${e(org.status)}</span>`,
        ),
        'org-links',
      )
    : `<p>${e(t('issue.noOrganisations'))}</p>`;

  const pager = [
    prev ? `<a rel="prev" href="${e(prev.id)}.html">${e(t('issue.previous'))}: ${en(ctx, `${e(prev.id)}. ${e(prev.title)}`)}</a>` : '',
    `<a href="index.html">${e(t('issue.allIssues'))}</a>`,
    next ? `<a rel="next" href="${e(next.id)}.html">${e(t('issue.next'))}: ${en(ctx, `${e(next.id)}. ${e(next.title)}`)}</a>` : '',
  ].filter(Boolean);

  const body = `<p class="domain-link">${e(t('issue.domain'))}: <a href="${relRoot}domains/${e(domain.slug)}.html"${la}>${e(domainHeading(domain))}</a></p>
<h1${la}>${e(heading)}</h1>
${fields}
<p class="validation-note"><strong>${e(t('issue.validationNote'))}.</strong> ${e(t('issue.validationIntro'))} <q${la}>${e(VALIDATION_QUOTE)}</q></p>
<section id="route-meanings">
<h2>${e(t('issue.routeMeanings'))}</h2>
${meanings}
<p class="caveat"${la}>${e(site.data.routes.caveat)}</p>
</section>
<section id="organisations">
<h2>${e(t('issue.organisations'))}</h2>
<p class="hint">${e(t('issue.organisationsIntro'))} ${en(ctx, e(ORGANISATIONS_CAVEAT))}</p>
${orgList}
</section>
<section id="correct">
<h2>${e(t('issue.correctHeading'))}</h2>
${ul([externalLink(ctx, ISSUE_FORMS_URL, e(t('issue.correct'))), externalLink(ctx, ISSUE_BRIEF_URL, e(t('issue.brief')))])}
</section>
<nav aria-label="${e(t('issue.pagination'))}" class="pager">
${ul(pager)}
</nav>`;

  return {
    path: pagePath,
    html: layout(ctx, {
      title: heading,
      description: `${t('issue.description', { id: issue.id })} ${issue.title}.`,
      nav: 'issues',
      body,
    }),
  };
}
