// AddComment: append a human comment to an item (node / flow / hotspot). No store → empty; unknown
// target → not-found; blank text → invalid; otherwise persists via the store and returns the item's
// comments. The store enforces the text-nonempty invariant; this guard preserves the 'empty comment'
// text and the store→target→text order the pre-refactor HTTP route used.
import type { ServiceBundle } from '../services.js';
import type { Comment } from '../../domain/comment-store/comment-store.js';
import { itemExists } from '../read-models/items.js';

export type AddCommentResult =
  | { status: 'no-store' }
  | { status: 'not-found'; error: string }
  | { status: 'invalid'; error: string }
  // `persisted` reports whether the write reached disk; false (with a `reason`) means the comment is
  // kept in memory only for this session (e.g. a read-only sidecar location). The command still
  // succeeds — a memory-only comment is a degraded-but-working state, not a hard error.
  | { status: 'ok'; comments: Comment[]; persisted: boolean; reason?: string };

export function addComment(services: ServiceBundle, type: string, id: string | null | undefined, text: string | undefined): AddCommentResult {
  const store = services.comments;
  if (!store) return { status: 'no-store' };
  if (!id || !itemExists(services, type, id)) return { status: 'not-found', error: `unknown ${type} '${id}'` };
  const trimmed = (text || '').trim();
  if (!trimmed) return { status: 'invalid', error: 'empty comment' };
  store.add(type, id, trimmed); // triggers the store's onChange → the fs adapter's atomic persist
  // The persist just ran synchronously; read its outcome. No persistence port (e.g. a store without a
  // backing file) is treated as durable so the shape stays honest for callers that don't persist.
  const health = services.commentPersistence?.status() ?? { persisted: true };
  return { status: 'ok', comments: store.get(type, id), persisted: health.persisted, ...(health.reason ? { reason: health.reason } : {}) };
}
