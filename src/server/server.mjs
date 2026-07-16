/**
 * The `es-view` local server: one node:http process, one port, serving
 *   - GET  /api/model            the resolved model + provenance (source, repoRoot)
 *   - GET  /api/health           liveness
 *   - GET/POST/DELETE /api/selection   the current selection (what the human last clicked)
 *   - GET/POST/DELETE /api/context     the curated context bundle
 *   - GET  /api/source?path&line&ctx   real code behind an anchor
 *   - POST /mcp                  MCP endpoint (mounted by the caller via mcpHandler)
 *   - the built SPA (static files from distDir), with SPA fallback to index.html
 *
 * The web UI and the MCP server share one in-memory `state`, so a click in the browser is
 * visible to a connected Claude session.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndexes } from '../lib/selectors.mjs';
import { buildNodeContext, buildBundleContext } from './context.mjs';
import { readSource } from './source.mjs';

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

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function serveStatic(res, distDir, urlPath) {
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
 * @param {{ model, source, sourcePath, repoRoot, warnings }} opts.resolved
 * @param {string} opts.distDir
 * @param {ReturnType<import('./state.mjs').createState>} opts.state
 * @param {(req,res)=>Promise<boolean>} [opts.mcpHandler]  handles POST/GET/DELETE /mcp; returns true if it took the request
 * @returns {http.Server}
 */
export function createServer({ resolved, distDir, state, mcpHandler }) {
  const services = { model: resolved.model, indexes: buildIndexes(resolved.model), repoRoot: resolved.repoRoot };

  return http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', 'http://localhost');
    const p = url.pathname;

    // ---- MCP (delegated to the mounted handler) ----
    if (p === '/mcp' && mcpHandler) {
      const handled = await mcpHandler(req, res);
      if (handled) return;
    }

    // ---- API ----
    if (p === '/api/health') return sendJson(res, 200, { ok: true });

    if (p === '/api/model') {
      return sendJson(res, 200, {
        model: resolved.model,
        meta: { source: resolved.source, sourcePath: resolved.sourcePath, repoRoot: resolved.repoRoot, warnings: resolved.warnings || [] },
      });
    }

    if (p === '/api/selection') {
      if (method === 'GET') {
        const sel = state.getSelection();
        return sendJson(res, 200, { selection: sel ? buildNodeContext(services, sel.nodeId) : null });
      }
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const nodeId = body && body.nodeId;
        if (nodeId && !services.indexes.nodeById.has(nodeId)) return sendJson(res, 404, { error: `unknown node '${nodeId}'` });
        state.setSelection(nodeId || null);
        return sendJson(res, 200, { selection: nodeId ? buildNodeContext(services, nodeId) : null });
      }
      if (method === 'DELETE') { state.clearSelection(); return sendJson(res, 200, { ok: true }); }
    }

    if (p === '/api/context') {
      if (method === 'GET') {
        const ids = state.getBundle();
        return sendJson(res, 200, { ids, nodes: buildBundleContext(services, ids, { includeSource: false }) });
      }
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const nodeId = body && body.nodeId;
        if (!nodeId || !services.indexes.nodeById.has(nodeId)) return sendJson(res, 404, { error: `unknown node '${nodeId}'` });
        return sendJson(res, 200, { ids: state.addToBundle(nodeId) });
      }
      if (method === 'DELETE') {
        const body = await readJsonBody(req);
        if (body && body.nodeId) return sendJson(res, 200, { ids: state.removeFromBundle(body.nodeId) });
        state.clearBundle();
        return sendJson(res, 200, { ids: [] });
      }
    }

    if (p === '/api/source' && method === 'GET') {
      const relPath = url.searchParams.get('path');
      const line = Number(url.searchParams.get('line')) || undefined;
      const ctx = Number(url.searchParams.get('ctx')) || undefined;
      if (!relPath) return sendJson(res, 400, { error: 'path required' });
      return sendJson(res, 200, readSource(resolved.repoRoot, relPath, line, ctx));
    }

    if (p.startsWith('/api/') || p === '/mcp') return sendJson(res, 404, { error: 'unknown endpoint' });

    return serveStatic(res, distDir, req.url || '/');
  });
}

/** Listen on the first free port at/after `port`. Resolves with { server, url, port }. */
export function startServer({ resolved, distDir, state, mcpHandler, host = '127.0.0.1', port = 5178 }) {
  const server = createServer({ resolved, distDir, state, mcpHandler });
  return new Promise((resolve, reject) => {
    const tryListen = (pnum, attemptsLeft) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 0) { tryListen(pnum + 1, attemptsLeft - 1); }
        else reject(err);
      });
      server.listen(pnum, host, () => resolve({ server, url: `http://${host}:${pnum}`, port: pnum }));
    };
    tryListen(port, 20);
  });
}

/** The package root (two levels up from src/server/). */
export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
