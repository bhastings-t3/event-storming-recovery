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

    // Validate BEFORE writing: a failed validation must not leave an invalid flows.json on disk.
    // This makes the CLI agree with the server's --traces path, which throws on the same errors
    // rather than serving them. Warnings never block the write (they are advisory).
    if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.forEach((w) => console.log('  - ' + w)); }
    if (errors.length) { console.log(`\nERRORS (${errors.length}):`); errors.forEach((e) => console.log('  - ' + e)); console.error(`\nvalidation failed: refusing to write ${outFile}`); process.exit(1); }

    // model is only null when there were no trace files (handled above), so it is present here.
    writeModelFile(outFile, model!);
    console.log(`merged ${files.length} trace files -> ${outFile}`);
    const unresolvedTerms = (model!.meta && model!.meta.counts && model!.meta.counts.unresolvedTerms) || 0;
    console.log(`nodes: ${model!.nodes.length}, flows: ${model!.flows.length}, hotspots: ${model!.hotspots.length}, terms: ${(model!.terms || []).length}${unresolvedTerms ? ` (${unresolvedTerms} need input)` : ''}`);
    console.log('\nvalidation: OK');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
