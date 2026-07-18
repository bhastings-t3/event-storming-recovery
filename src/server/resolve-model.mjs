/**
 * Resolve the model the `es-view` server should serve, from whatever the user
 * gave us (or nothing at all). Precedence, highest first:
 *
 *   1. --model <flows.json>   explicit, already-merged canonical model
 *   2. --traces <dir>         merge the per-flow trace JSONs on the fly
 *   3. auto-discover          first "model/flows.json" under cwd (then any flows.json)
 *   4. bundled example        examples/event-storming-recovery/model/flows.json (this tool's
 *                             own recovered self-model) shipped in the package
 *
 * Returns the model plus provenance so the CLI can tell the user where the data
 * came from, and a default repo-root for resolving source anchors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { mergeTracesDir } from '../lib/merge.mjs';

const IGNORE_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', '.next', 'out', 'coverage']);

/** Bounded recursive search for files named `flows.json`. Shallower matches sort first. */
function findFlowsFiles(root, maxDepth = 6) {
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
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

function readModelFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const model = JSON.parse(raw);
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.flows)) {
    throw new Error(`${file} does not look like a flows model (missing nodes/flows arrays)`);
  }
  return model;
}

/**
 * @param {object} opts
 * @param {string} [opts.modelPath]   explicit flows.json
 * @param {string} [opts.tracesDir]   directory of per-flow trace JSONs to merge
 * @param {string} [opts.repoRoot]    explicit repo root for anchor deep-links
 * @param {string} opts.cwd           where the user launched es-view
 * @param {string} opts.packageRoot   the installed package root (for the bundled example)
 * @returns {{ model, source, sourcePath, repoRoot, warnings: string[] }}
 */
export function resolveModel({ modelPath, tracesDir, repoRoot, cwd, packageRoot }) {
  const warnings = [];
  let model, source, sourcePath;

  if (modelPath) {
    sourcePath = path.resolve(cwd, modelPath);
    model = readModelFile(sourcePath);
    source = 'model';
  } else if (tracesDir) {
    sourcePath = path.resolve(cwd, tracesDir);
    const merged = mergeTracesDir(sourcePath);
    if (merged.errors.length) {
      const err = new Error(`--traces ${tracesDir} failed validation:\n  ${merged.errors.join('\n  ')}`);
      err.validation = merged;
      throw err;
    }
    warnings.push(...merged.warnings);
    model = merged.model;
    source = 'traces';
  } else {
    const discovered = findFlowsFiles(cwd);
    if (discovered.length) {
      sourcePath = discovered[0];
      model = readModelFile(sourcePath);
      source = 'discovered';
      if (discovered.length > 1) warnings.push(`found ${discovered.length} flows.json files; using ${path.relative(cwd, sourcePath) || sourcePath}. Pass --model to choose another.`);
    } else {
      sourcePath = path.join(packageRoot, 'examples', 'event-storming-recovery', 'model', 'flows.json');
      model = readModelFile(sourcePath);
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
