/**
 * `about.html`: provenance, versions, licences, AI-assisted notice, how to re-import.
 * @module site/pages/about
 */

import { ISSUE_FORMS_URL, REPO_URL, dl, en, escapeHtml as e, externalLink, langAttr, layout, ul } from '../html.mjs';
import { packVersionLabel } from './shared.mjs';

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const ctx = base.forPage('about.html');
  const { t, site, langs } = ctx;
  const la = langAttr(ctx);
  const pack = site.data.pack;

  const versions = dl([
    [t('about.packVersion'), en(ctx, e(packVersionLabel(pack)))],
    [t('about.packDate'), `<time datetime="${e(pack.date)}">${en(ctx, e(pack.dateText))}</time>`],
    [t('about.sourceDoc'), externalLink(ctx, pack.sourceDocument, e(t('footer.source')))],
    [t('about.importer'), `<code>tools/import-pack.py</code> (${externalLink(ctx, REPO_URL, e(t('footer.repository')))})`],
    [t('about.generator'), '<code>scripts/build-site.mjs</code>'],
  ]);

  const languageItems = langs.map((info) => {
    const status = t(`about.langStatus.${info.status}`);
    return `<span lang="${e(info.code)}">${e(info.name)}</span> (<code>${e(info.code)}</code>) — ${e(status)}`;
  });

  const body = `<h1>${e(t('about.heading'))}</h1>
<section id="provenance">
<h2>${e(t('about.provenance'))}</h2>
<p>${e(t('about.provenanceText'))}</p>
</section>
<section id="versions">
<h2>${e(t('about.versions'))}</h2>
${versions}
</section>
<section id="licences">
<h2>${e(t('about.licences'))}</h2>
<p>${e(t('about.licenceCodeText'))}</p>
<p>${e(t('about.licenceContentText'))}</p>
</section>
<section id="ai-notice">
<h2>${e(t('about.aiNotice'))}</h2>
<p${la}>${e(pack.aiAssistedNotice)}</p>
<h3>${e(t('about.workingContext'))}</h3>
<p${la}>${e(pack.workingContext)}</p>
</section>
<section id="reimport">
<h2>${e(t('about.reimport'))}</h2>
<p>${e(t('about.reimportText'))}</p>
<pre><code>npm run import
npm run validate
npm run build</code></pre>
</section>
<section id="accessibility">
<h2>${e(t('about.accessibility'))}</h2>
<p>${e(t('about.accessibilityText'))}</p>
<p>${externalLink(ctx, ISSUE_FORMS_URL, e(t('about.accessibilityForm')))}</p>
</section>
<section id="languages">
<h2>${e(t('about.languages'))}</h2>
<p>${e(t('about.languagesText'))}</p>
${ul(languageItems)}
</section>
<section id="corrections">
<h2>${e(t('about.corrections'))}</h2>
<p>${e(t('about.correctionsText'))} ${externalLink(ctx, ISSUE_FORMS_URL, e(t('issue.correct')))}</p>
</section>`;

  return [
    {
      path: 'about.html',
      html: layout(ctx, { title: t('about.title'), description: t('about.description'), nav: 'about', body }),
    },
  ];
}
