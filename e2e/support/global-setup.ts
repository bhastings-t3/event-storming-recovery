/**
 * One build before the whole E2E run. Every face under test runs against compiled output — the SPA
 * is served from `dist/web`, and `view` / the CLI steps run `dist/node` — so a stale or missing build
 * means testing yesterday's code (AGENTS.md: "Tests and the CLI run against compiled dist/node").
 * Building here, once, keeps that guarantee in one place instead of per scenario.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default function globalSetup(): void {
  // A whole command string (not execFile + args + shell) so `npm` resolves through the shell — it is
  // a .cmd shim on Windows — without tripping the child-process arg-injection deprecation (DEP0190).
  execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' });
}
