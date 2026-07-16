#!/usr/bin/env node
/**
 * Merge per-flow trace JSONs (scratchpad/traces/*.json) into one canonical flows.json.
 *
 * Shared nodes (same id across flows) are merged: the merged node keeps the first-seen
 * type/label, the longest description, and accumulates every source's tactical detail
 * as a per-flow "usages" entry so the explorer can show flow-specific context.
 *
 * Usage: node merge-flows.js <tracesDir> <outFile>
 * Exits non-zero and prints a validation report if the merged model is inconsistent.
 *
 * The merge/validate logic lives in ../src/lib/merge.mjs so the `es-view` server and
 * this CLI share one implementation; this file is the CLI front end (argv, IO, exit codes).
 */
const fs = require('fs');

const tracesDir = process.argv[2];
const outFile = process.argv[3];
if (!tracesDir || !outFile) {
  console.error('usage: node merge-flows.js <tracesDir> <outFile>');
  process.exit(2);
}

(async () => {
  const { mergeTracesDir } = await import('../src/lib/merge.mjs');
  const { model, errors, warnings, files } = mergeTracesDir(tracesDir);

  if (!files.length) { console.error('no trace files found'); process.exit(2); }

  if (model) {
    fs.writeFileSync(outFile, JSON.stringify(model, null, 2));
    console.log(`merged ${files.length} trace files -> ${outFile}`);
    const unresolvedTerms = (model.meta && model.meta.counts && model.meta.counts.unresolvedTerms) || 0;
    console.log(`nodes: ${model.nodes.length}, flows: ${model.flows.length}, hotspots: ${model.hotspots.length}, terms: ${(model.terms || []).length}${unresolvedTerms ? ` (${unresolvedTerms} need input)` : ''}`);
  }
  if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.forEach(w => console.log('  - ' + w)); }
  if (errors.length) { console.log(`\nERRORS (${errors.length}):`); errors.forEach(e => console.log('  - ' + e)); process.exit(1); }
  console.log('\nvalidation: OK');
})().catch((err) => { console.error(err); process.exit(1); });
