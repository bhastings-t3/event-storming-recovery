// SPA-facing model selectors. The pure, framework-agnostic ones live in src/lib/selectors.mjs
// (shared with the server); re-exported here. The palette-dependent ones stay local.
import { PALETTE } from './palette.js';
import { flowNodeIds, nodeFlows } from '../application/read-models/indexes';

export {
  buildIndexes, flowNodeIds, nodeFlows, enforcesRelation, nodeUsages,
  DATA_TYPES, DATA_TYPE_SET, isDataNode, STORAGE_VERBS,
  parentChain, dataModelTree, isRecordSet, fieldTree, datastoreConsumers, fieldConsumers, nodeStorageLinks,
} from '../application/read-models/indexes';

// types present in the model, in palette order (drives the Gallery filter chips + sort)
export function galleryTypes(model) {
  return Object.keys(PALETTE).filter((t) => t !== 'hotspot' && model.nodes.some((n) => n.type === t));
}

// Node types the Glossary tracks as ubiquitous-language vocabulary. Physical storage (datastore,
// field) and rule nodes (invariant) are substrate, not verbiage, so they stay in the Gallery
// (galleryTypes) but must not bloat the domain glossary. See issue #11.
const NON_GLOSSARY_TYPES = new Set(['datastore', 'field', 'invariant']);
export function glossaryTypes(model) {
  return galleryTypes(model).filter((t) => !NON_GLOSSARY_TYPES.has(t));
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

// --- Search --------------------------------------------------------------
// Shared by Sidebar/Gallery/Glossary so a query like "operator boots" matches regardless of
// word order, and a flow/sticky surfaces even when the term only lives in a related item
// (a flow's step label, or a sticky's containing flow) rather than its own name/label.

// lowercase, split on whitespace, drop empties
export function queryTokens(q) {
  return (q || '').toLowerCase().split(/\s+/).filter(Boolean);
}

// every token must appear somewhere in the haystack (AND semantics) — order/adjacency don't matter
export function matchesQuery(haystack, tokens) {
  return tokens.every((t) => haystack.includes(t));
}

// lowercased search haystack for a flow: its own fields, plus the label/description of every
// node it touches (so e.g. "glossary" in a step's description still surfaces the flow)
export function flowSearchText(model, nodeById, flow) {
  const parts = [flow.name, flow.id, flow.summary, flow.trigger];
  for (const nid of flowNodeIds(flow)) {
    const n = nodeById.get(nid);
    if (!n) continue;
    parts.push(n.label, n.description);
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// lowercased search haystack for a node: its own fields, the palette type name, and the name of
// every flow it appears in (so e.g. a flow title's word still finds the stickies in that flow)
export function nodeSearchText(model, node, typeName) {
  const parts = [node.label, node.description, typeName];
  for (const f of nodeFlows(model, node.id)) parts.push(f.name);
  return parts.filter(Boolean).join(' ').toLowerCase();
}
