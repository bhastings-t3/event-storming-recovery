#!/usr/bin/env node
/**
 * es-view — boot the interactive Event Storming explorer.
 *
 *   npx event-storming-recovery view [options]
 *
 * Resolves a model (or falls back to the bundled example), starts one local
 * server that serves the SPA + JSON API, and opens the browser.
 *
 * Options:
 *   --model <flows.json>   serve this already-merged model
 *   --traces <dir>         merge the per-flow trace JSONs in <dir> on the fly
 *   --repo-root <path>     repo root for resolving source anchors (default: cwd)
 *   --port <n>             preferred port (default 5178; falls forward if taken)
 *   --host <addr>          bind address (default 127.0.0.1)
 *   --no-open              don't launch the browser
 *   -h, --help             show this help
 *
 * This is the composition root: it parses args, constructs the concrete adapters, injects them
 * into the application layer, and starts the server.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModel } from '../../application/commands/resolve-model.js';
import { buildServices } from '../../application/services.js';
import { startServer } from '../http/server.js';
import { Selection } from '../../domain/session/selection.js';
import { ContextBundle } from '../../domain/session/context-bundle.js';
import { createCommentStore } from '../fs/comment-repository.js';
import { createMcpHandler } from '../mcp/mcp-server.js';
import { openBrowser } from '../process/browser.js';
import { modelRepository } from '../fs/model-repository.js';
import { sourceGateway } from '../fs/source-gateway.js';
import { claudeCliGateway } from '../process/claude-cli.js';

/** The package root (four levels up from dist/node/adapters/cli/). */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

interface Options {
  open: boolean;
  port: number;
  host: string;
  modelPath?: string;
  tracesDir?: string;
  repoRoot?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { open: true, port: 5178, host: '127.0.0.1' };
  const args = [...argv];
  // allow an optional leading `view` subcommand
  if (args[0] === 'view') args.shift();
  while (args.length) {
    const a = args.shift();
    switch (a) {
      case '--model': opts.modelPath = args.shift(); break;
      case '--traces': opts.tracesDir = args.shift(); break;
      case '--repo-root': opts.repoRoot = args.shift(); break;
      case '--port': opts.port = Number(args.shift()); break;
      case '--host': opts.host = args.shift()!; break;
      case '--no-open': opts.open = false; break;
      case '--open': opts.open = true; break;
      case '-h': case '--help': opts.help = true; break;
      default:
        if (a && a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
        // a bare path is treated as --model for convenience
        else if (a) opts.modelPath = a;
    }
  }
  return opts;
}

const HELP = `es-view — interactive Event Storming explorer

Usage:
  npx event-storming-recovery view [options]

Options:
  --model <flows.json>   serve this already-merged model
  --traces <dir>         merge per-flow trace JSONs in <dir> on the fly
  --repo-root <path>     repo root for source anchors (default: cwd)
  --port <n>             preferred port (default 5178)
  --host <addr>          bind address (default 127.0.0.1)
  --no-open              don't launch the browser
  -h, --help             show this help

With no --model/--traces, es-view auto-discovers a **/model/flows.json under the
current directory, and falls back to the bundled example (this tool's own self-model).`;

const SOURCE_LABEL: Record<string, string> = {
  model: 'explicit --model',
  traces: 'merged from --traces',
  discovered: 'auto-discovered in this directory',
  example: 'bundled example — this tool\'s own self-model (no model found here)',
};

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return; }

  const cwd = process.cwd();
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
  // human comments persist to a sidecar next to the model (survives model regeneration)
  const commentsPath = path.join(path.dirname(resolved.sourcePath), 'comments.json');
  const comments = createCommentStore(commentsPath);
  const services = buildServices(resolved, { comments, sourceGateway });
  const mcpHandler = createMcpHandler(services, selection, bundle);
  const { url } = await startServer({ resolved, distDir, selection, bundle, services, sourceGateway, claudeCliGateway, mcpHandler, host: opts.host, port: opts.port });

  const c = resolved.model.meta && resolved.model.meta.counts;
  // show a repo-relative path when the model lives at/under cwd, else the absolute path
  // (a bundled-example fallback would otherwise print a long climbing ../../.. chain)
  const rel = path.relative(cwd, resolved.sourcePath);
  const from = (rel && !rel.startsWith('..')) ? rel : resolved.sourcePath;
  console.log(`\n  Event Storming explorer`);
  console.log(`  ${url}`);
  console.log(`\n  model:     ${SOURCE_LABEL[resolved.source] || resolved.source}`);
  console.log(`  from:      ${from}`);
  console.log(`  repo-root: ${resolved.repoRoot}`);
  if (c) console.log(`  contents:  ${c.flows} flows, ${c.nodes} nodes, ${c.hotspots} hotspots`);
  for (const w of resolved.warnings || []) console.log(`  ! ${w}`);
  console.log(`\n  Connect your Claude terminal to this session's context:`);
  console.log(`    claude mcp add --transport http event-storming ${url}/mcp`);
  console.log(`  then, in that Claude session: "explain the selected node" (click one here first).`);
  console.log(`\n  Ctrl+C to stop.\n`);

  if (opts.open) openBrowser(url);
}

main().catch((err) => { console.error(err); process.exit(1); });
