/**
 * Steps for the CLI face. They shell out to the built bin exactly as a user would and assert on the
 * files it produces (or refuses to produce). Reuses the committed toy-shop trace fixture for the
 * happy path so the harness adds no parallel fixture, and writes a tiny invalid trace inline for the
 * failure path.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

/**
 * Run the built CLI as a bounded child and capture what a user would see: exit code, stdout, stderr.
 * Never throws (a non-zero exit is an outcome to assert, not an error), and carries a hard timeout so
 * a scenario that accidentally spawned a long-lived process fails fast instead of hanging the suite.
 */
function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cliEntry, ...args], { stdio: 'pipe', timeout: 30_000 });
    return { code: 0, stdout: stdout.toString(), stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return { code: typeof e.status === 'number' ? e.status : 1, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

/** Stash a captured CLI result on the world for the Then steps to assert on. */
function record(world: { cliExitCode?: number; cliStdout?: string; cliStderr?: string }, r: { code: number; stdout: string; stderr: string }): void {
  world.cliExitCode = r.code;
  world.cliStdout = r.stdout;
  world.cliStderr = r.stderr;
}

/** A minimal, typical command→aggregate model (unlike the pipeline-shaped bundled example). Valid and
 * anchored, so `generate` renders it and the emitted source links have something to point at. */
function commandAggregateModel(): unknown {
  return {
    version: 1,
    meta: { title: 'Shop' },
    nodes: [
      { id: 'cmd-place-order', type: 'command', label: 'Place Order', description: 'Customer places an order.', tactical: { explanation: 'onCheckout calls placeOrder.', anchors: [{ path: 'src/order/place-order.ts', line: 12 }] } },
      { id: 'agg-order', type: 'aggregate', label: 'Order', description: 'The order aggregate.', tactical: { explanation: 'placeOrder writes the order row.', anchors: [{ path: 'src/order/order.ts', line: 5 }] } },
    ],
    flows: [{ id: 'flow-checkout', name: 'Checkout', tier: 1, kind: 'write', status: 'live', summary: 'Customer checks out.', trigger: 'Customer submits cart', steps: ['cmd-place-order', 'agg-order'], edges: [{ from: 'cmd-place-order', to: 'agg-order', verb: 'handled by' }], hotspots: [] }],
    hotspots: [],
    terms: [],
  };
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

// --- extended coverage: merge reporting, generate validate-then-render + link portability, resolve tier ---

Given('an empty traces directory', async ({ world }) => {
  const dir = scratch(world);
  const traces = join(dir, 'traces');
  mkdirSync(traces);
  world.tracesDir = traces;
  world.flowsPath = join(dir, 'flows.json');
});

Given('a valid flows.json describing a command and an aggregate', async ({ world }) => {
  const dir = scratch(world);
  world.outDir = dir;
  world.flowsPath = join(dir, 'flows.json');
  writeFileSync(world.flowsPath, JSON.stringify(commandAggregateModel()));
});

Given('a flows.json with a dangling step reference', async ({ world }) => {
  const dir = scratch(world);
  world.outDir = dir;
  world.flowsPath = join(dir, 'flows.json');
  // Shape-valid (nodes/flows arrays present) but a flow step names a node that isn't defined; the
  // validator must catch it before any render.
  writeFileSync(world.flowsPath, JSON.stringify({
    version: 1, meta: {},
    nodes: [{ id: 'cmd-x', type: 'command', label: 'X', tactical: { explanation: '.', anchors: [{ path: 'a', line: 1 }] } }],
    flows: [{ id: 'f1', name: 'F', tier: 1, kind: 'write', status: 'live', steps: ['cmd-x', 'agg-missing'], edges: [], hotspots: [] }],
    hotspots: [], terms: [],
  }));
});

Given('a path to a flows.json that does not exist', async ({ world }) => {
  const dir = scratch(world);
  world.outDir = dir;
  world.flowsPath = join(dir, 'missing.json');
});

Given('a flows.json that is shape-valid but breaks the aggregate grammar', async ({ world }) => {
  const dir = scratch(world);
  world.flowsPath = join(dir, 'flows.json');
  // An aggregate that `issues` a command — the same #8 invariant, driven through the --model tier.
  writeFileSync(world.flowsPath, JSON.stringify({
    version: 1, meta: {},
    nodes: [
      { id: 'agg-x', type: 'aggregate', label: 'X' },
      { id: 'cmd-y', type: 'command', label: 'Y', tactical: { explanation: '.', anchors: [{ path: 'a', line: 1 }] } },
    ],
    flows: [{ id: 'bad', name: 'bad', tier: 1, kind: 'write', status: 'live', steps: ['agg-x', 'cmd-y'], edges: [{ from: 'agg-x', to: 'cmd-y', verb: 'issues' }], hotspots: [] }],
    hotspots: [], terms: [],
  }));
});

When('I run merge on that traces directory', async ({ world }) => {
  if (!world.flowsPath) world.flowsPath = join(scratch(world), 'flows.json');
  record(world, runCli(['merge', world.tracesDir!, world.flowsPath]));
});

When('I generate the explorer from that model', async ({ world }) => {
  record(world, runCli(['generate', world.flowsPath!, world.outDir!]));
});

When('I generate the explorer with repo-root set to the current directory', async ({ world }) => {
  record(world, runCli(['generate', world.flowsPath!, world.outDir!, '--repo-root', '.']));
});

When('I view that model', async ({ world }) => {
  // `view` validates the --model in resolveModel before startServer binds a port, so an invalid model
  // exits non-zero without ever leaving a server running — a bounded child, nothing to kill.
  record(world, runCli(['view', '--model', world.flowsPath!, '--no-open', '--port', '5399']));
});

Then('the CLI exits zero', async ({ world }) => {
  expect(world.cliExitCode).toBe(0);
});

Then('the CLI exits non-zero', async ({ world }) => {
  expect(world.cliExitCode).not.toBe(0);
});

Then('the CLI exits with code {int}', async ({ world }, code: number) => {
  expect(world.cliExitCode).toBe(code);
});

Then('stdout reports {string}', async ({ world }, text: string) => {
  expect(world.cliStdout).toContain(text);
});

Then('stderr reports {string}', async ({ world }, text: string) => {
  expect(world.cliStderr).toContain(text);
});

Then('stdout reports the merged trace count and the node and flow counts', async ({ world }) => {
  expect(world.cliStdout).toMatch(/merged \d+ trace files ->/);
  expect(world.cliStdout).toMatch(/nodes: \d+, flows: \d+, hotspots: \d+/);
});

Then('a flows.json is written', async ({ world }) => {
  expect(existsSync(world.flowsPath!)).toBe(true);
});

Then('no flows.json is written', async ({ world }) => {
  expect(existsSync(world.flowsPath!)).toBe(false);
});

Then('a flows.dot and an explorer.html are written', async ({ world }) => {
  expect(existsSync(join(world.outDir!, 'flows.dot'))).toBe(true);
  expect(existsSync(join(world.outDir!, 'explorer.html'))).toBe(true);
});

Then('no explorer.html is written', async ({ world }) => {
  expect(existsSync(join(world.outDir!, 'explorer.html'))).toBe(false);
});

Then('the generated flows.dot carries an absolute forward-slashed vscode link', async ({ world }) => {
  const dot = readFileSync(join(world.outDir!, 'flows.dot'), 'utf8');
  const link = (dot.match(/vscode:\/\/file\/[^"]*/) || [])[0];
  expect(link, 'the DOT carries at least one source anchor').toBeTruthy();
  // never the dead relative form the flag used to emit
  expect(link!.startsWith('vscode://file/./')).toBe(false);
  expect(link).not.toContain('\\');
  // absolute: a POSIX root (/...) or a Windows drive (X:/...)
  expect(link).toMatch(/^vscode:\/\/file\/([A-Za-z]:\/|\/)/);
  const expectedRoot = resolve('.').replace(/\\/g, '/');
  expect(link!.startsWith('vscode://file/' + expectedRoot + '/')).toBe(true);
});

Then('the generated explorer.html bakes the absolute repo root as its default', async ({ world }) => {
  const html = readFileSync(join(world.outDir!, 'explorer.html'), 'utf8');
  // Since #41 the per-model values are injected via the window.__ES__ preamble the built client
  // reads (`REPO_ROOT_DEFAULT: "<root>"`), not the old `const REPO_ROOT_DEFAULT = "<root>"`. The
  // baked-value behaviour below is unchanged; only where it is read from moved.
  const baked = (html.match(/REPO_ROOT_DEFAULT:\s*"([^"]*)"/) || [])[1];
  expect(baked, 'the HTML bakes a REPO_ROOT_DEFAULT').toBeTruthy();
  expect(baked).not.toBe('.');
  expect(baked).not.toContain('\\');
  expect(baked).toBe(resolve('.').replace(/\\/g, '/'));
});
