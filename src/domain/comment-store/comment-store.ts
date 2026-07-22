// Human comments on model items (node / flow / hotspot), keyed by "type:id" (stable ids) so they
// survive a model rebuild. PURE: the in-memory Map and the text-nonempty invariant live here;
// loading and persistence are the fs comment-repository adapter's job (injected via onChange).
import { randomUUID } from 'node:crypto';

export interface Comment {
  id: string;
  text: string;
  at: string;
}

export interface CommentStoreOptions {
  idGen?: () => string;
  now?: () => string;
  onChange?: () => void;
}

// Raised when a comment's text is blank/whitespace-only. Adapters map this to their transport's
// "empty comment" rejection (HTTP 400) — the same text as before.
export class EmptyCommentError extends Error {
  constructor() {
    super('empty comment');
    this.name = 'EmptyCommentError';
  }
}

const key = (type: string, id: string): string => `${type}:${id}`;

export class CommentStore {
  private readonly byKey = new Map<string, Comment[]>();
  private readonly idGen: () => string;
  private readonly now: () => string;
  private readonly onChange: () => void;

  constructor(options: CommentStoreOptions = {}) {
    this.idGen = options.idGen || (() => randomUUID().slice(0, 8));
    this.now = options.now || (() => new Date().toISOString());
    this.onChange = options.onChange || (() => {});
  }

  /** Reproduce the keyed map from a prior `{version, comments}` sidecar doc. Replaces any current state. */
  load(doc: unknown): void {
    this.byKey.clear();
    const comments = (doc && typeof doc === 'object' && (doc as { comments?: unknown }).comments) || {};
    if (comments && typeof comments === 'object') {
      for (const [k, list] of Object.entries(comments as Record<string, unknown>)) if (Array.isArray(list)) this.byKey.set(k, list as Comment[]);
    }
  }

  get(type: string, id: string): Comment[] {
    return this.byKey.get(key(type, id)) || [];
  }

  /** Only the non-empty keys (what the sidecar persists and the API `all` returns). */
  all(): Record<string, Comment[]> {
    return Object.fromEntries([...this.byKey].filter(([, l]) => l.length));
  }

  /** The current keyed map, for the repository to serialize on persist. */
  entries(): Map<string, Comment[]> {
    return this.byKey;
  }

  add(type: string, id: string, text: string): Comment {
    const trimmed = String(text).trim();
    if (!trimmed) throw new EmptyCommentError();
    const comment: Comment = { id: this.idGen(), text: trimmed, at: this.now() };
    const k = key(type, id);
    this.byKey.set(k, [...(this.byKey.get(k) || []), comment]);
    this.onChange();
    return comment;
  }

  remove(type: string, id: string, commentId: string): Comment[] {
    const k = key(type, id);
    this.byKey.set(k, (this.byKey.get(k) || []).filter((c) => c.id !== commentId));
    this.onChange();
    return this.byKey.get(k)!;
  }
}
