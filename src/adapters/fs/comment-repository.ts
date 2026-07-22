// Load + persist the comments.json sidecar next to flows.json — NOT inside flows.json, which the
// recovery/merge pipeline regenerates and would wipe. Writes are best-effort: if the location isn't
// writable (e.g. the bundled example inside a global npx install), comments stay in memory for the
// session and we warn once. The keyed-map + text invariant live in the domain CommentStore; this
// adapter wires its onChange to persist and loads the prior doc. Ported from src/server/comments.mjs.
import fs from 'node:fs';
import { CommentStore } from '../../domain/comment-store/comment-store.js';

export function createCommentStore(filePath?: string): CommentStore {
  let warned = false;

  const persist = () => {
    if (!filePath) return;
    const comments: Record<string, unknown> = {};
    for (const [k, list] of store.entries()) if (list.length) comments[k] = list;
    try {
      fs.writeFileSync(filePath, JSON.stringify({ version: 1, comments }, null, 2));
    } catch (e) {
      if (!warned) { console.error(`  ! comments not persisted (${filePath}): ${(e as Error).message}`); warned = true; }
    }
  };

  const store = new CommentStore({ onChange: persist });

  if (filePath && fs.existsSync(filePath)) {
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      store.load(doc);
    } catch { /* corrupt sidecar: start empty rather than crash */ }
  }

  return store;
}
