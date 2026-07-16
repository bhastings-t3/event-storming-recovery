/**
 * The `es-view` local server: one node:http process, one port, serving
 *   - GET /api/model    the resolved model + provenance (source, repoRoot)
 *   - GET /api/health   liveness
 *   - the built SPA (static files from distDir), with SPA fallback to index.html
 *
 * Phase 2 adds /api/source and the /mcp endpoint to this same server so the web
 * UI and any connected Claude session share one in-memory state.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

function serveStatic(res, distDir, urlPath) {
  // Resolve within distDir; reject traversal. Unknown paths fall back to index.html (SPA routing).
  const rel = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  let filePath = path.resolve(distDir, rel);
  if (!filePath.startsWith(path.resolve(distDir))) { res.writeHead(403).end('Forbidden'); return; }
  if (!rel || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('SPA build not found. Run `npm run build` (the published package ships a prebuilt dist).');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'content-type': CONTENT_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

/**
 * @param {object} opts
 * @param {{ model, source, sourcePath, repoRoot, warnings }} opts.resolved - result of resolveModel()
 * @param {string} opts.distDir - directory of built SPA assets
 * @returns {http.Server}
 */
export function createServer({ resolved, distDir }) {
  return http.createServer((req, res) => {
    const url = req.url || '/';

    if (url === '/api/health') return sendJson(res, 200, { ok: true });

    if (url.split('?')[0] === '/api/model') {
      return sendJson(res, 200, {
        model: resolved.model,
        meta: {
          source: resolved.source,
          sourcePath: resolved.sourcePath,
          repoRoot: resolved.repoRoot,
          warnings: resolved.warnings || [],
        },
      });
    }

    if (url.startsWith('/api/')) return sendJson(res, 404, { error: 'unknown endpoint' });

    return serveStatic(res, distDir, url);
  });
}

/**
 * Listen on the first free port at/after `port`. Resolves with { server, url, port }.
 */
export function startServer({ resolved, distDir, host = '127.0.0.1', port = 5178 }) {
  const server = createServer({ resolved, distDir });
  return new Promise((resolve, reject) => {
    const tryListen = (p, attemptsLeft) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 0) { tryListen(p + 1, attemptsLeft - 1); }
        else reject(err);
      });
      server.listen(p, host, () => resolve({ server, url: `http://${host}:${p}`, port: p }));
    };
    tryListen(port, 20);
  });
}

/** The package root (two levels up from src/server/). */
export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
