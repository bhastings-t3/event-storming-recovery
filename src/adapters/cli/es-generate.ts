/**
 * Generate views from the canonical flows.json:
 *   1. flows.dot      - Graphviz digraph, one cluster per flow, event-storming colors
 *   2. explorer.html  - self-contained interactive explorer (no external deps)
 *
 * Exposed as the `generate` subcommand of the unified CLI (cli.ts).
 *
 *   --repo-root  absolute path to the analyzed checkout, so the explorer's
 *                vscode:// deep links open the right local files. Defaults to the
 *                model's meta.repoRoot if present, else "." (links resolve relative
 *                to wherever the viewer opens them).
 *   --title      heading shown in the explorer + <title>. Defaults to the model's
 *                meta.title if present, else "Event Storming Explorer".
 */
import path from 'node:path';
import type { Model as ModelData } from '../../domain/model/types.js';
import { Model } from '../../domain/model/model.js';
import { generateViews } from '../../application/commands/generate-views.js';
import { readModelFile } from '../fs/model-repository.js';
import { writeViews } from '../fs/generator-writer.js';

/**
 * Render flows.dot + explorer.html from <flowsFile> into <outDir>.
 * repoRoot/title fall back to the model's meta, then to sane defaults.
 *
 * Do not trust the input blindly: run the one model validator (the same crossValidate the merge and
 * server paths use) before rendering, so a broken flows.json fails with the validator's errors
 * instead of producing a corrupt explorer or crashing mid-render.
 */
export function runGenerate(flowsFile: string, outDir: string, opts: { repoRoot?: string; title?: string } = {}): void {
  let model: ModelData;
  try {
    model = readModelFile(flowsFile);
  } catch (err) {
    console.error(`generate: cannot read a model from ${flowsFile}: ${(err as Error).message}`);
    process.exit(1);
  }

  const { errors, warnings } = Model.from(model).validate();
  if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.forEach((w) => console.log('  - ' + w)); }
  if (errors.length) {
    console.log(`\nERRORS (${errors.length}):`); errors.forEach((e) => console.log('  - ' + e));
    console.error(`\nvalidation failed: refusing to render an invalid model (${flowsFile})`);
    process.exit(1);
  }

  const repoRoot = opts.repoRoot ?? ((model.meta && model.meta.repoRoot) || '.');
  const title = opts.title ?? ((model.meta && model.meta.title) || 'Event Storming Explorer');

  try {
    const views = generateViews(model, { repoRoot, title });
    writeViews(outDir, views);
  } catch (err) {
    console.error(`generate: failed to render ${flowsFile}: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`wrote ${path.join(outDir, 'flows.dot')} and ${path.join(outDir, 'explorer.html')}`);
  console.log(`flows: ${model.flows.length}, nodes: ${model.nodes.length}, hotspots: ${model.hotspots.length}`);
}
