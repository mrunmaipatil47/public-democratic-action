/**
 * The ordered list of page renderers for one language build.
 * @module site/pages
 */

import * as home from './home.mjs';
import * as issues from './issues.mjs';
import * as domains from './domains.mjs';
import * as routes from './routes.mjs';
import * as organisations from './organisations.mjs';
import * as process from './process.mjs';
import * as contribute from './contribute.mjs';
import * as cycle from './cycle.mjs';
import * as sources from './sources.mjs';
import * as about from './about.mjs';
import * as print from './print.mjs';

/** Renderers for every HTML page inside a language root (404.html is handled separately). */
export const PAGE_RENDERERS = [home, issues, domains, routes, organisations, process, contribute, cycle, sources, about, print];

export * as notFound from './not-found.mjs';
