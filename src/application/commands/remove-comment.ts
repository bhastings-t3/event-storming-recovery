// RemoveComment: delete a comment by id from an item. No store → empty; unknown target → not-found;
// missing commentId → invalid; otherwise removes and returns the item's remaining comments.
import type { ServiceBundle } from '../services.js';
import type { Comment } from '../../domain/comment-store/comment-store.js';
import { itemExists } from '../read-models/items.js';

export type RemoveCommentResult =
  | { status: 'no-store' }
  | { status: 'not-found'; error: string }
  | { status: 'invalid'; error: string }
  | { status: 'ok'; comments: Comment[] };

export function removeComment(services: ServiceBundle, type: string, id: string | null | undefined, commentId: string | undefined): RemoveCommentResult {
  const store = services.comments;
  if (!store) return { status: 'no-store' };
  if (!id || !itemExists(services, type, id)) return { status: 'not-found', error: `unknown ${type} '${id}'` };
  if (!commentId) return { status: 'invalid', error: 'commentId required' };
  return { status: 'ok', comments: store.remove(type, id, commentId) };
}
