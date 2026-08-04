/**
 * Bring up / tear down the real `view` process for the E2E harness.
 *
 * `view` serves all three of the app's non-CLI faces from one node:http process on one port: the
 * built SPA, the JSON `/api/*` face, and the MCP endpoint at `POST /mcp`. Both the SPA and the MCP
 * scenarios drive that same binary — the thing the user actually runs — so this helper spawns it
 * exactly as a user would (`node dist/node/adapters/cli/cli.js view ...`), against the compiled
 * `dist/node`, and never against `src`.
 *
 * Port strategy: `startServer` walks forward from its preferred port on EADDRINUSE (server.ts), so we
 * pin a high port unlikely to collide but never trust it — we parse the URL the process actually
 * printed and hand that back. Every caller talks to the real bound URL, so a collision degrades to a
 * different port rather than a hang or a wrong-origin failure.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: e2e/support/ -> e2e/ -> root. */
export const repoRoot = path.resolve(here, '..', '..');
export const cliEntry = path.join(repoRoot, 'dist', 'node', 'adapters', 'cli', 'cli.js');
/** The bundled self-model: 87 nodes / 15 flows, the ready fixture the issue points at. */
export const exampleModel = path.join(repoRoot, 'examples', 'event-storming-recovery', 'model', 'flows.json');

export interface ViewServer {
  /** The URL the process actually bound (may differ from the preferred port after a walk-forward). */
  url: string;
  /** Terminate the process and resolve once it has exited. */
  stop(): Promise<void>;
}

/**
 * Spawn `view` on `port` (falling forward if taken) against `model`, resolving once it prints its
 * bound URL. Each call is an independent server instance — the SPA and MCP faces take their own so
 * the process-global session (selection + bundle, in-memory singletons shared across both faces)
 * never bleeds between scenarios.
 */
export function startViewServer(opts: { port: number; model?: string }): Promise<ViewServer> {
  const args = [cliEntry, 'view', '--no-open', '--port', String(opts.port), '--model', opts.model ?? exampleModel];
  const child: ChildProcess = spawn(process.execPath, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });

  return new Promise<ViewServer>((resolve, reject) => {
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`view did not report a URL within 30s.\nstdout:\n${out}\nstderr:\n${err}`));
    }, 30_000);

    child.stdout!.on('data', (d) => {
      out += d.toString();
      // es-view prints "  http://127.0.0.1:<port>" as the first line of its banner (es-view.ts).
      const m = out.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) {
        clearTimeout(timer);
        resolve({ url: m[0], stop: () => stop(child) });
      }
    });
    child.stderr!.on('data', (d) => { err += d.toString(); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`view exited early (code ${code}) before binding a port.\nstdout:\n${out}\nstderr:\n${err}`));
    });
  });
}

/** Terminate a spawned view process. `view` spawns no children (it never opens a browser under --no-open), so killing the one node process is a clean teardown on both Windows and Linux. */
function stop(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const hard = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } resolve(); }, 3_000);
    child.once('exit', () => { clearTimeout(hard); resolve(); });
    child.kill();
  });
}
