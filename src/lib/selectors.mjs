// Framework-agnostic, DOM-free model selectors shared by the SPA (src/web/model.js
// re-exports these) and the server (src/server/context.mjs). One source of truth.

export function buildIndexes(model) {
  return {
    nodeById: new Map(model.nodes.map((n) => [n.id, n])),
    hotspotById: new Map(model.hotspots.map((h) => [h.id, h])),
  };
}

// the set of node ids a flow touches (steps + both ends of every edge)
export function flowNodeIds(f) {
  return new Set([...(f.steps || []), ...(f.edges || []).flatMap((e) => [e.from, e.to])]);
}

export function nodeFlows(model, id) {
  return model.flows.filter((f) => (f.steps || []).includes(id) || (f.edges || []).some((e) => e.from === id || e.to === id));
}

// aggregate <-> invariant cross-reference. The "enforces" relationship lives on flow edges
// (aggregate --enforces--> invariant); surface the full set regardless of the flow you came
// in from. Returns { heading, related: node[] } for aggregate/invariant nodes, else null.
export function enforcesRelation(model, nodeById, node) {
  if (node.type !== 'aggregate' && node.type !== 'invariant') return null;
  const ids = new Set();
  for (const f of model.flows) for (const e of (f.edges || [])) {
    const s = nodeById.get(e.from), t = nodeById.get(e.to);
    if (!s || !t) continue;
    if (node.type === 'aggregate' && e.from === node.id && t.type === 'invariant') ids.add(t.id);
    if (node.type === 'invariant' && e.to === node.id && s.type === 'aggregate') ids.add(s.id);
  }
  const related = [...ids].map((i) => nodeById.get(i)).filter(Boolean);
  const heading = node.type === 'aggregate'
    ? 'Enforces ' + related.length + ' invariant' + (related.length > 1 ? 's' : '')
    : 'Enforced by ' + related.length + ' aggregate' + (related.length > 1 ? 's' : '');
  return { heading, related };
}

// usages to show for a node (falls back to the primary tactical block)
export function nodeUsages(n) {
  return (n.usages && n.usages.length) ? n.usages : (n.tactical ? [{ flow: '', explanation: n.tactical.explanation, anchors: n.tactical.anchors }] : []);
}
