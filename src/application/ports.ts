// The ports: interfaces the application layer depends on, implemented by adapters. Handlers depend
// on these, never on concrete adapters. The composition root (each CLI entry) constructs the
// concrete adapters and injects them.
import type { Model, TraceSource } from '../domain/model/types.js';
import type { SourceView } from '../domain/source/source-window.js';
import type { Comment } from '../domain/comment-store/comment-store.js';

/** Read/discover/write the canonical model and its trace inputs. */
export interface ModelRepository {
  /** Read + shape-check a flows.json model file. Throws if it doesn't look like a model. */
  readModelFile(file: string): Model;
  /** Bounded recursive search for files named `flows.json` (shallower/model-dir matches first). */
  discoverFlowsFiles(root: string, maxDepth?: number): string[];
  /** Read every *.json in a dir into parsed trace docs, with parse errors and the file list. */
  readTraceDocs(dir: string): { sources: TraceSource[]; parseErrors: string[]; files: string[] };
  /** Write a model to a file (pretty-printed JSON). */
  writeModelFile(file: string, model: Model): void;
}

/** Load + persist the comments.json sidecar (best-effort, warn-once on failure). */
export interface CommentRepository {
  load(): unknown;
  persist(entries: Map<string, Comment[]>): void;
}

/** Read the real source behind an anchor, sandboxed to the repo root. */
export interface SourceGateway {
  read(repoRoot: string, relPath: string | undefined | null, line?: number, ctx?: number): SourceView;
}

export interface ClaudeCliResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  notFound: boolean;
}

/** Run `claude mcp add …` on the user's behalf. */
export interface ClaudeCliGateway {
  add(input: { name: string; url: string; scope?: string }): Promise<ClaudeCliResult>;
}

/** Open a URL in the default browser (best-effort, never throws). */
export interface BrowserGateway {
  open(url: string): void;
}

/** Deterministic time source (for `at` timestamps in tests). */
export interface Clock {
  nowIso(): string;
  nowMs(): number;
}
