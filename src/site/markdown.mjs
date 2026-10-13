/**
 * Minimal Markdown converter for the pack sections in content/pack/*.md.
 *
 * Supported, and nothing else (docs/architecture.md, Module 3):
 *   - headings `#` to `####`
 *   - paragraphs
 *   - bullet lists written with `- `
 *   - links `[text](url)` and autolinks `<https://url>`
 *   - **bold**, *italics*
 *
 * All text is HTML-escaped before any inline syntax is applied, so the
 * source document can never inject markup, and a link is only emitted for
 * an `http:`, `https:` or `mailto:` URL (see `isSafeUrl`); `[text](javascript:…)`
 * stays literal text. YAML frontmatter is stripped and returned as a flat
 * object of strings and `[a, b]` arrays.
 *
 * @module site/markdown
 */

/**
 * Escape the five HTML-significant characters.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * True when a URL may be emitted as a link target: absolute `http:`, `https:` or
 * `mailto:` only. Everything else (`javascript:`, `data:`, `vbscript:`, relative paths,
 * protocol-relative `//host`) is refused so that neither the source document nor a
 * data file can turn a link into executable or unexpected navigation.
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  return /^(?:https?:\/\/[^\s/?#]+[^\s]*|mailto:[^\s@]+@[^\s@]+)$/i.test(String(url).trim());
}

/**
 * Turn heading text into a URL-safe id fragment.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

/**
 * Parse a single YAML frontmatter scalar: quoted string, `[a, b]` list or bare string.
 * Numbers and booleans stay strings; the pack only needs string values.
 * @param {string} raw
 * @returns {string | string[]}
 */
function parseScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => unquote(item.trim()));
  }
  return unquote(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1).replace(/\\(["'\\])/g, '$1');
    }
  }
  return value;
}

/**
 * Split optional YAML frontmatter from a Markdown document.
 *
 * @param {string} text
 * @returns {{ frontmatter: Record<string, string | string[]>, body: string }}
 */
export function parseFrontmatter(text) {
  const source = String(text).replace(/\r\n?/g, '\n');
  /** @type {Record<string, string | string[]>} */
  const frontmatter = {};
  if (!source.startsWith('---\n')) return { frontmatter, body: source };
  const end = source.indexOf('\n---', 4);
  if (end === -1) return { frontmatter, body: source };
  const afterClose = end + 4;
  // The closing fence must be a whole line.
  if (afterClose < source.length && source[afterClose] !== '\n') return { frontmatter, body: source };
  const block = source.slice(4, end);
  for (const line of block.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (!key) continue;
    frontmatter[key] = parseScalar(line.slice(colon + 1));
  }
  const body = source.slice(afterClose).replace(/^\n+/, '');
  return { frontmatter, body };
}

/**
 * Render inline Markdown (autolinks, links, bold, italics) on escaped text.
 * @param {string} text raw (unescaped) text
 * @returns {string} HTML
 */
export function renderInline(text) {
  // NUL never occurs in Markdown text; it marks the slots where rendered links are parked
  // while emphasis is applied, so a `*` inside a URL can never become an <em> in an href.
  let html = escapeHtml(text).replace(/\0/g, '');
  /** @type {string[]} */
  const links = [];
  /** @param {string} anchor @returns {string} */
  const park = (anchor) => `\0${links.push(anchor) - 1}\0`;
  // <https://url> autolinks; the text is already escaped so the brackets are entities.
  html = html.replace(/&lt;(https?:\/\/[^\s<>]+?)&gt;/g, (_m, url) => (isSafeUrl(url) ? park(`<a href="${url}">${url}</a>`) : `&lt;${url}&gt;`));
  // [text](url); one level of balanced parentheses is allowed inside the URL.
  // The URL has been escaped with the rest of the text, so `&amp;` is already correct in an attribute.
  html = html.replace(/\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (match, label, url) =>
    isSafeUrl(url) ? park(`<a href="${url}">${emphasis(label)}</a>`) : match,
  );
  html = emphasis(html);
  return html.replace(/\0(\d+)\0/g, (_m, index) => links[Number(index)]);
}

/**
 * Apply `**bold**` and `*italics*` to escaped text. Markers must hug their text: `a * b` and
 * `2*3` are not emphasis.
 * @param {string} html
 * @returns {string}
 */
function emphasis(html) {
  return html
    .replace(/\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?!\s)([^*\n]+?)(?<!\s)\*/g, '<em>$1</em>');
}

/**
 * @typedef {object} MarkdownOptions
 * @property {number} [headingShift=0] add this many levels to every heading (clamped to h6)
 * @property {string | null} [idPrefix=null] when a string, headings get `id="<prefix><slug>"`
 * @property {boolean} [dropFirstHeading=false] omit the first heading (when the page supplies its own h1)
 */

/**
 * Convert a Markdown document to HTML.
 *
 * @param {string} text
 * @param {MarkdownOptions} [options]
 * @returns {{ html: string, frontmatter: Record<string, string | string[]>, headings: Array<{ level: number, text: string, id: string | null }> }}
 */
export function markdownToHtml(text, options = {}) {
  const { headingShift = 0, idPrefix = null, dropFirstHeading = false } = options;
  const { frontmatter, body } = parseFrontmatter(text);
  const lines = body.split('\n');
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  let paragraph = [];
  /** @type {string[]} */
  let list = [];
  /** @type {Array<{ level: number, text: string, id: string | null }>} */
  const headings = [];
  /** @type {Map<string, number>} */
  const usedIds = new Map();
  let droppedHeading = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      out.push(`<ul>\n${list.map((item) => `  <li>${renderInline(item)}</li>`).join('\n')}\n</ul>`);
      list = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,4})\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const headingText = heading[2].trim();
      if (dropFirstHeading && !droppedHeading) {
        droppedHeading = true;
        continue;
      }
      const level = Math.min(6, heading[1].length + headingShift);
      let id = null;
      if (typeof idPrefix === 'string') {
        const base = `${idPrefix}${slugify(headingText)}`;
        const seen = usedIds.get(base) || 0;
        usedIds.set(base, seen + 1);
        id = seen === 0 ? base : `${base}-${seen + 1}`;
      }
      headings.push({ level, text: headingText, id });
      const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
      out.push(`<h${level}${idAttr}>${renderInline(headingText)}</h${level}>`);
      continue;
    }
    const bullet = /^\s*-\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return { html: out.join('\n'), frontmatter, headings };
}
