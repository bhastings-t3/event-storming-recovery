/**
 * Steps for the CLI face. They shell out to the built bin exactly as a user would and assert on the
 * files it produces (or refuses to produce). Reuses the committed toy-shop trace fixture for the
 * happy path so the harness adds no parallel fixture, and writes a tiny invalid trace inline for the
 * failure path.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures.js';
import { cliEntry, repoRoot } from '../support/server.js';

const toyTraces = join(repoRoot, 'tests', 'fixtures', 'toy-shop', 'traces');

/** A fresh temp dir tracked for cleanup by the world fixture. */
function scratch(world: { tempDirs: string[] }): string {
  const dir = mkdtempSync(join(tmpdir(), 'es-e2e-'));
  world.tempDirs.push(dir);
  return dir;
}

Given('a directory of valid per-flow traces', async ({ world }) => {
  world.tracesDir = toyTraces;
});

Given('a directory containing an invalid trace', async ({ world }) => {
  const dir = scratch(world);
  const traces = join(dir, 'traces');
  mkdirSync(traces);
  // An aggregate that issues a command violates the flow grammar; the validator must reject it.
  writeFileSync(join(traces, 'bad.json'), JSON.stringify({
    nodes: [
      { id: 'agg-x', type: 'aggregate', label: 'X' },
      { id: 'cmd-y', type: 'command', label: 'Y', tactical: { explanation: '.', anchors: [{ path: 'a', line: 1 }] } },
    ],
    flows: [{
      id: 'bad', name: 'bad', tier: 1, kind: 'write', status: 'live',
      steps: ['agg-x', 'cmd-y'], edges: [{ from: 'agg-x', to: 'cmd-y', verb: 'issues' }], hotspots: [],
    }],
    hotspots: [],
  }));
  world.tracesDir = traces;
  world.flowsPath = join(dir, 'flows.json');
});

When('I merge them into a flows.json', async ({ world }) => {
  const dir = scratch(world);
  world.outDir = dir;
  world.flowsPath = join(dir, 'flows.json');
  execFileSync(process.execPath, [cliEntry, 'merge', world.tracesDir!, world.flowsPath], { stdio: 'pipe' });
});

When('I generate the explorer from that flows.json', async ({ world }) => {
  execFileSync(process.execPath, [cliEntry, 'generate', world.flowsPath!, world.outDir!], { stdio: 'pipe' });
});

When('I merge that directory', async ({ world }) => {
  try {
    execFileSync(process.execPath, [cliEntry, 'merge', world.tracesDir!, world.flowsPath!], { stdio: 'pipe' });
    world.cliExitCode = 0;
  } catch (err) {
    const status = (err as { status?: number }).status;
    world.cliExitCode = typeof status === 'number' ? status : 1;
  }
});

Then('a canonical flows.json and an explorer.html are produced', async ({ world }) => {
  expect(existsSync(world.flowsPath!)).toBe(true);
  expect(existsSync(join(world.outDir!, 'explorer.html'))).toBe(true);
});

Then('the CLI exits non-zero and writes no flows.json', async ({ world }) => {
  expect(world.cliExitCode).not.toBe(0);
  expect(existsSync(world.flowsPath!)).toBe(false);
});
