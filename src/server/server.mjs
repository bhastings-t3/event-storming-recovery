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
import { buildNodeContext, renderNodeContextMarkdown, renderBundleMarkdown, renderItemMarkdown } from './context.mjs';
import { readSource } from './source.mjs';
import { claudeMcpAdd } from './mcp-register.mjs';

// the MCP server name registered into the user's Claude config
export const MCP_NAME = 'event-storming';

// existence + label for a typed bundle ref (node / flow / hotspot)
function itemExists(services, type, id) {
  if (type === 'flow') return services.model.flows.some((f) => f.id === id);
  if (type === 'hotspot') return services.indexes.hotspotById.has(id);
  return services.indexes.nodeById.has(id);
}
function itemLabel(services, type, id) {
  if (type === 'flow') { const f = services.model.flows.find((x) => x.id === id); return f ? f.name : id; }
  if (type === 'hotspot') { const h = services.indexes.hotspotById.get(id); return h ? h.label : id; }
  const n = services.indexes.nodeById.get(id); return n ? n.label : id;
}

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

/** Build the services bundle (model + indexes + repoRoot + comment store) shared by the API and MCP. */
export function buildServices(resolved, comments = null) {
  return { model: resolved.model, indexes: buildIndexes(resolved.model), repoRoot: resolved.repoRoot, comments };
}

/**
 * @param {object} opts
 * @param {{ model, source, sourcePath, repoRoot, warnings }} opts.resolved
 * @param {string} opts.distDir
 * @param {ReturnType<import('./state.mjs').createState>} opts.state
 * @param {object} [opts.services]  shared services (built from resolved if omitted)
 * @param {(req,res)=>Promise<boolean>} [opts.mcpHandler]  handles /mcp; returns true if it took the request
 * @returns {http.Server}
 */
export function createServer({ resolved, distDir, state, services = buildServices(resolved), mcpHandler, runtime = {} }) {
  const mcpUrl = () => (runtime.baseUrl ? runtime.baseUrl + '/mcp' : null);
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
      const selResponse = () => {
        const sel = state.getSelection();
        const ctx = sel ? buildNodeContext(services, sel.nodeId) : null;
        return { selection: ctx, markdown: ctx ? renderNodeContextMarkdown(ctx) : '' };
      };
      if (method === 'GET') return sendJson(res, 200, selResponse());
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const nodeId = body && body.nodeId;
        if (nodeId && !services.indexes.nodeById.has(nodeId)) return sendJson(res, 404, { error: `unknown node '${nodeId}'` });
        state.setSelection(nodeId || null);
        return sendJson(res, 200, selResponse());
      }
      if (method === 'DELETE') { state.clearSelection(); return sendJson(res, 200, { ok: true }); }
    }

    if (p === '/api/context') {
      if (method === 'GET') {
        const items = state.getBundle();
        return sendJson(res, 200, { items, markdown: renderBundleMarkdown(services, items) });
      }
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const type = (body && body.type) || 'node';
        const id = body && body.id;
        if (!id || !itemExists(services, type, id)) return sendJson(res, 404, { error: `unknown ${type} '${id}'` });
        return sendJson(res, 200, { items: state.addToBundle(type, id) });
      }
      if (method === 'DELETE') {
        const body = await readJsonBody(req);
        if (body && body.id) return sendJson(res, 200, { items: state.removeFromBundle(body.type || 'node', body.id) });
        state.clearBundle();
        return sendJson(res, 200, { items: [] });
      }
    }

    // Human comments on items (node / flow / hotspot), persisted to the comments.json sidecar.
    if (p === '/api/comments') {
      const store = services.comments;
      if (!store) return sendJson(res, 200, { comments: [] });
      if (method === 'GET') {
        const type = url.searchParams.get('type');
        const id = url.searchParams.get('id');
        return sendJson(res, 200, { comments: (type && id) ? store.get(type, id) : store.all() });
      }
      const body = await readJsonBody(req);
      const type = (body && body.type) || 'node';
      const id = body && body.id;
      if (!id || !itemExists(services, type, id)) return sendJson(res, 404, { error: `unknown ${type} '${id}'` });
      if (method === 'POST') {
        const text = (body && body.text || '').trim();
        if (!text) return sendJson(res, 400, { error: 'empty comment' });
        store.add(type, id, text);
        return sendJson(res, 200, { comments: store.get(type, id) });
      }
      if (method === 'DELETE') {
        if (!body.commentId) return sendJson(res, 400, { error: 'commentId required' });
        return sendJson(res, 200, { comments: store.remove(type, id, body.commentId) });
      }
    }

    if (p === '/api/item' && method === 'GET') {
      const type = url.searchParams.get('type') || 'node';
      const id = url.searchParams.get('id');
      if (!id || !itemExists(services, type, id)) return sendJson(res, 404, { error: `unknown ${type} '${id}'` });
      return sendJson(res, 200, { type, id, label: itemLabel(services, type, id), markdown: renderItemMarkdown(services, { type, id }) });
    }

    if (p === '/api/source' && method === 'GET') {
      const relPath = url.searchParams.get('path');
      const line = Number(url.searchParams.get('line')) || undefined;
      const ctx = Number(url.searchParams.get('ctx')) || undefined;
      if (!relPath) return sendJson(res, 400, { error: 'path required' });
      return sendJson(res, 200, readSource(resolved.repoRoot, relPath, line, ctx));
    }

    // MCP connection helper: expose the exact command, and run it on the user's behalf.
    if (p === '/api/mcp/info' && method === 'GET') {
      const url = mcpUrl();
      return sendJson(res, 200, { name: MCP_NAME, url, command: url ? `claude mcp add --transport http ${MCP_NAME} ${url}` : null });
    }
    if (p === '/api/mcp/register' && method === 'POST') {
      const url = mcpUrl();
      if (!url) return sendJson(res, 503, { ok: false, stderr: 'server URL not ready yet' });
      const body = await readJsonBody(req);
      const scope = ['local', 'project', 'user'].includes(body && body.scope) ? body.scope : undefined;
      const result = await claudeMcpAdd({ name: MCP_NAME, url, scope });
      return sendJson(res, 200, result);
    }

    if (p.startsWith('/api/') || p === '/mcp') return sendJson(res, 404, { error: 'unknown endpoint' });

    return serveStatic(res, distDir, req.url || '/');
  });
}

/** Listen on the first free port at/after `port`. Resolves with { server, url, port }. */
export function startServer({ resolved, distDir, state, services, mcpHandler, runtime = {}, host = '127.0.0.1', port = 5178 }) {
  const server = createServer({ resolved, distDir, state, services, mcpHandler, runtime });
  return new Promise((resolve, reject) => {
    const tryListen = (pnum, attemptsLeft) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 0) { tryListen(pnum + 1, attemptsLeft - 1); }
        else reject(err);
      });
      server.listen(pnum, host, () => {
        const url = `http://${host}:${pnum}`;
        runtime.baseUrl = url; // so /api/mcp/* can build the exact connect command
        resolve({ server, url, port: pnum });
      });
    };
    tryListen(port, 20);
  });
}

/** The package root (two levels up from src/server/). */
export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
