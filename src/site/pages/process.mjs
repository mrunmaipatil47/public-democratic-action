/**
 * `process.html`: sections 3, 4 and 5 — participation routes, existing foundations,
 * the process-targets table and the refusal responses.
 * @module site/pages/process
 */

import { en, escapeHtml as e, langAttr, layout, table, unescapeBrackets } from '../html.mjs';
import { sectionByNumber } from '../load.mjs';
import { capitalise, renderSection } from './shared.mjs';

/** The pack names a day type with one of these words; a target whose description has neither leaves it unspecified. */
const DAY_TYPE_WORDS = /\b(calendar|working)\b/i;
/** The pack names a starting point with phrases such as "of admission"; otherwise it is unspecified. */
const FROM_WORDS = /\b(?:of|from|after|on) (?:admission|receipt)\b/i;

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const ctx = base.forPage('process.html');
  const { t, site } = ctx;
  const la = langAttr(ctx);
  const targets = site.data.processTargets;
  const refusals = site.data.refusalResponses;
  const s3 = sectionByNumber(site, 3);
  const s4 = sectionByNumber(site, 4);
  const s5 = sectionByNumber(site, 5);

  // `dayType` and `from` exist for every target because the workflow prototype needs them, but
  // the pack's own sentence states them only for some. Where the target's description (which
  // mirrors the pack's clause) names neither, the cell says so instead of presenting the
  // project's reading as the pack's text.
  const notStated = `<span class="not-stated">${e(t('process.notStated'))}</span>`;
  const targetRows = targets.targets.map((target) => {
    // `overridableByLaw` targets already carry "unless governing law specifies otherwise" in their description.
    const dayTypeStated = DAY_TYPE_WORDS.test(target.description);
    const fromStated = FROM_WORDS.test(target.description);
    const applies = Array.isArray(target.appliesTo) ? en(ctx, e(target.appliesTo.join(', '))) : e(t('process.appliesAll'));
    return [
      en(ctx, e(capitalise(target.stage))),
      en(ctx, e(target.description)),
      e(String(target.days)),
      `${e(t(`process.dayType.${target.dayType}`))}${dayTypeStated ? '' : ` ${notStated}`}`,
      `${e(t(`process.from.${target.from}`))}${fromStated ? '' : ` ${notStated}`}`,
      applies,
    ];
  });

  const targetsTable = table({
    id: 'targets-table',
    caption: t('process.targetsCaption'),
    head: [
      t('process.col.stage'),
      t('process.col.target'),
      t('process.col.days'),
      t('process.col.dayType'),
      t('process.col.from'),
      t('process.col.appliesTo'),
    ],
    rows: targetRows,
    className: 'targets',
  });

  // The data keeps each response exactly as the pack's bullet continues after "Situation:", so
  // it starts in lower case; a table cell reads as a sentence, so only the first letter changes.
  const refusalTable = table({
    id: 'refusals-table',
    caption: t('process.refusalsCaption'),
    head: [t('process.col.situation'), t('process.col.response')],
    rows: refusals.items.map((item) => [en(ctx, e(item.situation)), en(ctx, e(capitalise(item.response)))]),
    className: 'refusals',
  });

  const law = targets.existingLawReference;

  const body = `<h1>${e(t('process.heading'))}</h1>
<section id="section-3">
${en(ctx, renderSection(s3), 'div')}
</section>
<section id="section-4">
${en(ctx, renderSection(s4), 'div')}
<h3 id="targets">${e(t('process.targets'))}</h3>
${targetsTable}
<p class="caveat"${la}>${e(targets.caveat)}</p>
<p class="caveat">${e(t('process.targetsNote'))}</p>
<h3 id="existing-law">${e(t('process.existingLaw'))}</h3>
<p${la}>${e(unescapeBrackets(law.text))}</p>
<p class="caveat"${la}>${e(law.note)}</p>
</section>
<section id="section-5">
<h2 id="s5-when-power-refuses-to-listen"${la}>${e(String(s5.section))}. ${e(s5.title)}</h2>
${refusalTable}
<p class="caveat"${la}>${e(refusals.caveat)}</p>
</section>`;

  return [
    {
      path: 'process.html',
      html: layout(ctx, { title: t('process.title'), description: t('process.description'), nav: 'process', body }),
    },
  ];
}
