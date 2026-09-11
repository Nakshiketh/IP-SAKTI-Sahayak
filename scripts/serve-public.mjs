/**
 * One origin for a public demo: the built web app, and the API behind /api.
 *
 * The app fetches `/api/...` relative and ships `connect-src 'self'`, so a
 * deployment that serves the two from different origins is blocked by the app's
 * own content policy. This is the smallest thing that satisfies it: static files
 * from `frontend/dist`, everything under `/api` piped to the FastAPI process.
 *
 * Piped, not buffered — `/api/v1/query` answers in NDJSON as the stages finish,
 * and a proxy that collects the body before forwarding it would turn the stage
 * timings into a single blob that arrives at the end.
 *
 * No dependencies, so it needs no install of its own.
 *
 *   node scripts/serve-public.mjs [--port 8080] [--api http://127.0.0.1:8000]
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { basename, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'frontend', 'dist');

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const PORT = Number(flag('port', process.env.PORT ?? '8080'));
const API = new URL(flag('api', process.env.SAHAYAK_API_TARGET ?? 'http://127.0.0.1:8000'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  // Media. Worth stating why these matter more than the rest of the table:
  // every response here carries `X-Content-Type-Options: nosniff`, so a type
  // this map does not know is served as application/octet-stream and the
  // browser is then forbidden from guessing. The failure is silent — a <video>
  // simply falls back to its poster with no console error — so a missing entry
  // looks like a broken asset rather than a broken content type.
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
};

/**
 * The response headers a deployment owes the app, from docs/SECURITY.md.
 *
 * `frame-ancestors` is the reason this exists: it is ignored in a meta element,
 * so the built `index.html` cannot carry it and only the thing serving the file
 * can. The document's own policy is already in the file and is not repeated.
 */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "frame-ancestors 'none'",
  // camera=(self): badge sign-in scans with it. `camera=()` blocks getUserMedia
  // outright, before the browser ever asks the user.
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
};

function proxy(request, response) {
  const upstream = http.request(
    {
      protocol: API.protocol,
      hostname: API.hostname,
      port: API.port || 80,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: API.host },
    },
    (upstreamResponse) => {
      // Hop-by-hop headers describe the connection to the API, not the one to
      // the browser, and this process frames its own response. Dropped rather
      // than forwarded, so the framing of the stream is decided in one place.
      const headers = { ...upstreamResponse.headers };
      for (const name of ['transfer-encoding', 'connection', 'keep-alive', 'upgrade']) {
        delete headers[name];
      }
      response.writeHead(upstreamResponse.statusCode ?? 502, headers);
      // The stages arrive one line at a time; forward each as it lands.
      upstreamResponse.pipe(response);
    },
  );

  upstream.on('error', (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    response.end(
      JSON.stringify({
        code: 'upstream_unreachable',
        message: `The API at ${API.origin} did not answer: ${error.message}`,
      }),
    );
  });

  request.pipe(upstream);
}

function serveFile(path, response, status = 200) {
  const headers = {
    'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
    ...SECURITY_HEADERS,
  };
  // Only a content-addressed name may be cached forever, and living under
  // `assets/` is not the same as having one: everything Vite copies out of
  // `public/` keeps its own filename, so `hero.mp4` and `hero-poster.jpg` sit
  // beside the hashed bundles while being fully mutable. Caching those as
  // immutable pins whatever the browser saw first — including a wrong content
  // type — for a year, and no amount of fixing the server dislodges it.
  const hashed = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(basename(path));
  headers['Cache-Control'] = hashed ? 'public, max-age=31536000, immutable' : 'no-cache';
  response.writeHead(status, headers);
  createReadStream(path).pipe(response);
}

const server = http.createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;

  if (path === '/api' || path.startsWith('/api/')) return proxy(request, response);

  // normalize() first, so a request for ../../.env cannot leave dist.
  const candidate = join(DIST, normalize(path).replace(/^([/\\])+/, ''));
  if (candidate.startsWith(DIST) && existsSync(candidate) && statSync(candidate).isFile()) {
    return serveFile(candidate, response);
  }

  // Client-side routing: every unknown path is a route, not a missing file.
  const index = join(DIST, 'index.html');
  if (!existsSync(index)) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('frontend/dist is not built. Run: npm --prefix frontend run build\n');
  }
  return serveFile(index, response, path === '/' ? 200 : 200);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`serving ${DIST}\n`);
  process.stdout.write(`  /api -> ${API.origin}\n`);
  process.stdout.write(`  http://127.0.0.1:${PORT}\n`);
});
