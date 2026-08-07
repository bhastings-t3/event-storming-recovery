// fs read of the canonical model + bounded flows.json discovery + trace-dir read + model write.
// The merge/validate logic itself is pure domain (merge.ts); this adapter supplies the fs I/O the
// ModelRepository port promises. Ported from the fs parts of resolve-model.mjs and merge.mjs.
import fs from 'node:fs';
import path from 'node:path';
import type { Model, TraceSource } from '../../domain/model/types.js';
import type { ModelRepository } from '../../application/ports.js';
import { mergeTraces, type MergeTracesResult } from '../../application/commands/merge-traces.js';

const IGNORE_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', '.next', 'out', 'coverage']);

/** Bounded recursive search for files named `flows.json`. Shallower matches sort first. */
export function findFlowsFiles(root: string, maxDepth = 6): string[] {
  const hits: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        walk(path.join(dir, e.name), depth + 1);
      } else if (e.isFile() && e.name === 'flows.json') {
        hits.push(path.join(dir, e.name));
      }
    }
  };
  walk(root, 0);
  // Prefer paths inside a `model/` directory, then shallower paths, then alphabetical.
  return hits.sort((a, b) => {
    const am = /(^|[\\/])model[\\/]flows\.json$/.test(a) ? 0 : 1;
    const bm = /(^|[\\/])model[\\/]flows\.json$/.test(b) ? 0 : 1;
    if (am !== bm) return am - bm;
    const ad = a.split(/[\\/]/).length, bd = b.split(/[\\/]/).length;
    if (ad !== bd) return ad - bd;
    return a.localeCompare(b);
  });
}

export function readModelFile(file: string): Model {
  const raw = fs.readFileSync(file, 'utf8');
  const model = JSON.parse(raw);
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.flows)) {
    throw new Error(`${file} does not look like a flows model (missing nodes/flows arrays)`);
  }
  return model;
}

/** Read every *.json in a directory into parsed trace docs (with parse errors + the file list). */
export function readTraceDocs(dir: string): { sources: TraceSource[]; parseErrors: string[]; files: string[] } {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const sources: TraceSource[] = [];
  const parseErrors: string[] = [];
  for (const file of files) {
    try {
      sources.push({ doc: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), name: file });
    } catch (e) {
      parseErrors.push(`${file}: unparseable JSON: ${(e as Error).message}`);
    }
  }
  return { sources, parseErrors, files };
}

export function writeModelFile(file: string, model: Model): void {
  // Ensure the parent dir exists before writing. recursive makes nested output paths work and is
  // idempotent, so writing next to an already-present file is unchanged. Mirrors the generate-views
  // writer, which does the same for its outDir (issues #50/#51); without it, `merge <traces> <out>`
  // into a not-yet-created directory throws a raw ENOENT (issue #76).
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(model, null, 2));
}

/** True if `dir` exists and is a directory. A missing path or any stat error (e.g. EACCES) reads as "not a usable directory". */
export function directoryExists(dir: string): boolean {
  try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}

export const modelRepository: ModelRepository = {
  readModelFile,
  discoverFlowsFiles: findFlowsFiles,
  readTraceDocs,
  directoryExists,
  writeModelFile,
};

/**
 * Read every *.json in a directory and merge them. Convenience wrapper (the pre-refactor
 * mergeTracesDir signature) kept for the CLI, the --traces resolve path, and the tests.
 */
export function mergeTracesDir(tracesDir: string): MergeTracesResult {
  return mergeTraces(tracesDir, modelRepository);
}
