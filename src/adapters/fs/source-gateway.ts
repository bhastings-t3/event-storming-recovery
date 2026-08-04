// Read the real source behind an anchor. The guard + line-window are pure domain logic
// (source-window); this adapter does the fs read. Turns a vscode:// link into actual code the SPA
// can show inline and Claude can pull as grounding.
//
// Reads are scoped to the model's *anchors*, not the whole repo root: an unauthenticated caller may
// only read files the model actually references (never `.env`, `.git/`, or other in-root secrets that
// merely happen to sit under the repo root). Every candidate is realpath-normalised, so a symlink that
// resolves outside the anchor set is refused too.
import fs from 'node:fs';
import { guardPath, lineWindow, type SourceView } from '../../domain/source/source-window.js';
import type { SourceGateway } from '../../application/ports.js';
import type { Model } from '../../domain/model/types.js';

interface AnchorLike { path?: unknown }

/**
 * The set of on-disk realpaths for every source anchor in the model. Anchors live on nodes
 * (`tactical.anchors`, `usages[].anchors`) and hotspots (`tactical.anchors`); a `path` is
 * repo-root-relative (the same value deep links and `/api/source?path=` carry). Realpath-normalising
 * here means a later request whose path resolves — directly or through a symlink — to anything but an
 * anchor's real target is refused.
 */
function collectAnchorRealpaths(repoRoot: string, model: Model): Set<string> {
  const rels = new Set<string>();
  const add = (anchors: AnchorLike[] | undefined) => {
    for (const a of anchors || []) if (a && typeof a.path === 'string') rels.add(a.path);
  };
  for (const n of model.nodes || []) {
    add(n.tactical?.anchors);
    for (const u of n.usages || []) add(u.anchors);
  }
  for (const h of model.hotspots || []) add(h.tactical?.anchors);

  const realpaths = new Set<string>();
  for (const rel of rels) {
    const g = guardPath(repoRoot, rel);
    if (!g.ok) continue;
    try { realpaths.add(fs.realpathSync(g.abs)); } catch { /* anchor file missing on disk; drop it */ }
  }
  return realpaths;
}

function readAnchoredSource(repoRoot: string, allowed: Set<string>, relPath: string | undefined | null, line?: number, ctx = 8): SourceView {
  const g = guardPath(repoRoot, relPath);
  if (!g.ok) return { path: relPath as string, exists: false, error: g.error };
  if (!fs.existsSync(g.abs) || !fs.statSync(g.abs).isFile()) return { path: relPath as string, exists: false, error: 'not found' };
  let real: string;
  try { real = fs.realpathSync(g.abs); } catch { return { path: relPath as string, exists: false, error: 'not found' }; }
  if (!allowed.has(real)) return { path: relPath as string, exists: false, error: 'not a model anchor' };
  const lines = fs.readFileSync(g.abs, 'utf8').split(/\r?\n/);
  const w = lineWindow(lines.length, line, ctx);
  return { path: relPath as string, exists: true, line: w.line, startLine: w.startLine, endLine: w.endLine, code: lines.slice(w.startLine - 1, w.endLine).join('\n') };
}

/**
 * A SourceGateway whose reads are confined to the anchors of `model` (resolved against `repoRoot`).
 * The anchor allow-set is computed once at construction; the port's `repoRoot` argument is ignored in
 * favour of the one the set was built from (the composition root passes the same value on every call).
 */
export function createAnchorScopedGateway(repoRoot: string, model: Model): SourceGateway {
  const allowed = collectAnchorRealpaths(repoRoot, model);
  return { read: (_repoRoot, relPath, line, ctx) => readAnchoredSource(repoRoot, allowed, relPath, line, ctx) };
}
