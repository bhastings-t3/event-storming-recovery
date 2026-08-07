/**
 * es-view — boot the interactive Event Storming explorer.
 *
 *   npx event-storming-recovery view [options]
 *
 * Resolves a model (or falls back to the bundled example), starts one local
 * server that serves the SPA + JSON API, and opens the browser.
 *
 * Exposed as the (default) `view` subcommand of the unified CLI (cli.ts).
 *
 * This is the composition root: it constructs the concrete adapters, injects them
 * into the application layer, and starts the server.
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModel } from '../../application/commands/resolve-model.js';
import { buildServices } from '../../application/services.js';
import { startServer, bindHostIsLoopback } from '../http/server.js';
import { Selection } from '../../domain/session/selection.js';
import { ContextBundle } from '../../domain/session/context-bundle.js';
import { createCommentStore } from '../fs/comment-repository.js';
import { createMcpHandler } from '../mcp/mcp-server.js';
import { openBrowser } from '../process/browser.js';
import { modelRepository } from '../fs/model-repository.js';
import { createAnchorScopedGateway } from '../fs/source-gateway.js';
import { claudeCliGateway } from '../process/claude-cli.js';

/** The package root (four levels up from dist/node/adapters/cli/). */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export interface ViewOptions {
  open: boolean;
  port: number;
  host: string;
  allowRemote: boolean;
  modelPath?: string;
  tracesDir?: string;
  repoRoot?: string;
}

// Wildcard bind addresses mean "listen on every interface"; none is itself a client-reachable
// destination, so a connect URL built from one (http://0.0.0.0:PORT) cannot be dialed.
const WILDCARD_BIND_HOSTS = new Set(['0.0.0.0', '::', '0000:0000:0000:0000:0000:0000:0000:0000']);

/** True if `host` is a wildcard bind address (all interfaces), which is never a client-reachable address. */
export function isWildcardBindHost(host: string): boolean {
  return WILDCARD_BIND_HOSTS.has(host.trim());
}

/** First non-internal IPv4 address of this machine, or null (e.g. offline). Turns a wildcard bind into a URL a remote client can actually reach. */
export function firstLanIPv4(): string | null {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

const SOURCE_LABEL: Record<string, string> = {
  model: 'explicit --model',
  traces: 'merged from --traces',
  discovered: 'auto-discovered in this directory',
  example: 'bundled example — this tool\'s own self-model (no model found here)',
};

/** Resolve a model, start the SPA + JSON API + MCP server, print the banner, and (optionally) open the browser. */
export async function runView(opts: ViewOptions): Promise<void> {
  const cwd = process.cwd();

  // es-view has no authentication. Binding beyond loopback exposes source reads and the "claude mcp
  // add" register action to the whole network, so a non-loopback --host requires an explicit opt-in.
  if (!bindHostIsLoopback(opts.host) && !opts.allowRemote) {
    console.error(`\n✖ Refusing to bind es-view to a non-loopback address (${opts.host}) without --allow-remote.`);
    console.error(`  es-view has no auth; beyond 127.0.0.1 anyone who can reach this host can read source`);
    console.error(`  and trigger MCP registration. Re-run with --allow-remote only if you accept that.\n`);
    process.exit(1);
  }

  let resolved;
  try {
    resolved = resolveModel({ modelPath: opts.modelPath, tracesDir: opts.tracesDir, repoRoot: opts.repoRoot, cwd, packageRoot }, modelRepository);
  } catch (err) {
    console.error(`\n✖ ${(err as Error).message}\n`);
    process.exit(1);
  }

  const distDir = path.join(packageRoot, 'dist', 'web');
  const selection = new Selection();
  const bundle = new ContextBundle();
  // human comments persist to a sidecar next to the model (survives model regeneration); the handle
  // also exposes persistence health so the API can tell the client when a write stayed in memory only
  // (e.g. the bundled example under a global install, or a read-only --traces input dir).
  const commentsPath = path.join(path.dirname(resolved.sourcePath), 'comments.json');
  const { store: comments, persistence: commentPersistence } = createCommentStore(commentsPath);
  // Source reads are scoped to this model's anchors (see source-gateway); reused by the HTTP /api/source
  // face and the context read-model so both are confined to the same allow-set.
  const sourceGateway = createAnchorScopedGateway(resolved.repoRoot, resolved.model);
  const services = buildServices(resolved, { comments, commentPersistence, sourceGateway });
  const mcpHandler = createMcpHandler(services, selection, bundle);
  let url: string;
  try {
    // A failed bind (every fall-forward port taken, or an EACCES on a privileged port) rejects here;
    // print the reason and exit non-zero rather than letting the raw error/stack reach the top-level
    // catch in cli.ts. PortUnavailableError already carries an actionable "pass --port <n>" message.
    ({ url } = await startServer({ resolved, distDir, selection, bundle, services, sourceGateway, claudeCliGateway, mcpHandler, host: opts.host, port: opts.port, allowRemote: opts.allowRemote }));
  } catch (err) {
    console.error(`\n✖ ${(err as Error).message}\n`);
    process.exit(1);
  }

  const c = resolved.model.meta && resolved.model.meta.counts;
  // show a repo-relative path when the model lives at/under cwd, else the absolute path
  // (a bundled-example fallback would otherwise print a long climbing ../../.. chain)
  const rel = path.relative(cwd, resolved.sourcePath);
  const from = (rel && !rel.startsWith('..')) ? rel : resolved.sourcePath;
  console.log(`\n  Event Storming explorer`);
  console.log(`  ${url}`);
  if (opts.allowRemote && !bindHostIsLoopback(opts.host)) {
    console.log(`\n  ⚠ REMOTE ACCESS ENABLED (--allow-remote, bound to ${opts.host}).`);
    console.log(`    The loopback Origin/Host checks are OFF; anyone who can reach this host can read`);
    console.log(`    source and trigger MCP registration. Use only on a network you trust.`);
  }
  console.log(`\n  model:     ${SOURCE_LABEL[resolved.source] || resolved.source}`);
  console.log(`  from:      ${from}`);
  console.log(`  repo-root: ${resolved.repoRoot}`);
  if (c) console.log(`  contents:  ${c.flows} flows, ${c.nodes} nodes, ${c.hotspots} hotspots`);
  for (const w of resolved.warnings || []) console.log(`  ! ${w}`);
  // A wildcard bind (0.0.0.0/::) makes `url` non-dialable: it is a bind address, not a destination.
  // Substitute a detected LAN address so the printed `claude mcp add` command actually connects; if
  // none is detected (or it is the wrong interface), tell the reader to fill in this host (issue #76).
  let connectUrl = url;
  let connectNote: string | null = null;
  if (opts.allowRemote && isWildcardBindHost(opts.host)) {
    const lan = firstLanIPv4();
    if (lan) {
      connectUrl = url.replace(`//${opts.host}:`, `//${lan}:`);
      connectNote = `${opts.host} is a bind address; using this host's LAN address ${lan}. Replace it if that is not the interface your Claude terminal reaches.`;
    } else {
      connectNote = `${opts.host} is a bind address, not reachable from a client; replace it with this host's address your Claude terminal can reach.`;
    }
  }
  console.log(`\n  Connect your Claude terminal to this session's context:`);
  console.log(`    claude mcp add --transport http event-storming ${connectUrl}/mcp`);
  if (connectNote) console.log(`    (${connectNote})`);
  console.log(`  then, in that Claude session: "explain the selected node" (click one here first).`);
  console.log(`\n  Ctrl+C to stop.\n`);

  if (opts.open) openBrowser(url);
}
