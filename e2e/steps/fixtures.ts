/**
 * The shared support library for every face. Step files import { Given, When, Then } from here, so
 * they all speak to the same fixtures:
 *
 *   - `viewServer`  a real `view` process (SPA + API + MCP), its own instance per scenario
 *   - `mcpClient`   an MCP SDK client already connected to that process's POST /mcp
 *   - `world`       a scenario-scoped scratchpad for passing state between steps, cleaned up after
 *   - `staticExplorerUrl`  a file:// URL to a freshly generated static `explorer.html` (issue #42)
 *
 * Fixtures are lazy: a CLI scenario touches none of these and so spawns neither a server nor a
 * browser; an MCP scenario starts the server but no page; only an SPA scenario opens a browser. That
 * laziness is also the isolation story — each scenario that needs a server gets a fresh one, so the
 * process-global selection/bundle (issue #10, single-user-local by design) can't bleed across
 * scenarios. This is the seam issue #20 grows into: add feature files and step files, reuse these.
 */
import { execFileSync } from 'node:child_process';
import { rmSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test as base, createBdd } from 'playwright-bdd';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startViewServer, exampleModel, cliEntry, repoRoot, type ViewServer } from '../support/server.js';

/**
 * The conventional (command→aggregate→event→policy→readModel) fixture's trace directory (issue #33).
 * The bundled self-model the other scenarios drive is pipeline-shaped and atypical (it has no policy
 * at all); this hand-written toy-shop domain is the ordinary shape most domains have, so driving it
 * proves the harness handles a conventional model and keeps the E2E net from being self-model-biased.
 */
const toyShopTraces = resolve(repoRoot, 'tests', 'fixtures', 'toy-shop', 'traces');

/** A scenario-scoped scratchpad. Steps stash what later steps assert on; temp dirs get cleaned on teardown. */
export interface World {
  /** The label of the node a step clicked, so a later step can assert the panel names the same one. */
  clickedLabel?: string;
  /** The traces directory a CLI `merge` step reads. */
  tracesDir?: string;
  /** The flows.json a CLI `merge` writes / `generate` reads. */
  flowsPath?: string;
  /** Where a CLI `generate` wrote, asserted on by a later step. */
  outDir?: string;
  /** Exit code of the last CLI invocation (for the invalid-input scenario). */
  cliExitCode?: number;
  /** stdout of the last CLI invocation, so a later step can pin the printed counts / validator errors. */
  cliStdout?: string;
  /** stderr of the last CLI invocation, so a later step can pin the "refusing to write/render" text. */
  cliStderr?: string;
  /** The text a called MCP tool returned. */
  toolText?: string;
  /** The text an MCP resource read returned (kept distinct from toolText — a resource is not a tool). */
  resourceText?: string;
  /** Temp dirs to remove after the scenario. */
  tempDirs: string[];
}

interface Fixtures {
  viewServer: ViewServer;
  writableViewServer: ViewServer;
  mcpClient: Client;
  world: World;
}

interface WorkerFixtures {
  /**
   * A file:// URL to a static `explorer.html` generated once per worker from the bundled example model
   * via the real CLI (issue #42). The emitted file is self-contained (baked MODEL, no server, no /api),
   * so the static-explorer scenarios open it directly — no `view` process. Generated once and shared
   * because it is an immutable artifact: unlike `viewServer`, it holds no process-global session that
   * could bleed between scenarios, so there is nothing to isolate per test.
   */
  staticExplorerUrl: string;

  /**
   * Like `staticExplorerUrl`, but for the CONVENTIONAL toy-shop model (issue #33). Built by running
   * the real CLI end to end — `merge` the toy-shop traces into a flows.json, then `generate` the
   * static explorer from it — so this exercises the full merge→generate→render pipeline over an
   * ordinary command/aggregate/event/policy domain, not just the bundled pipeline-shaped self-model.
   * Same worker scope + immutability rationale as `staticExplorerUrl`.
   */
  staticExplorerToyShopUrl: string;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  // One view process per scenario. 5310 is a deliberately unusual port; server.ts still parses the
  // real bound URL, so a collision falls forward instead of failing.
  viewServer: async ({}, use) => {
    const server = await startViewServer({ port: 5310 });
    await use(server);
    await server.stop();
  },

  // Like `viewServer`, but against a *writable* copy of the example model in a temp dir. The comment
  // journey needs the sidecar (comments.json) to actually land on disk next to flows.json; the bundled
  // example under the package can be read-only (issue #9's memory-only path), so a scenario that asserts
  // a persisted comment must own a writable model dir rather than write into the shared fixture. Port
  // 5311 (viewServer uses 5310) keeps the two servers from preferring the same port; server.ts still
  // parses the real bound URL, so a collision falls forward.
  writableViewServer: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'es-e2e-model-'));
    const modelPath = join(dir, 'flows.json');
    copyFileSync(exampleModel, modelPath);
    const server = await startViewServer({ port: 5311, model: modelPath });
    await use(server);
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  },

  mcpClient: async ({ viewServer }, use) => {
    const client = new Client({ name: 'es-e2e-mcp-client', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(viewServer.url + '/mcp'));
    await client.connect(transport);
    await use(client);
    await client.close();
  },

  world: async ({}, use) => {
    const world: World = { tempDirs: [] };
    await use(world);
    for (const dir of world.tempDirs) rmSync(dir, { recursive: true, force: true });
  },

  staticExplorerUrl: [
    async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), 'es-e2e-static-'));
      // Produce the artifact under test exactly as a user would: `generate <flowsFile> <outDir>`.
      // A stable placeholder --repo-root keeps the baked vscode:// links deterministic (they never
      // resolve headless, and no scenario drives them — see static-explorer.steps.ts).
      execFileSync(process.execPath, [cliEntry, 'generate', exampleModel, dir, '--repo-root', '/x'], { stdio: 'pipe' });
      await use(pathToFileURL(join(dir, 'explorer.html')).href);
      rmSync(dir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],

  staticExplorerToyShopUrl: [
    async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), 'es-e2e-toyshop-'));
      const model = join(dir, 'flows.json');
      // Build the conventional model exactly as a user would: merge the traces, then generate. merge
      // validates before writing, so reaching `generate` already proves the fixture is a valid model.
      execFileSync(process.execPath, [cliEntry, 'merge', toyShopTraces, model], { stdio: 'pipe' });
      execFileSync(process.execPath, [cliEntry, 'generate', model, dir, '--repo-root', '/x'], { stdio: 'pipe' });
      await use(pathToFileURL(join(dir, 'explorer.html')).href);
      rmSync(dir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
});

export const { Given, When, Then } = createBdd(test);
