// Thin client for the es-view JSON API. Framework-agnostic so the explorer components and
// the selection/context wiring share one place.

export async function fetchModel() {
  const res = await fetch('/api/model');
  if (!res.ok) throw new Error(`/api/model responded ${res.status}`);
  return res.json(); // { model, meta: { source, sourcePath, repoRoot, warnings } }
}

const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

// Selection: what the human is looking at (mirrored to the server so the MCP tool can read it).
export function pushSelection(nodeId) {
  return fetch('/api/selection', json('POST', { nodeId })).then((r) => r.json()).catch(() => null);
}

// Curated context bundle of typed refs { type: 'node' | 'flow' | 'hotspot', id }.
export const getContext = () => fetch('/api/context').then((r) => r.json()); // { items, markdown }
export const addContext = (type, id) => fetch('/api/context', json('POST', { type, id })).then((r) => r.json());
export const removeContext = (type, id) => fetch('/api/context', json('DELETE', { type, id })).then((r) => r.json());
export const clearContext = () => fetch('/api/context', json('DELETE')).then((r) => r.json());

// A single item's ready-to-paste markdown (node / flow / hotspot).
export const getItem = (type, id) => fetch('/api/item?type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(id)).then((r) => r.json());

// Human comments on items (node / flow / hotspot), persisted server-side to comments.json.
export const getComments = () => fetch('/api/comments').then((r) => r.json()); // { comments: { "type:id": [...] } }
export const addComment = (type, id, text) => fetch('/api/comments', json('POST', { type, id, text })).then((r) => r.json());
export const removeComment = (type, id, commentId) => fetch('/api/comments', json('DELETE', { type, id, commentId })).then((r) => r.json());

// MCP connection helper: the exact `claude mcp add` command, and running it on the user's behalf.
export const getMcpInfo = () => fetch('/api/mcp/info').then((r) => r.json()); // { name, url, command }
export const registerMcp = (scope) => fetch('/api/mcp/register', json('POST', { scope })).then((r) => r.json());

// Real source behind an anchor.
export function fetchSource(path, line, ctx) {
  const q = new URLSearchParams({ path, ...(line ? { line } : {}), ...(ctx ? { ctx } : {}) });
  return fetch('/api/source?' + q.toString()).then((r) => r.json());
}
