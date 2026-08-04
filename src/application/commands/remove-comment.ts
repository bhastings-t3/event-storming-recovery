// RemoveComment: delete a comment by id from an item. No store → empty; unknown target → not-found;
// missing commentId → invalid; otherwise removes and returns the item's remaining comments.
import type { ServiceBundle } from '../services.js';
import type { Comment } from '../../domain/comment-store/comment-store.js';
import { itemExists } from '../read-models/items.js';

export type RemoveCommentResult =
  | { status: 'no-store' }
  | { status: 'not-found'; error: string }
  | { status: 'invalid'; error: string }
  // `persisted` false (with a `reason`) means the deletion did not reach disk and is memory-only for
  // this session; the removal still took effect in memory. A DELETE must be as honest as a POST here.
  | { status: 'ok'; comments: Comment[]; persisted: boolean; reason?: string };

export function removeComment(services: ServiceBundle, type: string, id: string | null | undefined, commentId: string | undefined): RemoveCommentResult {
  const store = services.comments;
  if (!store) return { status: 'no-store' };
  if (!id || !itemExists(services, type, id)) return { status: 'not-found', error: `unknown ${type} '${id}'` };
  if (!commentId) return { status: 'invalid', error: 'commentId required' };
  const comments = store.remove(type, id, commentId); // triggers onChange → the fs adapter's atomic persist
  const health = services.commentPersistence?.status() ?? { persisted: true };
  return { status: 'ok', comments, persisted: health.persisted, ...(health.reason ? { reason: health.reason } : {}) };
}
