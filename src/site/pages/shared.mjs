/**
 * Pack text that lives only in the source document (not in data/ or content/pack/)
 * and helpers shared by several page renderers. Every constant below is quoted
 * verbatim from content/source/public-voice-between-elections-v0.1.md.
 *
 * @module site/pages/shared
 */

import { markdownToHtml } from '../markdown.mjs';

/** Appendix A, introductory sentence (source line "Each card names examples of…"). */
export const APPENDIX_A_INTRO =
  'Each card names examples of who can raise it, an indicative owner, possible lawful changes, evidence to collect and conditional refusal routes. Owners require current state/sector validation. No evidence listed below is asserted to have already been collected.';

/** Appendix A, the two validation sentences quoted on every issue page. */
export const VALIDATION_QUOTE =
  'Owners require current state/sector validation. No evidence listed below is asserted to have already been collected.';

/** Section 1, the four questions the process is built around. */
export const FOUR_QUESTIONS = [
  'Who can raise an issue?',
  'Who must answer?',
  'What can change?',
  'What happens when power refuses to listen?',
];

/** Appendix B heading in the source document. */
export const APPENDIX_B_TITLE = 'What the challenge routes mean';

/** Section 7, the caveat sentence from the selection basis, quoted above every organisation list. */
export const ORGANISATIONS_CAVEAT =
  'Willingness, capacity, affiliation with the movement and remote arrangements remain unconfirmed for every entry.';

/**
 * The pack's own status word from its title block (source line 4: "Draft v0.1 | 13 October
 * 2026 | Prepared for discussion, correction and possible collaboration"). data/pack.json
 * carries only `version: "v0.1"`, so the word is kept here and shown with the version
 * wherever the version appears. tests/site.test.mjs checks the whole line against the source.
 */
export const PACK_STATUS = 'Draft';

/**
 * The version as the pack labels itself: `Draft v0.1`.
 * @param {{ version: string }} pack
 * @returns {string}
 */
export function packVersionLabel(pack) {
  return `${PACK_STATUS} ${pack.version}`;
}

/**
 * Render a pack section's Markdown with the heading levels shifted so the
 * section heading becomes an `h2` under the page's own `h1`.
 * @param {import('../load.mjs').PackSection} section
 * @param {{ headingShift?: number, dropFirstHeading?: boolean, idPrefix?: string | null }} [options]
 * @returns {string}
 */
export function renderSection(section, options = {}) {
  const { headingShift = 1, dropFirstHeading = false, idPrefix = `s${section.section}-` } = options;
  return markdownToHtml(section.body, { headingShift, dropFirstHeading, idPrefix }).html;
}

/**
 * The paragraphs of a section that come before its first bullet list,
 * excluding the heading. Used where a page renders the list itself from data.
 * @param {import('../load.mjs').PackSection} section
 * @returns {string} HTML paragraphs
 */
export function renderSectionIntro(section) {
  const lines = section.body.split('\n');
  /** @type {string[]} */
  const kept = [];
  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) break;
    if (/^#{1,6}\s/.test(line)) continue;
    kept.push(line);
  }
  return markdownToHtml(kept.join('\n')).html;
}

/**
 * Two-digit organisation number, as printed in the pack (`01`…`13`).
 * @param {number} number
 * @returns {string}
 */
export function orgNumber(number) {
  return String(number).padStart(2, '0');
}

/**
 * Capitalise the first letter of a short label.
 * @param {string} text
 * @returns {string}
 */
export function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
