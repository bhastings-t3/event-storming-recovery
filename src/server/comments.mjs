// Human comments on model items (node / flow / hotspot), persisted to a `comments.json` sidecar
// next to flows.json — NOT inside flows.json, which the recovery/merge pipeline regenerates and
// would wipe. Keyed by "type:id" (stable ids), so comments survive a model rebuild. Writes are
// best-effort: if the sidecar location isn't writable (e.g. the bundled example inside a global
// npx install), comments stay in memory for the session and we warn once.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const key = (type, id) => `${type}:${id}`;

export function createCommentStore(filePath) {
  const byKey = new Map(); // "type:id" -> [{ id, text, at }]
  let warned = false;

  if (filePath && fs.existsSync(filePath)) {
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const [k, list] of Object.entries(doc.comments || {})) if (Array.isArray(list)) byKey.set(k, list);
    } catch { /* corrupt sidecar: start empty rather than crash */ }
  }

  function persist() {
    if (!filePath) return;
    const comments = {};
    for (const [k, list] of byKey) if (list.length) comments[k] = list;
    try {
      fs.writeFileSync(filePath, JSON.stringify({ version: 1, comments }, null, 2));
    } catch (e) {
      if (!warned) { console.error(`  ! comments not persisted (${filePath}): ${e.message}`); warned = true; }
    }
  }

  return {
    filePath,
    get(type, id) { return byKey.get(key(type, id)) || []; },
    all() { return Object.fromEntries([...byKey].filter(([, l]) => l.length)); },
    add(type, id, text) {
      const comment = { id: randomUUID().slice(0, 8), text: String(text).trim(), at: new Date().toISOString() };
      const k = key(type, id);
      byKey.set(k, [...(byKey.get(k) || []), comment]);
      persist();
      return comment;
    },
    remove(type, id, commentId) {
      const k = key(type, id);
      byKey.set(k, (byKey.get(k) || []).filter((c) => c.id !== commentId));
      persist();
      return byKey.get(k);
    },
  };
}
