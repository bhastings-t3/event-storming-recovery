// Assemble the grounded context for a node/flow/hotspot: what it is, the invariants it enforces (or
// is enforced by), the flows it lives in, the recovered data model, and the REAL source behind each
// anchor. This is the payload the SPA shows inline and the MCP tools hand to Claude so a refactor
// request is anchored to actual files, not just a label. Ported from src/server/context.mjs; the
// rendered Markdown is byte-identical (MCP + copy-for-claude output).
import {
  nodeFlows, enforcesRelation, nodeUsages, flowNodeIds,
  isDataNode, parentChain, datastoreConsumers, fieldConsumers, nodeStorageLinks,
} from './indexes.js';
import { PALETTE } from '../../domain/model/palette.js';
import type { Flow, Node } from '../../domain/model/types.js';
import type { SourceView } from '../../domain/source/source-window.js';
import type { Comment } from '../../domain/comment-store/comment-store.js';
import type { ServiceBundle } from '../services.js';

// The Markdown renderers moved to context-markdown.ts (builders vs presentation split, #21 Target 4).
// Re-exported here so every importer keeps a single entry point and stays untouched.
export {
  renderNodeContextMarkdown,
  renderItemMarkdown,
  renderBundleMarkdown,
  renderHotspotMarkdown,
  renderDataModelMarkdown,
  renderFlowMarkdown,
} from './context-markdown.js';

interface FieldSourceView { ref: string | null; label: string | null; role: string | null; transform: string | null; note: string | null; }
interface FieldView { name: string; dataType: string | null; conceptual: boolean; confidence: string | null; derivation: string; sources: FieldSourceView[]; }
interface BreadcrumbItem { id: string; type: string; label: string; storeKind: string | null; }
interface ContainedItem { id: string; label: string; dataType: string | null; fieldKind: string | null; }
interface UsedByItem { id: string; label: string; type: string; verb: string; }
interface StorageItem { id: string; label: string; verb: string; }
interface FlowRef { id: string; name: string | undefined; status: string; kind: string | null; }
interface RelatedView { heading: string; nodes: { id: string; type: string; label: string }[]; }
interface UsageView { flow: string | null; explanation: string; }
interface AnchorView { path: string; line: number | null; symbol: string | null; note: string | null; flow: string | null; source?: SourceView; }

export interface NodeContext {
  id: string;
  type: string;
  label: string;
  description: string;
  inferred: boolean;
  ownedBy: string | null;
  synchronous: boolean;
  provenance: string[] | null;
  storeKind: string | null;
  fieldKind: string | null;
  host: string | null;
  engine: string | null;
  fields: FieldView[];
  breadcrumb: BreadcrumbItem[] | null;
  contained: ContainedItem[] | null;
  usedBy: UsedByItem[] | null;
  storage: StorageItem[] | null;
  flows: FlowRef[];
  related: RelatedView | null;
  usages: UsageView[];
  anchors: AnchorView[];
  comments: Comment[];
}

export interface FlowEdgeView { from: string; to: string; verb: string; fromLabel: string; toLabel: string; }
export interface FlowHotspotView { id: string; label: string; description: string; }
export interface FlowContext {
  id: string;
  name: string | undefined;
  status: string;
  kind: string | null;
  summary: string;
  trigger: string;
  supersededBy: string | null;
  edges: FlowEdgeView[];
  hotspots: FlowHotspotView[];
  nodes: NodeContext[];
  mermaid: string;
  comments: Comment[];
  // Set only when the grounding cap engaged: the one-line note the renderer appends so a Claude
  // terminal knows the tail was grounded by anchor only (and how to reach the rest). null otherwise.
  groundingNote: string | null;
}

// Upper bound on how many of a flow's nodes carry a full source excerpt in one get_flow / bundle
// response. Beyond it, a node still ships its anchor reference (path/line/symbol) but no code, so a
// pathologically large flow can't blow the connected terminal's token budget. Set comfortably above
// the largest real flow (the self-model's biggest grounds 14 nodes) so typical and self-model output
// is unaffected and byte-identical; the cap only ever engages on a pathological flow. Reachability is
// preserved — every capped node is still retrievable via get_node. See issue #11
// (hot-mcp-grounded-output-unbounded). Overridable per-call via buildFlowContext's maxGroundedNodes.
export const DEFAULT_MAX_GROUNDED_NODES = 40;

export interface HotspotContext {
  id: string;
  label: string;
  description: string;
  explanation: string;
  anchors: AnchorView[];
  comments: Comment[];
}

/**
 * Assemble a node's grounded context.
 */
export function buildNodeContext(services: ServiceBundle, nodeId: string, { includeSource = true }: { includeSource?: boolean } = {}): NodeContext | null {
  const { model, indexes, repoRoot } = services;
  const n = indexes.nodeById.get(nodeId);
  if (!n) return null;

  const nodeById = indexes.nodeById;
  const flows: FlowRef[] = nodeFlows(model, nodeId).map((f) => ({ id: f.id, name: f.name, status: f.status || 'live', kind: f.kind || null }));
  const rel = enforcesRelation(model, nodeById, n);
  const usages = nodeUsages(n);
  const dataNode = isDataNode(n);

  // Conceptual fields (read models / aggregates): each a prose derivation over 0..N storage sources.
  const fields: FieldView[] = (n.fields || []).map((fld) => ({
    name: fld.name,
    dataType: fld.dataType || null,
    conceptual: !!fld.conceptual,
    confidence: fld.confidence || null,
    derivation: fld.derivation || '',
    sources: (fld.sources || []).map((s) => {
      const col = /^(ds|fld)-/.test(s.ref || '') ? nodeById.get(s.ref!) : null;
      return { ref: s.ref || null, label: col ? col.label : (s.ref || null), role: s.role || null, transform: s.transform || null, note: s.note || null };
    }),
  }));

  // Physical-storage grounding: containment breadcrumb, contained fields, and what depends on it.
  const breadcrumb: BreadcrumbItem[] | null = dataNode ? parentChain(nodeById, n).map((c) => ({ id: c.id, type: c.type, label: c.label, storeKind: c.storeKind || c.fieldKind || null })) : null;
  const contained: ContainedItem[] | null = n.type === 'datastore'
    ? model.nodes.filter((x) => x.type === 'field' && x.parent === n.id).map((c) => ({ id: c.id, label: c.label, dataType: c.dataType || null, fieldKind: c.fieldKind || null }))
    : null;
  const usedBy: UsedByItem[] | null = n.type === 'datastore'
    ? datastoreConsumers(model, nodeById, n.id).map((c) => ({ id: c.node.id, label: c.node.label, type: c.node.type, verb: c.verb }))
    : n.type === 'field'
      ? fieldConsumers(model, n.id).map((c) => ({ id: c.node.id, label: c.node.label, type: c.node.type, verb: 'field ' + c.field.name }))
      : null;
  const storage: StorageItem[] | null = !dataNode ? nodeStorageLinks(model, nodeById, n.id).map((s) => ({ id: s.node.id, label: s.node.label, verb: s.verb })) : null;

  const anchors: AnchorView[] = [];
  for (const u of usages) {
    for (const a of (u.anchors || [])) {
      const entry: AnchorView = { path: a.path, line: a.line || null, symbol: a.symbol || null, note: a.note || null, flow: u.flow || null };
      if (includeSource) entry.source = services.readSource(repoRoot, a.path, a.line);
      anchors.push(entry);
    }
  }

  return {
    id: n.id,
    type: n.type,
    label: n.label,
    description: n.description || '',
    inferred: !!n.inferred,
    ownedBy: n.ownedBy || null,
    synchronous: !!n.synchronous,
    provenance: n.provenance || null,
    storeKind: n.storeKind || null,
    fieldKind: n.fieldKind || null,
    host: n.host || null,
    engine: n.engine || null,
    fields,
    breadcrumb,
    contained,
    usedBy,
    storage,
    flows,
    related: rel ? { heading: rel.heading, nodes: rel.related.map((r) => ({ id: r.id, type: r.type, label: r.label })) } : null,
    usages: usages.map((u) => ({ flow: u.flow || null, explanation: u.explanation || '' })),
    anchors,
    comments: services.comments ? services.comments.get('node', n.id) : [],
  };
}

/**
 * Assemble a whole flow: metadata, its edges (as labeled verbs), hotspots, and its nodes grounded.
 * The first `maxGroundedNodes` nodes (in flow order) carry a full source excerpt; any beyond the cap
 * keep their anchor reference but drop the code, and `groundingNote` is set so the renderer can say
 * so once. The cap only bites when source is on (includeSource:true) — includeSource:false already
 * strips every excerpt, so its all-or-nothing semantics are untouched.
 */
export function buildFlowContext(services: ServiceBundle, flowId: string, { includeSource = true, maxGroundedNodes = DEFAULT_MAX_GROUNDED_NODES }: { includeSource?: boolean; maxGroundedNodes?: number } = {}): FlowContext | null {
  const { model, indexes } = services;
  const f = model.flows.find((x) => x.id === flowId);
  if (!f) return null;
  const nodeById = indexes.nodeById;
  // Resolve to real node ids first so the cap counts by position over the nodes that will render.
  const ids = [...flowNodeIds(f)].filter((id) => nodeById.has(id));
  const nodes = ids
    .map((id, i) => buildNodeContext(services, id, { includeSource: includeSource && i < maxGroundedNodes }))
    .filter((x): x is NodeContext => Boolean(x));
  const anchorOnly = includeSource ? Math.max(0, ids.length - maxGroundedNodes) : 0;
  const groundingNote = anchorOnly > 0
    ? `… ${anchorOnly} more node${anchorOnly === 1 ? '' : 's'} grounded by anchor only; call get_node for their source.`
    : null;
  const edges: FlowEdgeView[] = (f.edges || []).map((e) => ({
    from: e.from, to: e.to, verb: e.verb,
    fromLabel: (nodeById.get(e.from) || {} as Node).label || e.from,
    toLabel: (nodeById.get(e.to) || {} as Node).label || e.to,
  }));
  const hotspots: FlowHotspotView[] = (f.hotspots || []).map((h) => indexes.hotspotById.get(h)).filter((h): h is NonNullable<typeof h> => Boolean(h))
    .map((h) => ({ id: h.id, label: h.label, description: h.description || '' }));
  return {
    id: f.id, name: f.name, status: f.status || 'live', kind: f.kind || null,
    summary: f.summary || '', trigger: f.trigger || '', supersededBy: f.supersededBy || null,
    edges, hotspots, nodes,
    mermaid: flowMermaid(services, f),   // a colored flowchart so the model "sees" the graph
    comments: services.comments ? services.comments.get('flow', f.id) : [],
    groundingNote,
  };
}

// A Mermaid flowchart of a flow's graph, colored by the event-storming palette. This is how the
// model sees the graph structurally (exact labels, no OCR) when a flow is added to context.
export function flowMermaid(services: ServiceBundle, f: Flow): string {
  const nodeById = services.indexes.nodeById;
  const sane = (id: string) => 'n_' + String(id).replace(/[^a-zA-Z0-9]/g, '_');
  const esc = (s: string | undefined) => String(s || '').replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
  const present = new Set<string>();
  const lines = ['```mermaid', 'flowchart LR'];
  for (const id of flowNodeIds(f)) {
    const n = nodeById.get(id);
    if (!n) continue;
    present.add(n.type);
    lines.push(`  ${sane(id)}["${esc(n.label)}"]:::${n.type}`);
  }
  for (const e of (f.edges || [])) {
    if (!nodeById.get(e.from) || !nodeById.get(e.to)) continue;
    lines.push(`  ${sane(e.from)} -->|${esc(e.verb)}| ${sane(e.to)}`);
  }
  for (const t of present) {
    const p = PALETTE[t];
    if (p) lines.push(`  classDef ${t} fill:${p.fill},stroke:${p.edge},color:${p.text};`);
  }
  lines.push('```');
  return lines.join('\n');
}

/** Assemble a hotspot: label, the open question, and its evidence anchors grounded in source. */
export function buildHotspotContext(services: ServiceBundle, hotspotId: string, { includeSource = true }: { includeSource?: boolean } = {}): HotspotContext | null {
  const h = services.indexes.hotspotById.get(hotspotId);
  if (!h) return null;
  const anchors: AnchorView[] = ((h.tactical && h.tactical.anchors) || []).map((a) => {
    const entry: AnchorView = { path: a.path, line: a.line || null, symbol: a.symbol || null, note: a.note || null, flow: null };
    if (includeSource) entry.source = services.readSource(services.repoRoot, a.path, a.line);
    return entry;
  });
  return {
    id: h.id, label: h.label, description: h.description || '', explanation: (h.tactical && h.tactical.explanation) || '', anchors,
    comments: services.comments ? services.comments.get('hotspot', h.id) : [],
  };
}
