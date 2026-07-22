// The repo-root sandbox guard + line-window computation for a source anchor. PURE: node:path is
// pure computation (no fs). The fs source-gateway adapter resolves the guard, reads the file, then
// asks lineWindow() for the clamped window. Error strings match the pre-refactor source.mjs.
import path from 'node:path';

export interface SourceView {
  path: string;
  exists: boolean;
  line?: number;
  startLine?: number;
  endLine?: number;
  code?: string;
  error?: string;
}

export type GuardResult =
  | { ok: true; root: string; abs: string }
  | { ok: false; error: 'no path' | 'path escapes repo root' };

/** Resolve `relPath` inside `repoRoot`, rejecting a missing path or a `../` escape. No fs. */
export function guardPath(repoRoot: string, relPath: string | undefined | null): GuardResult {
  if (!relPath) return { ok: false, error: 'no path' };
  const root = path.resolve(repoRoot);
  const abs = path.resolve(root, relPath);
  // stay inside the repo root (guard against ../ escapes)
  if (abs !== root && !abs.startsWith(root + path.sep)) return { ok: false, error: 'path escapes repo root' };
  return { ok: true, root, abs };
}

/** Clamp `line` into [1, totalLines] and compute the [line-ctx, line+ctx] window, clamped. */
export function lineWindow(totalLines: number, line?: number, ctx = 8): { line: number; startLine: number; endLine: number } {
  const ln = Math.max(1, Math.min(line || 1, totalLines));
  const startLine = Math.max(1, ln - ctx);
  const endLine = Math.min(totalLines, ln + ctx);
  return { line: ln, startLine, endLine };
}
