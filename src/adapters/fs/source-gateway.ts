// Read the real source behind an anchor, sandboxed to the repo root. The guard + line-window are
// pure domain logic (source-window); this adapter does the fs read. Turns a vscode:// link into
// actual code the SPA can show inline and Claude can pull as grounding.
import fs from 'node:fs';
import { guardPath, lineWindow, type SourceView } from '../../domain/source/source-window.js';
import type { SourceGateway } from '../../application/ports.js';

export function readSource(repoRoot: string, relPath: string | undefined | null, line?: number, ctx = 8): SourceView {
  const g = guardPath(repoRoot, relPath);
  if (!g.ok) return { path: relPath as string, exists: false, error: g.error };
  if (!fs.existsSync(g.abs) || !fs.statSync(g.abs).isFile()) return { path: relPath as string, exists: false, error: 'not found' };
  const lines = fs.readFileSync(g.abs, 'utf8').split(/\r?\n/);
  const w = lineWindow(lines.length, line, ctx);
  return { path: relPath as string, exists: true, line: w.line, startLine: w.startLine, endLine: w.endLine, code: lines.slice(w.startLine - 1, w.endLine).join('\n') };
}

export const sourceGateway: SourceGateway = { read: readSource };
