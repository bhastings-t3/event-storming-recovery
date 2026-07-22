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
 * The web UI and the MCP server share one in-memory session (selection + bundle), so a click in the
 * browser is visible to a connected Claude session. This adapter maps every route to an application
 * command/query; ported from src/server/server.mjs (every route, status, body shape, header intact).
 */
import fs from 'node:fs';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { ServiceBundle } from '../../application/services.js';
import type { ResolvedModel } from '../../application/services.js';
import type { Selection } from '../../domain/session/selection.js';
import type { ContextBundle } from '../../domain/session/context-bundle.js';
import type { SourceGateway, ClaudeCliGateway } from '../../application/ports.js';
import { getCurrentSelection } from '../../application/queries/get-current-selection.js';
import { listContextBundle } from '../../application/queries/list-context-bundle.js';
import { listComments } from '../../application/queries/list-comments.js';
import { getItem } from '../../application/queries/get-item.js';
import { viewSource } from '../../application/queries/view-source.js';
import { selectNode } from '../../application/commands/select-node.js';
import { clearSelection } from '../../application/commands/clear-selection.js';
import { addContextItem } from '../../application/commands/add-context-item.js';
import { removeContextItem } from '../../application/commands/remove-context-item.js';
import { clearContextBundle } from '../../application/commands/clear-context-bundle.js';
import { addComment } from '../../application/commands/add-comment.js';
import { removeComment } from '../../application/commands/remove-comment.js';
import { registerMcp } from '../../application/commands/register-mcp.js';

// the MCP server name registered into the user's Claude config
export const MCP_NAME = 'event-storming';

const CONTENT_TYPES: Record<string, string> = {
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function serveStatic(res: ServerResponse, distDir: string, urlPath: string): void {
  const rel = decodeURIComponent(urlPath.split('?')[0]!).replace(/^\/+/, '');
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

export interface CreateServerOptions {
  resolved: ResolvedModel;
  distDir: string;
  selection: Selection;
  bundle: ContextBundle;
  services: ServiceBundle;
  sourceGateway: SourceGateway;
  claudeCliGateway: ClaudeCliGateway;
  mcpHandler?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  runtime?: { baseUrl?: string };
}

export function createServer({ resolved, distDir, selection, bundle, services, sourceGateway, claudeCliGateway, mcpHandler, runtime = {} }: CreateServerOptions): http.Server {
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
      if (method === 'GET') return sendJson(res, 200, getCurrentSelection(services, selection));
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const result = selectNode(services, selection, body && body.nodeId);
        if (!result.ok) return sendJson(res, 404, { error: result.error });
        return sendJson(res, 200, { selection: result.selection, markdown: result.markdown });
      }
      if (method === 'DELETE') { clearSelection(selection); return sendJson(res, 200, { ok: true }); }
    }

    if (p === '/api/context') {
      if (method === 'GET') {
        return sendJson(res, 200, listContextBundle(services, bundle));
      }
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const type = (body && body.type) || 'node';
        const id = body && body.id;
        const result = addContextItem(services, bundle, type, id);
        if (!result.ok) return sendJson(res, 404, { error: result.error });
        return sendJson(res, 200, { items: result.items });
      }
      if (method === 'DELETE') {
        const body = await readJsonBody(req);
        if (body && body.id) return sendJson(res, 200, { items: removeContextItem(bundle, body.type || 'node', body.id) });
        clearContextBundle(bundle);
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
        return sendJson(res, 200, listComments(services, type, id));
      }
      const body = await readJsonBody(req);
      const type = (body && body.type) || 'node';
      const id = body && body.id;
      if (method === 'POST') {
        const result = addComment(services, type, id, body && body.text);
        if (result.status === 'not-found') return sendJson(res, 404, { error: result.error });
        if (result.status === 'invalid') return sendJson(res, 400, { error: result.error });
        if (result.status === 'ok') return sendJson(res, 200, { comments: result.comments });
        return sendJson(res, 200, { comments: [] });
      }
      if (method === 'DELETE') {
        const result = removeComment(services, type, id, body && body.commentId);
        if (result.status === 'not-found') return sendJson(res, 404, { error: result.error });
        if (result.status === 'invalid') return sendJson(res, 400, { error: result.error });
        if (result.status === 'ok') return sendJson(res, 200, { comments: result.comments });
        return sendJson(res, 200, { comments: [] });
      }
    }

    if (p === '/api/item' && method === 'GET') {
      const type = url.searchParams.get('type') || 'node';
      const id = url.searchParams.get('id');
      const result = getItem(services, type, id);
      if (!result) return sendJson(res, 404, { error: `unknown ${type} '${id}'` });
      return sendJson(res, 200, result);
    }

    if (p === '/api/source' && method === 'GET') {
      const relPath = url.searchParams.get('path');
      const line = Number(url.searchParams.get('line')) || undefined;
      const ctx = Number(url.searchParams.get('ctx')) || undefined;
      if (!relPath) return sendJson(res, 400, { error: 'path required' });
      return sendJson(res, 200, viewSource(sourceGateway, resolved.repoRoot, relPath, line, ctx));
    }

    // MCP connection helper: expose the exact command, and run it on the user's behalf.
    if (p === '/api/mcp/info' && method === 'GET') {
      const u = mcpUrl();
      return sendJson(res, 200, { name: MCP_NAME, url: u, command: u ? `claude mcp add --transport http ${MCP_NAME} ${u}` : null });
    }
    if (p === '/api/mcp/register' && method === 'POST') {
      const u = mcpUrl();
      if (!u) return sendJson(res, 503, { ok: false, stderr: 'server URL not ready yet' });
      const body = await readJsonBody(req);
      const result = await registerMcp({ name: MCP_NAME, url: u, scope: body && body.scope }, claudeCliGateway);
      return sendJson(res, 200, result);
    }

    if (p.startsWith('/api/') || p === '/mcp') return sendJson(res, 404, { error: 'unknown endpoint' });

    return serveStatic(res, distDir, req.url || '/');
  });
}

export interface StartServerOptions extends CreateServerOptions {
  host?: string;
  port?: number;
}

/** Listen on the first free port at/after `port`. Resolves with { server, url, port }. */
export function startServer(opts: StartServerOptions): Promise<{ server: http.Server; url: string; port: number }> {
  const { runtime = {}, host = '127.0.0.1', port = 5178 } = opts;
  const server = createServer({ ...opts, runtime });
  return new Promise((resolve, reject) => {
    const tryListen = (pnum: number, attemptsLeft: number) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
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
