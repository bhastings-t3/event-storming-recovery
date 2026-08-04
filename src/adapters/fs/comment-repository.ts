// Load + persist the comments.json sidecar next to flows.json — NOT inside flows.json, which the
// recovery/merge pipeline regenerates and would wipe. Writes are best-effort: if the location isn't
// writable (e.g. the bundled example inside a global npx install, or a --traces input dir), comments
// stay in memory for the session and we warn once. The keyed-map + text invariant live in the domain
// CommentStore; this adapter wires its onChange to persist and loads the prior doc.
//
// Two data-safety properties this adapter owns (issue #9):
//  - the write is atomic: serialise to a sibling temp file in the SAME directory, then rename over the
//    target. rename is atomic only within one filesystem, so the temp is never in os.tmpdir() (that can
//    throw EXDEV across drives on Windows). A failed or interrupted write can never leave a truncated
//    comments.json — the previous good file survives untouched.
//  - persistence health is observable: the domain onChange callback returns void, so instead of making
//    the store fs-aware we record the last write outcome here and expose it via CommentPersistence,
//    which the comment commands read to tell the client "saved" vs "kept in memory only".
import fs from 'node:fs';
import { CommentStore } from '../../domain/comment-store/comment-store.js';
import type { CommentPersistence, CommentPersistenceStatus } from '../../application/ports.js';

export interface CommentStoreHandle {
  store: CommentStore;
  persistence: CommentPersistence;
}

export function createCommentStore(filePath?: string): CommentStoreHandle {
  let warned = false;
  // Durability of the current in-memory state. Before any mutation this reflects the load: a configured
  // path is assumed durable (we just read it or it doesn't exist yet); no path means memory-only.
  let last: CommentPersistenceStatus = filePath
    ? { persisted: true }
    : { persisted: false, reason: 'no sidecar path configured; comments are kept in memory only' };

  const persist = (): void => {
    if (!filePath) return; // last already reflects memory-only
    const comments: Record<string, unknown> = {};
    for (const [k, list] of store.entries()) if (list.length) comments[k] = list;
    // temp sibling in the target's own directory so the rename stays within one filesystem
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, comments }, null, 2));
      fs.renameSync(tmp, filePath); // atomic replace; the prior comments.json is only ever swapped, never truncated
      last = { persisted: true };
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* temp may not exist if the write itself failed */ }
      const reason = `not writable (${(e as Error).message}); kept in memory for this session only`;
      last = { persisted: false, reason };
      if (!warned) { console.error(`  ! comments not persisted (${filePath}): ${reason}`); warned = true; }
    }
  };

  const store = new CommentStore({ onChange: persist });

  if (filePath && fs.existsSync(filePath)) {
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      store.load(doc);
    } catch (e) {
      // A corrupt sidecar is surfaced (one-time warning) rather than silently discarded, then we start
      // empty so the app still boots. The bad file is left on disk for the operator to inspect/recover;
      // the next successful write will atomically replace it.
      console.error(`  ! comments sidecar is corrupt (${filePath}): ${(e as Error).message} — starting with no comments (the file is left untouched).`);
    }
  }

  const persistence: CommentPersistence = { status: () => last };
  return { store, persistence };
}
