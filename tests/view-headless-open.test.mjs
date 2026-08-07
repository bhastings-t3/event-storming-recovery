// Regression test for issue #71: the DEFAULT `view` command (no --no-open) must survive a machine with
// no browser opener. A missing xdg-open/open/start makes the spawned child emit an async 'error' event;
// unhandled, it used to kill the whole `view` process and take the SPA + API + MCP server down with it.
//
// This boots the real CLI `view` with the default open path but an EMPTY PATH, so the opener spawn fails
// with ENOENT exactly as it does in a container/WSL/SSH/CI box. The server must stay up and answer
// GET /api/health with 200. Run: node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'dist', 'node', 'adapters', 'cli', 'cli.js');
const toyTraces = join(root, 'tests', 'fixtures', 'toy-shop', 'traces');

/** Reserve a currently-free loopback port (closed again before use; view falls forward if it races). */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** GET a URL, resolving to its status code (or rejecting on a transport error). */
function getStatus(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('health probe timed out')));
  });
}

/** Wait until the child prints its banner URL, or reject if it exits / times out first. */
function waitForUrl(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`no banner URL within ${timeoutMs}ms; saw:\n${out}`)), timeoutMs);
    const scan = (chunk) => {
      out += chunk;
      const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    child.stdout.on('data', scan);
    child.stderr.on('data', (c) => (out += c));
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`view exited early (code ${code}) — it must NOT die when the opener is missing. Output:\n${out}`)); });
  });
}

test('view with the default open path survives a missing browser opener and keeps serving /api/health', async () => {
  const out = mkdtempSync(join(tmpdir(), 'es71-'));
  const model = join(out, 'flows.json');
  // Build a real, valid model to serve (the merge runs with a normal environment).
  execFileSync('node', [cli, 'merge', toyTraces, model], { stdio: 'pipe' });
  const port = await freePort();

  // Launch `view` WITHOUT --no-open, so it tries to open a browser, but with an EMPTY PATH so the opener
  // (xdg-open/open/start) is unresolvable and spawn fails with ENOENT — the exact headless condition.
  // node is launched by absolute path (process.execPath), so an empty PATH does not stop node itself.
  const child = spawn(process.execPath, [cli, 'view', '--model', model, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: '' },
  });

  try {
    const url = await waitForUrl(child, 15000);
    // The process is still alive (waitForUrl rejects on early exit), and the server answers.
    const status = await getStatus(`${url}/api/health`);
    assert.equal(status, 200, 'the server must still serve /api/health after the opener failed');
    assert.equal(child.exitCode, null, 'the view process must still be running, not crashed by the missing opener');
  } finally {
    child.kill('SIGKILL');
    rmSync(out, { recursive: true, force: true });
  }
});
