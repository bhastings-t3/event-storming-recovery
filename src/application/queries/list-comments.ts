// ListComments: comments for a specific item (type+id) or all non-empty keys; empty when no store.
import type { ServiceBundle } from '../services.js';
import type { Comment } from '../../domain/comment-store/comment-store.js';

export function listComments(services: ServiceBundle, type?: string | null, id?: string | null): { comments: Comment[] | Record<string, Comment[]> } {
  const store = services.comments;
  if (!store) return { comments: [] };
  return { comments: (type && id) ? store.get(type, id) : store.all() };
}
