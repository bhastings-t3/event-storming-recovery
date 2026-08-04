// GenerateViews: build the two deterministic views from a canonical model — flows.dot (a Graphviz
// digraph) and explorer.html (a self-contained interactive explorer, no external deps). This is the
// composition point; the pieces live in ./generate-views/*. renderDot/renderHtml are re-exported so
// the public API and this import path are unchanged (issue #21, Target 2 / slice 21-C2). Pure string
// builders (no fs, no timestamps/random); the generator-writer adapter persists them.
import path from 'node:path';
import type { Model } from '../../domain/model/types.js';
import { renderDot } from './generate-views/dot.js';
import { renderHtml } from './generate-views/html.js';

// vscode://file/ links need an ABSOLUTE path with forward slashes, even on Windows where
// path.resolve yields backslashes. Normalize once so both views (and the reader-override in the
// emitted HTML) build a well-formed URI. Trailing slashes are trimmed so the join stays clean.
function toUriRoot(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

export interface GeneratedViews {
  dot: string;
  html: string;
}

export interface GenerateViewsOptions {
  repoRoot?: string;
  title?: string;
}

export { renderDot, renderHtml };

export function generateViews(model: Model, opts: GenerateViewsOptions = {}): GeneratedViews {
  // Resolve to an absolute path so the documented `--repo-root .` produces a working link instead
  // of a dead `vscode://file/./...` relative one, then normalize separators for the URI scheme.
  const rawRoot = opts.repoRoot ?? (((model.meta && model.meta.repoRoot) as string) || '.');
  const repoRoot = toUriRoot(path.resolve(rawRoot));
  const title = opts.title ?? (((model.meta && model.meta.title) as string) || 'Event Storming Explorer');
  return { dot: renderDot(model, repoRoot), html: renderHtml(model, repoRoot, title) };
}
