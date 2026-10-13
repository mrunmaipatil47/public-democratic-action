/**
 * `print/pack.html`: the whole pack on one printable page — sections 1–9, all 100 cards,
 * the routes and the sources — for offline and postal use.
 * @module site/pages/print
 */

import { dl, domainHeading, en, escapeHtml as e, joinText, langAttr, layout } from '../html.mjs';
import { must } from '../load.mjs';
import { APPENDIX_A_INTRO, packVersionLabel, renderSection } from './shared.mjs';
import { sourceItem } from './sources.mjs';

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const ctx = base.forPage('print/pack.html');
  const { t, site } = ctx;
  const la = langAttr(ctx);
  const { pack, domains, routes, sources } = site.data;
  const { issuesById, routesByCode } = site.index;

  // `lang` sits on each section itself (not on a wrapper) so that assets/print.css can keep
  // addressing `.pack-section` siblings for page breaks.
  const sections = site.sections
    .map((section) => `<section id="s${section.section}" class="pack-section"${la}>\n${renderSection(section)}\n</section>`)
    .join('\n');

  const cards = domains
    .map((domain) => {
      const items = domain.issueIds
        .map((id) => {
          const issue = must(issuesById.get(id), `issue ${id}`);
          const routeText = issue.challengeRoutes
            .map((code) => {
              const route = must(routesByCode.get(code), `route ${code}`);
              return `<a href="#pb-${e(code)}"${la}>${e(code)} — ${e(route.name)}</a>`;
            })
            .join('; ');
          return `<article class="card issue-card" id="pa-${e(issue.id)}">
<h4${la}>${e(issue.id)}. ${e(issue.title)}</h4>
${dl([
  [t('issue.raise'), en(ctx, joinText(issue.raise))],
  [t('issue.answer'), en(ctx, issue.answer.map((a) => e(a)).join('; '))],
  [t('issue.change'), en(ctx, e(issue.possibleChange))],
  [t('issue.evidence'), en(ctx, joinText(issue.evidence))],
  [t('issue.routes'), routeText],
])}
</article>`;
        })
        .join('\n');
      return `<h3 id="pa-${e(domain.id)}"${la}>${e(domainHeading(domain))}</h3>\n${items}`;
    })
    .join('\n');

  const routeBlocks = routes.items
    .map(
      (route) => `<h3 id="pb-${e(route.code)}"${la}>${e(route.code)} — ${e(route.name)}</h3>
<p${la}>${e(route.description)}</p>`,
    )
    .join('\n');

  const sourceItems = sources.items.map((item) => `  <li value="${e(String(item.number))}">${sourceItem(ctx, item)}</li>`).join('\n');

  const toc = [
    ...site.sections.map((s) => `<a href="#s${s.section}"${la}>${e(String(s.section))}. ${e(s.title)}</a>`),
    `<a href="#appendix-a">${e(t('print.appendixA'))}</a>`,
    `<a href="#appendix-b">${e(t('print.appendixB'))}</a>`,
    `<a href="#appendix-c">${e(t('print.appendixC'))}</a>`,
  ]
    .map((link) => `  <li>${link}</li>`)
    .join('\n');

  const body = `<h1${la}>${e(pack.title)}</h1>
<p class="lead"${la}>${e(pack.subtitle)}</p>
<p class="tagline"${la}>${e(pack.tagline)}</p>
<p class="meta"${la}>${e(packVersionLabel(pack))} · <time datetime="${e(pack.date)}">${e(pack.dateText)}</time> · ${e(pack.purpose)}</p>
<p class="hint no-print">${e(t('print.hint'))}</p>
<nav aria-label="${e(t('print.contents'))}" class="toc">
<h2>${e(t('print.contents'))}</h2>
<ol>
${toc}
</ol>
</nav>
${sections}
<section id="appendix-a" class="pack-section">
<h2>${e(t('print.appendixA'))}</h2>
<p${la}>${e(APPENDIX_A_INTRO)}</p>
${cards}
</section>
<section id="appendix-b" class="pack-section">
<h2>${e(t('print.appendixB'))}</h2>
${routeBlocks}
<p class="caveat"${la}>${e(routes.caveat)}</p>
</section>
<section id="appendix-c" class="pack-section">
<h2>${e(t('print.appendixC'))}</h2>
<p${la}>${e(sources.intro)}</p>
<ol class="sources">
${sourceItems}
</ol>
</section>
<section id="closing" class="pack-section">
<h2>${e(t('print.closing'))}</h2>
<p${la}>${e(pack.workingContext)}</p>
<p${la}>${e(pack.aiAssistedNotice)}</p>
</section>`;

  return [
    {
      path: 'print/pack.html',
      html: layout(ctx, { title: t('print.title'), description: t('print.description'), nav: '', body, mainClass: 'print-pack' }),
    },
  ];
}
