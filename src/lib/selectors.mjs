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

// --- Data model layer -------------------------------------------------------
// Physical storage node types, in containment order (server > database > table > column).
export const DATA_TYPES = ['server', 'database', 'table', 'column'];
export const DATA_TYPE_SET = new Set(DATA_TYPES);
export const isDataNode = (n) => !!n && DATA_TYPE_SET.has(n.type);
// Behavioral -> physical edge verbs. Kept here so both renderers and the board classify them alike.
export const STORAGE_VERBS = new Set(['persists to', 'projects from', 'writes', 'reads', 'connects via']);

// Walk a node's `parent` chain to the root, returning [root, ..., node] (containment breadcrumb).
// Cycle-safe: a repeated id stops the walk (merge rejects real cycles, but never trust the input).
export function parentChain(nodeById, node) {
  const chain = [], seen = new Set();
  let cur = node;
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(cur); cur = cur.parent ? nodeById.get(cur.parent) : null; }
  return chain;
}

// Build the server > database > table > column containment forest from the flat node list.
// Nodes whose parent is missing are re-homed under a synthetic "(unattached)" bucket at their
// level so nothing is silently dropped. Returns { servers: [...], unattached: {...} }.
export function dataModelTree(model, nodeById) {
  const byId = nodeById || new Map(model.nodes.map((n) => [n.id, n]));
  const childrenOf = (id, type) => model.nodes.filter((n) => n.type === type && n.parent === id);
  const wrapTable = (t) => ({ node: t, columns: childrenOf(t.id, 'column') });
  const wrapDb = (d) => ({ node: d, tables: childrenOf(d.id, 'table').map(wrapTable) });
  const wrapServer = (s) => ({ node: s, databases: childrenOf(s.id, 'database').map(wrapDb) });

  const servers = model.nodes.filter((n) => n.type === 'server').map(wrapServer);
  // orphans: databases with no (known) server, tables with no known database, columns with no table
  const orphanDbs = model.nodes.filter((n) => n.type === 'database' && (!n.parent || !byId.has(n.parent))).map(wrapDb);
  const orphanTables = model.nodes.filter((n) => n.type === 'table' && (!n.parent || !byId.has(n.parent))).map(wrapTable);
  const orphanCols = model.nodes.filter((n) => n.type === 'column' && (!n.parent || !byId.has(n.parent)));
  const unattached = (orphanDbs.length || orphanTables.length || orphanCols.length)
    ? { databases: orphanDbs, tables: orphanTables, columns: orphanCols } : null;
  return { servers, unattached };
}

// Behavioral nodes that touch a given table, via flow edges (behavioral --verb--> table).
// Returns [{ node, verb }] deduped by (node,verb).
export function tableConsumers(model, nodeById, tableId) {
  const seen = new Set(), out = [];
  for (const f of model.flows) for (const e of (f.edges || [])) {
    if (e.to !== tableId) continue;
    const from = nodeById.get(e.from);
    if (!from || isDataNode(from)) continue;
    const key = e.from + '|' + e.verb;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ node: from, verb: e.verb });
  }
  return out;
}

// Read-model/aggregate fields that draw from a given column (reverse of fields[].sources[].ref).
// Returns [{ node, field }].
export function columnConsumers(model, columnId) {
  const out = [];
  for (const n of model.nodes) for (const fld of (n.fields || [])) {
    if ((fld.sources || []).some((s) => s.ref === columnId)) out.push({ node: n, field: fld });
  }
  return out;
}

// Tables a behavioral node writes/reads/projects, via its flow edges. Returns [{ node: table, verb }].
export function nodeStorageLinks(model, nodeById, nodeId) {
  const seen = new Set(), out = [];
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
