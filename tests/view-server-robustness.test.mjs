// Robustness regression tests for the es-view local server (issue #12): three pre-existing bugs that
// the TS refactor kept at parity.
//   1. a malformed %-escape in the URL path used to throw URIError out of the handler and hang the
//      (unauthenticated) client — it must now answer a prompt status, never hang.
//   2. the static-serve containment guard used a bare startsWith, so a sibling dir sharing the prefix
//      (dist/web.bak) counted as "inside" — it must now be refused.
//   3. --port with a non-numeric / out-of-range value used to reach listen() as NaN and bind a random
//      free port — parsePort must reject it.
// Black-box over a real http server built from createServer, plus a raw-socket request so the literal
// path reaches serveStatic without client-side normalisation. Run: node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createServer, parsePort } from '../dist/node/adapters/http/server.js';
import { buildServices } from '../dist/node/application/services.js';
import { Selection } from '../dist/node/domain/session/selection.js';
import { ContextBundle } from '../dist/node/domain/session/context-bundle.js';

function emptyModel() {
  return { version: 1, meta: { title: 'robustness' }, nodes: [], flows: [], hotspots: [], terms: [] };
}

// A dist dir with an index.html, plus a *sibling* dir (dist/web.bak) that shares the prefix and holds
// a secret the containment guard must never serve.
function makeDist() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'es12-'));
  const distDir = path.join(base, 'web');
  fs.mkdirSync(distDir);
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>spa</title>');
  fs.mkdirSync(path.join(base, 'web.bak'));
  fs.writeFileSync(path.join(base, 'web.bak', 'secret'), 'TOP-SECRET');
  return { base, distDir };
}

function startServer(distDir, { mcpHandler } = {}) {
  const model = emptyModel();
  const resolved = { model, source: 'bundled', sourcePath: path.join(distDir, 'flows.json'), repoRoot: distDir, warnings: [] };
  const services = buildServices(resolved, { comments: null, sourceGateway: { read: () => ({ path: '', exists: false }) } });
  const server = createServer({
    resolved, distDir, selection: new Selection(), bundle: new ContextBundle(),
    services, sourceGateway: { read: () => ({ path: '', exists: false }) },
    claudeCliGateway: { add: async () => ({ ok: true, command: 'x', stdout: '', stderr: '', notFound: false }) },
    runtime: { baseUrl: 'http://127.0.0.1:0' }, mcpHandler,
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

// A raw-socket request that writes the literal request line, so a path like `/../web.bak/secret`
// reaches the server verbatim (node's http client and curl both normalise dot-segments otherwise).
// Rejects after 4s so a REGRESSION (the old hang) fails fast instead of stalling the whole suite.
function rawRequest(port, rawPath) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`no response within 4s for ${rawPath} (hang?)`)); }, 4000);
    sock.on('connect', () => sock.write(`GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
    sock.on('data', (c) => (data += c));
    sock.on('end', () => { clearTimeout(timer); const m = /^HTTP\/1\.1 (\d{3})/.exec(data); resolve({ status: m ? Number(m[1]) : 0, raw: data }); });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// ---------------------------------------------------------------------------
// Bug 1: malformed %-escape answers promptly, never hangs
// ---------------------------------------------------------------------------

for (const bad of ['/%', '/%zz', '/foo%']) {
  test(`malformed escape ${bad} gets a prompt status and does not hang`, async () => {
    const { base, distDir } = makeDist();
    const { server } = await startServer(distDir);
    const port = server.address().port;
    try {
      const r = await rawRequest(port, bad);
      assert.equal(r.status, 400, `${bad} should be a clean 400`);
    } finally { server.close(); fs.rmSync(base, { recursive: true, force: true }); }
  });
}

// ---------------------------------------------------------------------------
// Bug 1 (defence in depth): an unexpected throw in a route maps to 500, not a hang
// ---------------------------------------------------------------------------

test('an unexpected throw in a handler maps to 500 (never a hang)', async () => {
  const { base, distDir } = makeDist();
  const { server } = await startServer(distDir, { mcpHandler: async () => { throw new Error('boom'); } });
  const port = server.address().port;
  try {
    const r = await rawRequest(port, '/mcp');
    assert.equal(r.status, 500, 'a thrown route error becomes a 500');
  } finally { server.close(); fs.rmSync(base, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Bug 2: containment guard refuses a sibling sharing the prefix; legit files serve
// ---------------------------------------------------------------------------

test('containment: a sibling dir sharing the prefix (web.bak) is refused (403)', async () => {
  const { base, distDir } = makeDist();
  const { server } = await startServer(distDir);
  const port = server.address().port;
  try {
    const r = await rawRequest(port, '/../web.bak/secret');
    assert.equal(r.status, 403, 'dist/web.bak must not count as inside dist/web');
    assert.doesNotMatch(r.raw, /TOP-SECRET/, 'the sibling secret must not leak');
  } finally { server.close(); fs.rmSync(base, { recursive: true, force: true }); }
});

test('containment: a legitimate file inside distDir still serves (200)', async () => {
  const { base, distDir } = makeDist();
  const { server } = await startServer(distDir);
  const port = server.address().port;
  try {
    const r = await rawRequest(port, '/index.html');
    assert.equal(r.status, 200, 'a real dist/web file still serves');
  } finally { server.close(); fs.rmSync(base, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Bug 3: parsePort rejects NaN / out-of-range instead of binding a random port
// ---------------------------------------------------------------------------

test('parsePort accepts a valid integer port', () => {
  assert.equal(parsePort('5178'), 5178);
  assert.equal(parsePort(5178), 5178);
  assert.equal(parsePort('1'), 1);
  assert.equal(parsePort('65535'), 65535);
});

test('parsePort rejects non-numeric, empty, and out-of-range values', () => {
  for (const bad of ['abc', '', undefined, null, '999999', '0', '-1', '80.5', '5178abc', NaN]) {
    assert.throws(() => parsePort(bad), /must be an integer between 1 and 65535/, `parsePort(${JSON.stringify(bad)}) should throw`);
  }
});

// A guard that returns a value for any of these would let listen() bind a random port.
test('parsePort never returns a non-port number for junk input', () => {
  for (const bad of ['abc', '', '999999']) {
    try { const n = parsePort(bad); assert.fail(`expected throw, got ${n}`); } catch { /* expected */ }
  }
});
