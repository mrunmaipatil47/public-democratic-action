#!/usr/bin/env node
/**
 * Zero-dependency static file server for local preview of the generated site.
 *
 *   node scripts/serve.mjs [--dir site] [--port 8080] [--host 127.0.0.1]
 *   PORT=3000 node scripts/serve.mjs
 *
 * Serves files with correct content types, `index.html` for directories (redirecting
 * `/dir` to `/dir/` so relative links resolve) and the site's own `404.html` for
 * missing paths. It binds to 127.0.0.1 by default and is for local preview only.
 * A build without English (`--lang hi`) has no top-level index.html; the server then
 * starts anyway and prints the language roots it found (`http://…/hi/`).
 *
 * @module scripts/serve
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Content types by extension; anything else is served as application/octet-stream. */
export const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/**
 * @param {string} filePath
 * @returns {string}
 */
export function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Resolve a URL path to a file inside `rootDir`, or null when it escapes the root.
 * @param {string} rootDir absolute
 * @param {string} urlPath decoded pathname beginning with `/`
 * @returns {string | null}
 */
export function resolveWithinRoot(rootDir, urlPath) {
  const normalised = path.posix.normalize(urlPath.replace(/\\/g, '/'));
  const candidate = path.resolve(rootDir, `.${normalised.startsWith('/') ? normalised : `/${normalised}`}`);
  if (candidate !== rootDir && !candidate.startsWith(rootDir + path.sep)) return null;
  return candidate;
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} body
 * @param {string} [type]
 */
function sendText(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} filePath
 * @param {number} [status]
 */
function sendFile(req, res, filePath, status = 200) {
  const stat = fs.statSync(filePath);
  res.writeHead(status, {
    'Content-Type': contentTypeFor(filePath),
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

/**
 * Create the preview server for a directory.
 * @param {string} rootDir
 * @returns {import('node:http').Server}
 */
export function createServer(rootDir) {
  const root = path.resolve(rootDir);
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendText(res, 405, 'Method not allowed\n');
      return;
    }
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      sendText(res, 400, 'Bad request\n');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      sendText(res, 400, 'Bad request\n');
      return;
    }
    if (pathname.includes('\0')) {
      sendText(res, 400, 'Bad request\n');
      return;
    }
    const target = resolveWithinRoot(root, pathname);
    if (!target) {
      sendText(res, 403, 'Forbidden\n');
      return;
    }
    let filePath = target;
    let stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    if (stat && stat.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${encodeURI(pathname)}/${url.search}` });
        res.end();
        return;
      }
      filePath = path.join(filePath, 'index.html');
      stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    }
    if (!stat || !stat.isFile()) {
      const notFound = path.join(root, '404.html');
      if (fs.existsSync(notFound)) {
        sendFile(req, res, notFound, 404);
      } else {
        sendText(res, 404, 'Not found\n');
      }
      return;
    }
    sendFile(req, res, filePath);
  });
}

/** A folder named like a BCP 47 language code (`hi`, `mr`, `pa-Guru`), as build-site.mjs writes them. */
const LANGUAGE_FOLDER = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/**
 * The language roots inside a built site: `''` when `dir/index.html` exists, plus every
 * `<code>/` folder (named like a language code) that has its own index.html. Empty when
 * nothing is built. `issues/index.html` is a page, not a root.
 * @param {string} dir absolute
 * @returns {string[]} prefixes such as `['', 'hi/']`
 */
export function languageRoots(dir) {
  /** @type {string[]} */
  const roots = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return roots;
  if (fs.existsSync(path.join(dir, 'index.html'))) roots.push('');
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && LANGUAGE_FOLDER.test(entry.name) && fs.existsSync(path.join(dir, entry.name, 'index.html'))) {
      roots.push(`${entry.name}/`);
    }
  }
  return roots;
}

const USAGE = `Usage: node scripts/serve.mjs [--dir site] [--port 8080] [--host 127.0.0.1]

Local preview only. PORT and HOST environment variables are honoured.
`;

/**
 * @param {string[]} argv
 * @returns {import('node:http').Server | null}
 */
export function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string', default: path.resolve(here, '..', 'site') },
      port: { type: 'string', default: process.env.PORT || '8080' },
      host: { type: 'string', default: process.env.HOST || '127.0.0.1' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return null;
  }
  const dir = path.resolve(values.dir);
  const roots = languageRoots(dir);
  if (!roots.length) {
    throw new Error(`${dir} has no index.html (nor <lang>/index.html); run "node scripts/build-site.mjs" first`);
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port "${values.port}"`);
  const server = createServer(dir);
  server.listen(port, values.host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const base = `http://${values.host}:${actualPort}/`;
    process.stdout.write(`Serving ${dir} at ${base} (local preview; Ctrl+C to stop)\n`);
    for (const root of roots) {
      if (root) process.stdout.write(`  language root: ${base}${root}\n`);
    }
  });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`serve: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
