/**
 * `organising-cycle.html`: section 9 as written.
 * @module site/pages/cycle
 */

import { en, layout } from '../html.mjs';
import { sectionByNumber } from '../load.mjs';
import { renderSection } from './shared.mjs';

/**
 * @param {import('../../../scripts/build-site.mjs').BuildContext} base
 * @returns {Array<{ path: string, html: string }>}
 */
export function render(base) {
  const ctx = base.forPage('organising-cycle.html');
  const { t, site } = ctx;
  const s9 = sectionByNumber(site, 9);
  // The section's own `# 9. First organising cycle` heading is the page h1.
  const body = en(ctx, renderSection(s9, { headingShift: 0 }), 'div');
  return [
    {
      path: 'organising-cycle.html',
      html: layout(ctx, { title: t('cycle.title'), description: t('cycle.description'), nav: 'cycle', body }),
    },
  ];
}
