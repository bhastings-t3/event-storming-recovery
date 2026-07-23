// Framework-agnostic, DOM-free model selectors shared by the SPA (src/web/model.js re-exports
// these) and the server-side read-models (context.ts). One source of truth. Ported verbatim from
// the pre-refactor src/lib/selectors.mjs.
import type { Model, Node, Flow, Hotspot, Anchor } from '../../domain/model/types.js';

export interface Indexes {
  nodeById: Map<string, Node>;
  hotspotById: Map<string, Hotspot>;
}

export interface NodeUsage {
  flow: string;
  explanation?: string;
  anchors?: Anchor[];
}

export interface EnforcesRelation {
  heading: string;
  related: Node[];
}

export interface DataTree {
  node: Node;
  stores: DataTree[];
  fields: Node[];
}

export interface FieldTreeNode {
  node: Node;
  children: FieldTreeNode[];
}

export function buildIndexes(model: Model): Indexes {
  return {
    nodeById: new Map(model.nodes.map((n) => [n.id, n])),
    hotspotById: new Map(model.hotspots.map((h) => [h.id, h])),
  };
}

// the set of node ids a flow touches (steps + both ends of every edge)
export function flowNodeIds(f: Flow): Set<string> {
  return new Set([...(f.steps || []), ...(f.edges || []).flatMap((e) => [e.from, e.to])]);
}

export function nodeFlows(model: Model, id: string): Flow[] {
  return model.flows.filter((f) => (f.steps || []).includes(id) || (f.edges || []).some((e) => e.from === id || e.to === id));
}

// aggregate <-> invariant cross-reference. The "enforces" relationship lives on flow edges
// (aggregate --enforces--> invariant); surface the full set regardless of the flow you came
// in from. Returns { heading, related: node[] } for aggregate/invariant nodes, else null.
export function enforcesRelation(model: Model, nodeById: Map<string, Node>, node: Node): EnforcesRelation | null {
  if (node.type !== 'aggregate' && node.type !== 'invariant') return null;
  const ids = new Set<string>();
  for (const f of model.flows) for (const e of (f.edges || [])) {
    const s = nodeById.get(e.from), t = nodeById.get(e.to);
    if (!s || !t) continue;
    if (node.type === 'aggregate' && e.from === node.id && t.type === 'invariant') ids.add(t.id);
    if (node.type === 'invariant' && e.to === node.id && s.type === 'aggregate') ids.add(s.id);
  }
  const related = [...ids].map((i) => nodeById.get(i)).filter((n): n is Node => Boolean(n));
  const heading = node.type === 'aggregate'
    ? 'Enforces ' + related.length + ' invariant' + (related.length > 1 ? 's' : '')
    : 'Enforced by ' + related.length + ' aggregate' + (related.length > 1 ? 's' : '');
  return { heading, related };
}

// usages to show for a node (falls back to the primary tactical block)
export function nodeUsages(n: Node): NodeUsage[] {
  return (n.usages && n.usages.length) ? n.usages : (n.tactical ? [{ flow: '', explanation: n.tactical.explanation, anchors: n.tactical.anchors }] : []);
}

// --- Data model layer -------------------------------------------------------
// Technology-neutral storage node types. A `datastore` is any container of data and nests inside
// another datastore (server ▸ database ▸ table, or filesystem ▸ directory ▸ file, or broker ▸ queue,
// …); a `field` is a stored attribute (a column, a JSON key, a message field) hanging off a
// datastore (or a nested field). The `storeKind`/`fieldKind` label carries the concrete flavor.
export const DATA_TYPES = ['datastore', 'field'];
export const DATA_TYPE_SET = new Set(DATA_TYPES);
export const isDataNode = (n: Node | undefined | null): boolean => !!n && DATA_TYPE_SET.has(n.type);
// Behavioral -> storage edge verbs. Kept here so both renderers and the board classify them alike.
export const STORAGE_VERBS = new Set(['persists to', 'projects from', 'writes', 'reads', 'connects via']);

// Walk a node's `parent` chain to the root, returning [root, ..., node] (containment breadcrumb).
// Cycle-safe: a repeated id stops the walk (merge rejects real cycles, but never trust the input).
export function parentChain(nodeById: Map<string, Node>, node: Node): Node[] {
  const chain: Node[] = [], seen = new Set<string>();
  let cur: Node | null | undefined = node;
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(cur); cur = cur.parent ? nodeById.get(cur.parent) : null; }
  return chain;
}

// Build the datastore containment forest from the flat node list. Each datastore subtree carries its
// child datastores (recursively) and the fields parented directly to it. Arbitrary depth: the same
// shape holds server▸database▸table▸column, filesystem▸directory▸file▸key, broker▸queue▸field, etc.
// A datastore whose parent is missing or is not itself a datastore becomes a root, so nothing is
// dropped. Returns { roots: [...], looseFields: [...] } (fields orphaned from any datastore).
export function dataModelTree(model: Model, nodeById?: Map<string, Node>): { roots: DataTree[]; looseFields: Node[] } {
  const byId = nodeById || new Map(model.nodes.map((n) => [n.id, n]));
  const stores = model.nodes.filter((n) => n.type === 'datastore');
  const fields = model.nodes.filter((n) => n.type === 'field');
  const childStores = (id: string) => stores.filter((n) => n.parent === id);
  const childFields = (id: string) => fields.filter((n) => n.parent === id);
  const seen = new Set<string>();
  const build = (ds: Node): DataTree => {
    if (seen.has(ds.id)) return { node: ds, stores: [], fields: [] }; // cycle guard
    seen.add(ds.id);
    return { node: ds, stores: childStores(ds.id).map(build), fields: childFields(ds.id) };
  };
  const isRoot = (n: Node) => !n.parent || !byId.has(n.parent) || (byId.get(n.parent) || {} as Node).type !== 'datastore';
  const roots = stores.filter(isRoot).map(build);
  const placed = new Set<string>();
  const walk = (t: DataTree) => { t.fields.forEach((f) => placed.add(f.id)); t.stores.forEach(walk); };
  roots.forEach(walk);
  // a field whose parent is another field is shown by the datastore card via fieldTree(); a field
  // parented to nothing/non-storage is loose.
  const looseFields = fields.filter((f) => !placed.has(f.id) && (!f.parent || (byId.get(f.parent) || {} as Node).type !== 'field'));
  return { roots, looseFields };
}

// Is this datastore a "record set" (a table/file/queue that behavior touches and fields hang off),
// as opposed to a pure container (a server/database/directory)? Drives card-vs-header rendering.
export function isRecordSet(model: Model, nodeById: Map<string, Node>, ds: Node | undefined | null): boolean {
  if (!ds || ds.type !== 'datastore') return false;
  const hasFields = model.nodes.some((n) => n.type === 'field' && n.parent === ds.id);
  const hasStoreChildren = model.nodes.some((n) => n.type === 'datastore' && n.parent === ds.id);
  const isTarget = model.flows.some((f) => (f.edges || []).some((e) => e.to === ds.id));
  return hasFields || isTarget || !hasStoreChildren;
}

// Fields parented directly to a datastore, each with its own nested sub-fields (for record shapes
// with sub-documents). Returns [{ node, children: [...] }].
export function fieldTree(model: Model, parentId: string): FieldTreeNode[] {
  const kids = model.nodes.filter((n) => n.type === 'field' && n.parent === parentId);
  const build = (f: Node, seen: Set<string>): FieldTreeNode => (seen.has(f.id) ? { node: f, children: [] } : (seen.add(f.id), { node: f, children: model.nodes.filter((n) => n.type === 'field' && n.parent === f.id).map((c) => build(c, seen)) }));
  return kids.map((f) => build(f, new Set<string>()));
}

// Behavioral nodes that touch a given datastore, via flow edges (behavioral --verb--> datastore).
// Returns [{ node, verb }] deduped by (node,verb).
export function datastoreConsumers(model: Model, nodeById: Map<string, Node>, storeId: string): { node: Node; verb: string }[] {
  const seen = new Set<string>(), out: { node: Node; verb: string }[] = [];
  for (const f of model.flows) for (const e of (f.edges || [])) {
    if (e.to !== storeId) continue;
    const from = nodeById.get(e.from);
    if (!from || isDataNode(from)) continue;
    const key = e.from + '|' + e.verb;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ node: from, verb: e.verb });
  }
  return out;
}

// Read-model/aggregate fields that draw from a given stored field (reverse of fields[].sources[].ref).
// Returns [{ node, field }].
export function fieldConsumers(model: Model, fieldId: string): { node: Node; field: import('../../domain/model/types.js').Field }[] {
  const out: { node: Node; field: import('../../domain/model/types.js').Field }[] = [];
  for (const n of model.nodes) for (const fld of (n.fields || [])) {
    if ((fld.sources || []).some((s) => s.ref === fieldId)) out.push({ node: n, field: fld });
  }
  return out;
}

// Datastores a behavioral node writes/reads/projects, via its flow edges. Returns [{ node, verb }].
export function nodeStorageLinks(model: Model, nodeById: Map<string, Node>, nodeId: string): { node: Node; verb: string }[] {
  const seen = new Set<string>(), out: { node: Node; verb: string }[] = [];
  for (const f of model.flows) for (const e of (f.edges || [])) {
    if (e.from !== nodeId) continue;
    const to = nodeById.get(e.to);
    if (!to || !isDataNode(to)) continue;
    const key = e.to + '|' + e.verb;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ node: to, verb: e.verb });
  }
  return out;
}
