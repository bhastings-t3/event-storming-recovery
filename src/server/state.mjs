// In-memory session state shared by the web UI and the MCP server (same process). The human
// clicks in the SPA -> setSelection / addToBundle; a connected Claude session reads the same
// state through the /mcp tools and resource. Non-persistent by design: it's the live "what am
// I looking at right now" for this run.
export function createState() {
  let selection = null;         // { nodeId, at } | null
  const bundle = new Map();     // nodeId -> { at }  (insertion-ordered)

  return {
    getSelection: () => selection,
    setSelection(nodeId) { selection = nodeId ? { nodeId, at: Date.now() } : null; return selection; },
    clearSelection() { selection = null; },

    getBundle: () => [...bundle.keys()],
    addToBundle(nodeId) { if (nodeId && !bundle.has(nodeId)) bundle.set(nodeId, { at: Date.now() }); return [...bundle.keys()]; },
    removeFromBundle(nodeId) { bundle.delete(nodeId); return [...bundle.keys()]; },
    clearBundle() { bundle.clear(); },
  };
}
