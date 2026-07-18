// SPA-facing model selectors. The pure, framework-agnostic ones live in src/lib/selectors.mjs
// (shared with the server); re-exported here. The palette-dependent ones stay local.
import { PALETTE } from './palette.js';
import { flowNodeIds } from '../lib/selectors.mjs';

export {
  buildIndexes, flowNodeIds, nodeFlows, enforcesRelation, nodeUsages,
  DATA_TYPES, DATA_TYPE_SET, isDataNode, STORAGE_VERBS,
  parentChain, dataModelTree, tableConsumers, columnConsumers, nodeStorageLinks,
} from '../lib/selectors.mjs';

// types present in the model, in palette order (drives gallery/glossary filter chips + sort)
export function galleryTypes(model) {
  return Object.keys(PALETTE).filter((t) => t !== 'hotspot' && model.nodes.some((n) => n.type === t));
}

// sidebar grouping. 'tier' keeps the two buckets; 'actor'/'aggregate' pivot the list so each
// node of that type heads a group listing every flow it appears in. Returns [{ title, pred, color }].
export function sidebarGroups(model, groupMode, nodeById) {
  if (groupMode === 'tier') {
    return [
      { title: 'Tier 1 — domain flows', pred: (f) => f.tier !== 2 },
      { title: 'Tier 2 — patterns', pred: (f) => f.tier === 2 },
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
    .map(({ node, fset }) => ({ title: node.label, pred: (f) => fset.has(f.id), color: p.fill }));
  const covered = new Set();
  for (const fset of flowsByNode.values()) for (const fid of fset) covered.add(fid);
  if (model.flows.some((f) => !covered.has(f.id))) groups.push({ title: 'No ' + p.name.toLowerCase(), pred: (f) => !covered.has(f.id) });
  return groups;
}

export function anchorUrl(repoRoot, a) {
  return 'vscode://file/' + repoRoot + '/' + a.path + (a.line ? ':' + a.line : '');
}
