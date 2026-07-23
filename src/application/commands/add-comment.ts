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
  | { status: 'ok'; comments: Comment[] };

export function addComment(services: ServiceBundle, type: string, id: string | null | undefined, text: string | undefined): AddCommentResult {
  const store = services.comments;
  if (!store) return { status: 'no-store' };
  if (!id || !itemExists(services, type, id)) return { status: 'not-found', error: `unknown ${type} '${id}'` };
  const trimmed = (text || '').trim();
  if (!trimmed) return { status: 'invalid', error: 'empty comment' };
  store.add(type, id, trimmed);
  return { status: 'ok', comments: store.get(type, id) };
}
