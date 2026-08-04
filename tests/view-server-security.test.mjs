// Security tests for the es-view local server (issue #7): the loopback Origin/Host guard on the
// state-changing + source routes, and the anchor-scoping of /api/source (with symlink realpath).
// Black-box: drives a real http server built from createServer with in-memory fakes, and the real
// anchor-scoped fs gateway against a temp repo. Run: node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createServer, hostnameIsLoopback, bindHostIsLoopback } from '../dist/node/adapters/http/server.js';
import { createAnchorScopedGateway } from '../dist/node/adapters/fs/source-gateway.js';
import { buildServices } from '../dist/node/application/services.js';
import { Selection } from '../dist/node/domain/session/selection.js';
import { ContextBundle } from '../dist/node/domain/session/context-bundle.js';

// ---------------------------------------------------------------------------
// Helpers: a temp repo with a real anchor file, plus a resolved model over it.
// ---------------------------------------------------------------------------

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es7-'));
  fs.writeFileSync(path.join(dir, 'anchored.ts'), 'line1\nline2\nline3\n');
  fs.writeFileSync(path.join(dir, '.env'), 'SECRET=hunter2\n'); // in-root, NOT an anchor
  return dir;
}

function modelWithAnchor(relPath) {
  return {
    version: 1,
    meta: { title: 'sec' },
    nodes: [{ id: 'n1', type: 'command', label: 'N1', tactical: { anchors: [{ path: relPath, line: 2 }] } }],
    flows: [],
    hotspots: [],
    terms: [],
  };
}

function startFake(repoRoot, model, { allowRemote = false } = {}) {
  const resolved = { model, source: 'bundled', sourcePath: path.join(repoRoot, 'flows.json'), repoRoot, warnings: [] };
  const sourceGateway = createAnchorScopedGateway(repoRoot, model);
  const services = buildServices(resolved, { comments: null, sourceGateway });
  const server = createServer({
    resolved, distDir: repoRoot, selection: new Selection(), bundle: new ContextBundle(),
    services, sourceGateway, claudeCliGateway: { add: async () => ({ ok: true, command: 'x', stdout: '', stderr: '', notFound: false }) },
    runtime: { baseUrl: 'http://127.0.0.1:0' }, allowRemote,
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

function request(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Pure predicates
// ---------------------------------------------------------------------------

test('hostnameIsLoopback: loopback names accepted, others rejected', () => {
  for (const h of ['localhost', '127.0.0.1', '127.9.9.9', '::1', 'LOCALHOST']) assert.equal(hostnameIsLoopback(h), true, h);
  for (const h of ['0.0.0.0', '::', '192.168.1.5', 'evil.example', '10.0.0.1']) assert.equal(hostnameIsLoopback(h), false, h);
});

test('bindHostIsLoopback matches the loopback predicate for --host', () => {
  assert.equal(bindHostIsLoopback('127.0.0.1'), true);
  assert.equal(bindHostIsLoopback('0.0.0.0'), false);
});

// ---------------------------------------------------------------------------
// Origin / Host guard on protected routes
// ---------------------------------------------------------------------------

test('guard: cross-origin POST /api/mcp/register is 403; same-origin still works', async () => {
  const repo = makeRepo();
  const { server, port } = await startFake(repo, modelWithAnchor('anchored.ts'));
  try {
    const evil = await request(port, {
      method: 'POST', path: '/api/mcp/register',
      headers: { host: `127.0.0.1:${port}`, origin: 'http://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(evil.status, 403, 'cross-origin Origin rejected');

    const ok = await request(port, {
      method: 'POST', path: '/api/mcp/register',
      headers: { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(ok.status, 200, 'same-origin loopback accepted');
  } finally { server.close(); fs.rmSync(repo, { recursive: true, force: true }); }
});

test('guard: non-loopback Host (DNS-rebinding) is 403 even with a loopback-looking page', async () => {
  const repo = makeRepo();
  const { server, port } = await startFake(repo, modelWithAnchor('anchored.ts'));
  try {
    const r = await request(port, {
      method: 'POST', path: '/api/selection',
      headers: { host: 'attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId: 'n1' }),
    });
    assert.equal(r.status, 403, 'non-loopback Host rejected');
  } finally { server.close(); fs.rmSync(repo, { recursive: true, force: true }); }
});

test('guard: same-origin request with NO Origin header (loopback Host) is allowed', async () => {
  const repo = makeRepo();
  const { server, port } = await startFake(repo, modelWithAnchor('anchored.ts'));
  try {
    const r = await request(port, {
      method: 'POST', path: '/api/selection',
      headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId: 'n1' }),
    });
    assert.equal(r.status, 200, 'missing Origin + loopback Host is allowed (some browsers omit Origin)');
  } finally { server.close(); fs.rmSync(repo, { recursive: true, force: true }); }
});

test('guard: open reads (health, model) are reachable cross-origin (connect-flow needs them)', async () => {
  const repo = makeRepo();
  const { server, port } = await startFake(repo, modelWithAnchor('anchored.ts'));
  try {
    for (const p of ['/api/health', '/api/model']) {
      const r = await request(port, { path: p, headers: { host: `127.0.0.1:${port}`, origin: 'http://evil.example' } });
      assert.equal(r.status, 200, `${p} stays open`);
    }
  } finally { server.close(); fs.rmSync(repo, { recursive: true, force: true }); }
});

test('guard: GET /api/source is protected — cross-origin is 403', async () => {
  const repo = makeRepo();
  const { server, port } = await startFake(repo, modelWithAnchor('anchored.ts'));
  try {
    const r = await request(port, { path: '/api/source?path=anchored.ts', headers: { host: `127.0.0.1:${port}`, origin: 'http://evil.example' } });
    assert.equal(r.status, 403, 'source read is Origin-guarded');
  } finally { server.close(); fs.rmSync(repo, { recursive: true, force: true }); }
});

test('guard: --allow-remote disables the loopback guard', async () => {
  const repo = makeRepo();
  const { server, port } = await startFake(repo, modelWithAnchor('anchored.ts'), { allowRemote: true });
  try {
    const r = await request(port, {
      method: 'POST', path: '/api/selection',
      headers: { host: 'attacker.example', origin: 'http://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId: 'n1' }),
    });
    assert.equal(r.status, 200, 'guard skipped when remote access opted in');
  } finally { server.close(); fs.rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// /api/source anchor scoping + symlink realpath
// ---------------------------------------------------------------------------

test('source: a real anchor returns code; a non-anchor in-root file (.env) is refused', async () => {
  const repo = makeRepo();
  const { server, port } = await startFake(repo, modelWithAnchor('anchored.ts'));
  const loop = { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` };
  try {
    const anchor = await request(port, { path: '/api/source?path=anchored.ts&line=2', headers: loop });
    const anchorBody = JSON.parse(anchor.body);
    assert.equal(anchorBody.exists, true, 'anchor readable');
    assert.match(anchorBody.code, /line2/, 'anchor content returned');

    const secret = await request(port, { path: '/api/source?path=.env', headers: loop });
    const secretBody = JSON.parse(secret.body);
    assert.equal(secretBody.exists, false, '.env is not an anchor');
    assert.equal(secretBody.error, 'not a model anchor');
  } finally { server.close(); fs.rmSync(repo, { recursive: true, force: true }); }
});

test('source: a symlink whose real target is not an anchor is refused', async (t) => {
  const repo = makeRepo();
  let linkMade = true;
  try { fs.symlinkSync(path.join(repo, '.env'), path.join(repo, 'link.ts')); }
  catch { linkMade = false; } // symlink creation can require privilege on Windows
  if (!linkMade) { t.skip('symlink creation not permitted here'); return; }

  const { server, port } = await startFake(repo, modelWithAnchor('anchored.ts'));
  const loop = { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` };
  try {
    const r = await request(port, { path: '/api/source?path=link.ts', headers: loop });
    const body = JSON.parse(r.body);
    assert.equal(body.exists, false, 'symlink escaping the anchor set is refused');
    assert.equal(body.error, 'not a model anchor');
  } finally { server.close(); fs.rmSync(repo, { recursive: true, force: true }); }
});
