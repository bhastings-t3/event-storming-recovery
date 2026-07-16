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

// Curated context bundle.
export const getContext = () => fetch('/api/context').then((r) => r.json());
export const addContext = (nodeId) => fetch('/api/context', json('POST', { nodeId })).then((r) => r.json());
export const removeContext = (nodeId) => fetch('/api/context', json('DELETE', { nodeId })).then((r) => r.json());
export const clearContext = () => fetch('/api/context', json('DELETE')).then((r) => r.json());

// A single node's grounded context + ready-to-paste markdown.
export const getNode = (id) => fetch('/api/node?id=' + encodeURIComponent(id)).then((r) => r.json());

// Real source behind an anchor.
export function fetchSource(path, line, ctx) {
  const q = new URLSearchParams({ path, ...(line ? { line } : {}), ...(ctx ? { ctx } : {}) });
  return fetch('/api/source?' + q.toString()).then((r) => r.json());
}
