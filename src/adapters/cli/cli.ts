#!/usr/bin/env node
/**
 * event-storming-recovery — unified CLI.
 *
 * One bin with three subcommands, wired with commander:
 *   view      boot the interactive explorer (default; a bare invocation runs this)
 *   merge     merge per-flow trace JSONs into one canonical flows.json
 *   generate  render flows.dot + explorer.html from a flows.json
 *
 * Each subcommand delegates to a reusable action (runView/runMerge/runGenerate);
 * this file is only the arg-parsing/dispatch layer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { runView } from './es-view.js';
import { runMerge } from './es-merge.js';
import { runGenerate } from './es-generate.js';
import { parsePort } from '../http/server.js';

/** The package root (four levels up from dist/node/adapters/cli/). */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as { version: string };

const program = new Command();

program
  .name('event-storming-recovery')
  .description('Recover a strategic Event Storming model from a codebase and explore it.')
  .version(pkg.version);

program
  .command('view', { isDefault: true })
  .description('boot the interactive Event Storming explorer')
  .argument('[model]', 'a bare path is treated as --model (already-merged flows.json)')
  .option('--model <flows.json>', 'serve this already-merged model')
  .option('--traces <dir>', 'merge the per-flow trace JSONs in <dir> on the fly')
  .option('--repo-root <path>', 'repo root for resolving source anchors (default: cwd)')
  .option('--port <n>', 'preferred port (falls forward if taken)', '5178')
  .option('--host <addr>', 'bind address', '127.0.0.1')
  .option('--allow-remote', 'permit a non-loopback --host (disables the loopback Origin/Host guard; use only on a trusted network)', false)
  .option('--no-open', "don't launch the browser")
  .action(async (model: string | undefined, options: { model?: string; traces?: string; repoRoot?: string; port: string; host: string; allowRemote: boolean; open: boolean }) => {
    let port: number;
    try {
      port = parsePort(options.port);
    } catch (err) {
      // A non-numeric or out-of-range --port would otherwise reach listen() as NaN and bind a random
      // free port silently. Fail loudly with a non-zero exit instead.
      console.error(`\n✖ ${(err as Error).message}\n`);
      process.exit(1);
    }
    await runView({
      open: options.open,
      port,
      host: options.host,
      allowRemote: options.allowRemote,
      modelPath: options.model ?? model,
      tracesDir: options.traces,
      repoRoot: options.repoRoot,
    });
  });

program
  .command('merge')
  .description('merge per-flow trace JSONs into one canonical flows.json')
  .argument('<tracesDir>', 'directory of per-flow trace JSONs')
  .argument('<outFile>', 'path to write the merged flows.json')
  .action((tracesDir: string, outFile: string) => {
    runMerge(tracesDir, outFile);
  });

program
  .command('generate')
  .description('render flows.dot + explorer.html from a flows.json')
  .argument('<flowsJson>', 'the canonical flows.json to render')
  .argument('<outDir>', 'directory to write flows.dot + explorer.html into')
  .option('--repo-root <path>', 'repo root for the explorer\'s source deep links (default: model meta or ".")')
  .option('--title <text>', 'heading + <title> (default: model meta or "Event Storming Explorer")')
  .option('--shareable', 'emit a portable explorer.html: no baked source root, so it self-heals to each reader\'s local checkout on first open (issue #74)')
  .action((flowsJson: string, outDir: string, options: { repoRoot?: string; title?: string; shareable?: boolean }) => {
    runGenerate(flowsJson, outDir, { repoRoot: options.repoRoot, title: options.title, shareable: options.shareable });
  });

program.parseAsync(process.argv).catch((err) => { console.error(err); process.exit(1); });
