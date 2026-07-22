/**
 * Merge per-flow trace JSONs (scratchpad/traces/*.json) into one canonical flows.json.
 *
 * Shared nodes (same id across flows) are merged: the merged node keeps the first-seen
 * type/label, the longest description, and accumulates every source's tactical detail
 * as a per-flow "usages" entry so the explorer can show flow-specific context.
 *
 * Exposed as the `merge` subcommand of the unified CLI (cli.ts). Exits non-zero and
 * prints a validation report if the merged model is inconsistent.
 *
 * The merge/validate logic lives in the domain (merge.ts) so the `es-view` server and this CLI
 * share one implementation; this file is the reusable action (IO, exit codes).
 */
import { mergeTracesDir, writeModelFile } from '../fs/model-repository.js';

/** Merge every trace JSON in <tracesDir> into <outFile>. Prints a report; exits non-zero on invalid models. */
export function runMerge(tracesDir: string, outFile: string): void {
  try {
    const { model, errors, warnings, files } = mergeTracesDir(tracesDir);

    if (!files.length) { console.error('no trace files found'); process.exit(2); }

    if (model) {
      writeModelFile(outFile, model);
      console.log(`merged ${files.length} trace files -> ${outFile}`);
      const unresolvedTerms = (model.meta && model.meta.counts && model.meta.counts.unresolvedTerms) || 0;
      console.log(`nodes: ${model.nodes.length}, flows: ${model.flows.length}, hotspots: ${model.hotspots.length}, terms: ${(model.terms || []).length}${unresolvedTerms ? ` (${unresolvedTerms} need input)` : ''}`);
    }
    if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.forEach((w) => console.log('  - ' + w)); }
    if (errors.length) { console.log(`\nERRORS (${errors.length}):`); errors.forEach((e) => console.log('  - ' + e)); process.exit(1); }
    console.log('\nvalidation: OK');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
