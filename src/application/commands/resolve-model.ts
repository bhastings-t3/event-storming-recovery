/**
 * ResolveModel: resolve the model the `es-view` server should serve, from whatever the user gave us
 * (or nothing at all). Precedence, highest first:
 *   1. --model <flows.json>   explicit, already-merged canonical model
 *   2. --traces <dir>         merge the per-flow trace JSONs on the fly
 *   3. auto-discover          first "model/flows.json" under cwd (then any flows.json)
 *   4. bundled example        examples/event-storming-recovery/model/flows.json (this tool's own
 *                             recovered self-model) shipped in the package
 *
 * Depends on the ModelRepository port for fs discovery/read; returns the model plus provenance so
 * the CLI can tell the user where the data came from, and a default repo-root for source anchors.
 */
import path from 'node:path';
import type { ModelRepository } from '../ports.js';
import type { ResolvedModel } from '../services.js';
import { mergeTraces } from './merge-traces.js';

export interface ResolveModelOptions {
  modelPath?: string;
  tracesDir?: string;
  repoRoot?: string;
  cwd: string;
  packageRoot: string;
}

export function resolveModel({ modelPath, tracesDir, repoRoot, cwd, packageRoot }: ResolveModelOptions, repo: ModelRepository): ResolvedModel {
  const warnings: string[] = [];
  let model, source: string, sourcePath: string;

  if (modelPath) {
    sourcePath = path.resolve(cwd, modelPath);
    model = repo.readModelFile(sourcePath);
    source = 'model';
  } else if (tracesDir) {
    sourcePath = path.resolve(cwd, tracesDir);
    const merged = mergeTraces(sourcePath, repo);
    if (merged.errors.length) {
      const err = new Error(`--traces ${tracesDir} failed validation:\n  ${merged.errors.join('\n  ')}`);
      (err as Error & { validation?: unknown }).validation = merged;
      throw err;
    }
    warnings.push(...merged.warnings);
    model = merged.model!;
    source = 'traces';
  } else {
    const discovered = repo.discoverFlowsFiles(cwd);
    if (discovered.length) {
      sourcePath = discovered[0]!;
      model = repo.readModelFile(sourcePath);
      source = 'discovered';
      if (discovered.length > 1) warnings.push(`found ${discovered.length} flows.json files; using ${path.relative(cwd, sourcePath) || sourcePath}. Pass --model to choose another.`);
    } else {
      sourcePath = path.join(packageRoot, 'examples', 'event-storming-recovery', 'model', 'flows.json');
      model = repo.readModelFile(sourcePath);
      source = 'example';
    }
  }

  // Repo root for source anchors: explicit flag > (bundled self-model → the package itself, whose
  // src/ and tools/ the example's anchors point at) > model meta > cwd.
  const resolvedRepoRoot = repoRoot
    ? path.resolve(cwd, repoRoot)
    : source === 'example'
      ? packageRoot
      : (model.meta && model.meta.repoRoot) || cwd;

  return { model, source, sourcePath, repoRoot: resolvedRepoRoot, warnings };
}
