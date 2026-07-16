// Pure model selectors ported from generate-views.js. No DOM, no React — just data
// derivations the components and layout engine share.
import { PALETTE } from './palette.js';

export function buildIndexes(model) {
  return {
    nodeById: new Map(model.nodes.map(n => [n.id, n])),
    hotspotById: new Map(model.hotspots.map(h => [h.id, h])),
  };
}

// the set of node ids a flow touches (steps + both ends of every edge)
export function flowNodeIds(f) {
  return new Set([...(f.steps || []), ...(f.edges || []).flatMap(e => [e.from, e.to])]);
}

export function nodeFlows(model, id) {
  return model.flows.filter(f => (f.steps || []).includes(id) || (f.edges || []).some(e => e.from === id || e.to === id));
}

// types present in the model, in palette order (drives gallery/glossary filter chips + sort)
export function galleryTypes(model) {
  return Object.keys(PALETTE).filter(t => t !== 'hotspot' && model.nodes.some(n => n.type === t));
}

// sidebar grouping. 'tier' keeps the two buckets; 'actor'/'aggregate' pivot the list so each
// node of that type heads a group listing every flow it appears in. Returns [{ title, pred, color }].
export function sidebarGroups(model, groupMode, nodeById) {
  if (groupMode === 'tier') {
    return [
      { title: 'Tier 1 — domain flows', pred: f => f.tier !== 2 },
      { title: 'Tier 2 — patterns', pred: f => f.tier === 2 },
    ];
  }
  const p = PALETTE[groupMode] || PALETTE.invariant;
  const flowsByNode = new Map();                       // nodeId -> Set(flowId)
  for (const f of model.flows) for (const nid of flowNodeIds(f)) {
    const nn = nodeById.get(nid);
    if (!nn || nn.type !== groupMode) continue;
    (flowsByNode.get(nid) || flowsByNode.set(nid, new Set()).get(nid)).add(f.id);
  }
  const groups = [...flowsByNode.entries()]
    .map(([nid, fset]) => ({ node: nodeById.get(nid), fset }))
    .sort((a, b) => String(a.node.label).localeCompare(String(b.node.label)))
    .map(({ node, fset }) => ({ title: node.label, pred: f => fset.has(f.id), color: p.fill }));
  const covered = new Set();
  for (const fset of flowsByNode.values()) for (const fid of fset) covered.add(fid);
  if (model.flows.some(f => !covered.has(f.id))) groups.push({ title: 'No ' + p.name.toLowerCase(), pred: f => !covered.has(f.id) });
  return groups;
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
  const related = [...ids].map(i => nodeById.get(i)).filter(Boolean);
  const heading = node.type === 'aggregate'
    ? 'Enforces ' + related.length + ' invariant' + (related.length > 1 ? 's' : '')
    : 'Enforced by ' + related.length + ' aggregate' + (related.length > 1 ? 's' : '');
  return { heading, related };
}

// usages to show in the detail panel (falls back to the primary tactical block)
export function nodeUsages(n) {
  return (n.usages && n.usages.length) ? n.usages : (n.tactical ? [{ flow: '', explanation: n.tactical.explanation, anchors: n.tactical.anchors }] : []);
}

export function anchorUrl(repoRoot, a) {
  return 'vscode://file/' + repoRoot + '/' + a.path + (a.line ? ':' + a.line : '');
}
