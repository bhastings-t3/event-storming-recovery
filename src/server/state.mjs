// In-memory session state shared by the web UI and the MCP server (same process). The human
// clicks in the SPA -> setSelection / addToBundle; a connected Claude session reads the same
// state through the /mcp tools and resource. Non-persistent by design: it's the live "what am
// I looking at right now" for this run.
//
// The selection is always a node (what get_current_selection returns). The bundle is a set of
// typed refs { type: 'node' | 'flow' | 'hotspot', id }, insertion-ordered, so you can gather a
// whole flow ("the graph") alongside individual nodes.
export function createState() {
  let selection = null;         // { nodeId, at } | null
  const bundle = new Map();     // "type:id" -> { type, id, at }

  const key = (type, id) => `${type}:${id}`;

  return {
    getSelection: () => selection,
    setSelection(nodeId) { selection = nodeId ? { nodeId, at: Date.now() } : null; return selection; },
    clearSelection() { selection = null; },

    getBundle: () => [...bundle.values()].map(({ type, id }) => ({ type, id })),
    addToBundle(type, id) { if (id && !bundle.has(key(type, id))) bundle.set(key(type, id), { type, id, at: Date.now() }); return this.getBundle(); },
    removeFromBundle(type, id) { bundle.delete(key(type, id)); return this.getBundle(); },
    clearBundle() { bundle.clear(); },
  };
}
