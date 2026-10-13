/**
 * `contribute.html`: the eight contribution types, the form fields, the issue forms
 * and the section 8 invitation as a copyable block.
 * @module site/pages/contribute
 */

import { CONTRIBUTING_URL, ISSUE_FORMS_URL, en, escapeHtml as e, externalLink, langAttr, layout, ul } from '../html.mjs';
import { sectionByNumber } from '../load.mjs';
import { renderSection, renderSectionIntro } from './shared.mjs';

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const ctx = base.forPage('contribute.html');
  const { t, site } = ctx;
  const la = langAttr(ctx);
  const types = site.data.contributionTypes;
  const s6 = sectionByNumber(site, 6);
  const s8 = sectionByNumber(site, 8);

  const typeItems = types.items.map((item) => `<strong>${e(item.name)}</strong>: ${e(item.description)}`);
  const fieldItems = types.form.fields.map((field) => e(field));
  const invitation = renderSection(s8, { dropFirstHeading: true, idPrefix: null });

  const body = `<h1${la}>${e(String(s6.section))}. ${e(s6.title)}</h1>
${en(ctx, renderSectionIntro(s6), 'div')}
<section id="types">
<h2>${e(t('contribute.types'))}</h2>
${ul(typeItems, 'contribution-types', la)}
</section>
<section id="form">
<h2>${e(t('contribute.form'))}</h2>
<p>${e(t('contribute.formIntro'))}</p>
<ol class="form-fields"${la}>
${fieldItems.map((item) => `  <li>${item}</li>`).join('\n')}
</ol>
<p class="caveat"${la}>${e(types.form.caveat)}</p>
</section>
<section id="submit">
<h2>${e(t('contribute.submit'))}</h2>
<p>${e(t('contribute.submitText'))}</p>
${ul([externalLink(ctx, ISSUE_FORMS_URL, e(t('contribute.formsLink'))), externalLink(ctx, CONTRIBUTING_URL, e(t('contribute.guideLink')))])}
</section>
<section id="invitation-section">
<h2${la}>${e(String(s8.section))}. ${e(s8.title)}</h2>
<p>${e(t('contribute.invitationIntro'))}</p>
<blockquote id="invitation" class="invitation"${la} data-copy-label="${e(t('contribute.copy'))}" data-copied="${e(t('contribute.copied'))}" data-failed="${e(t('contribute.copyFailed'))}">
${invitation}
</blockquote>
<div id="invitation-actions" class="actions no-print"></div>
</section>`;

  return [
    {
      path: 'contribute.html',
      html: layout(ctx, { title: t('contribute.title'), description: t('contribute.description'), nav: 'contribute', body }),
    },
  ];
}
