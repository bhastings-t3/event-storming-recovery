// MergeTraces: read every *.json in a trace directory (via the ModelRepository port), merge them
// into a canonical Model with the domain merge, and return the merged model + validation report +
// file list. Reproduces the pre-refactor mergeTracesDir behavior (parse errors first, then the
// validator's errors; a "no trace files found" outcome when the dir is empty).
import { mergeTraceDocs } from '../../domain/model/merge.js';
import type { Model } from '../../domain/model/types.js';
import type { ModelRepository } from '../ports.js';

export interface MergeTracesResult {
  model: Model | null;
  errors: string[];
  warnings: string[];
  files: string[];
}

export function mergeTraces(tracesDir: string, repo: ModelRepository): MergeTracesResult {
  const { sources, parseErrors, files } = repo.readTraceDocs(tracesDir);
  if (files.length === 0) return { model: null, errors: ['no trace files found'], warnings: [], files: [] };
  const result = mergeTraceDocs(sources);
  return { model: result.model, errors: [...parseErrors, ...result.errors], warnings: result.warnings, files };
}
