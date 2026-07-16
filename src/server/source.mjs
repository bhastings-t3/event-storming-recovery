// Read the real source behind an anchor, sandboxed to the repo root. This is what turns a
// vscode:// link into actual code the SPA can show inline and Claude can pull as grounding.
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} repoRoot  absolute repo root
 * @param {string} relPath   anchor path, relative to repoRoot
 * @param {number} [line]    1-based line the anchor points at
 * @param {number} [ctx]     lines of context above/below (default 8)
 * @returns {{ path, exists, line?, startLine?, endLine?, code?, error? }}
 */
export function readSource(repoRoot, relPath, line, ctx = 8) {
  if (!relPath) return { path: relPath, exists: false, error: 'no path' };
  const root = path.resolve(repoRoot);
  const abs = path.resolve(root, relPath);
  // stay inside the repo root (guard against ../ escapes)
  if (abs !== root && !abs.startsWith(root + path.sep)) return { path: relPath, exists: false, error: 'path escapes repo root' };
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { path: relPath, exists: false, error: 'not found' };
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const ln = Math.max(1, Math.min(line || 1, lines.length));
  const startLine = Math.max(1, ln - ctx);
  const endLine = Math.min(lines.length, ln + ctx);
  return { path: relPath, exists: true, line: ln, startLine, endLine, code: lines.slice(startLine - 1, endLine).join('\n') };
}
