/**
 * `index.html`: why, the four questions, the commitments, the three routes and calls to action.
 * @module site/pages/home
 */

import { en, escapeHtml as e, langAttr, layout, ul } from '../html.mjs';
import { sectionByNumber } from '../load.mjs';
import { FOUR_QUESTIONS, packVersionLabel, renderSection } from './shared.mjs';

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const ctx = base.forPage('index.html');
  const { t, site, relRoot } = ctx;
  const la = langAttr(ctx);
  const pack = site.data.pack;
  const commitments = site.data.commitments;
  const participation = site.data.participationRoutes;

  const why = en(ctx, renderSection(sectionByNumber(site, 1)), 'div');

  const questions = `<ol class="questions"${la}>\n${FOUR_QUESTIONS.map((q) => `  <li>${e(q)}</li>`).join('\n')}\n</ol>`;

  const commitmentItems = commitments.items.map(
    (item) => `<strong>${e(item.name)}</strong>: ${e(item.description)}`,
  );

  const routeBlocks = participation.items
    .map(
      (route) => `<section class="card" id="route-${e(route.id)}"${la}>
<h3>${e(route.name)}</h3>
<p>${e(route.text)}</p>
</section>`,
    )
    .join('\n');

  const ctas = [
    [`${relRoot}issues/index.html`, t('home.cta.issues')],
    [`${relRoot}routes.html`, t('home.cta.routes')],
    [`${relRoot}process.html`, t('home.cta.process')],
    [`${relRoot}organisations.html`, t('home.cta.organisations')],
    [`${relRoot}contribute.html`, t('home.cta.contribute')],
    [`${relRoot}print/pack.html`, t('home.cta.print')],
  ].map(([href, label]) => `<a href="${href}">${e(label)}</a>`);

  const body = `<h1${la}>${e(pack.title)}</h1>
<p class="lead"${la}>${e(pack.subtitle)}</p>
<p class="tagline"${la}>${e(pack.tagline)}</p>
<p class="meta"${la}>${e(packVersionLabel(pack))} · <time datetime="${e(pack.date)}">${e(pack.dateText)}</time> · ${e(pack.purpose)}</p>
<section id="why">
${why}
</section>
<section id="questions">
<h2>${e(t('home.fourQuestions'))}</h2>
${questions}
</section>
<section id="commitments">
<h2>${e(t('home.commitments'))}</h2>
${ul(commitmentItems, 'commitments', la)}
<p class="caveat"${la}>${e(commitments.caveat)}</p>
</section>
<section id="routes">
<h2>${e(t('home.threeRoutes'))}</h2>
${routeBlocks}
<p class="caveat"${la}>${e(participation.caveat)}</p>
</section>
<section id="start">
<h2>${e(t('home.start'))}</h2>
${ul(ctas, 'cta')}
</section>`;

  return [
    {
      path: 'index.html',
      html: layout(ctx, { title: t('home.title'), description: t('home.description'), nav: 'home', body }),
    },
  ];
}
