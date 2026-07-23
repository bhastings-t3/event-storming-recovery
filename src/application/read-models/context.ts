// Assemble the grounded context for a node/flow/hotspot: what it is, the invariants it enforces (or
// is enforced by), the flows it lives in, the recovered data model, and the REAL source behind each
// anchor. This is the payload the SPA shows inline and the MCP tools hand to Claude so a refactor
// request is anchored to actual files, not just a label. Ported from src/server/context.mjs; the
// rendered Markdown is byte-identical (MCP + copy-for-claude output).
import {
  nodeFlows, enforcesRelation, nodeUsages, flowNodeIds,
  isDataNode, parentChain, datastoreConsumers, fieldConsumers, nodeStorageLinks, dataModelTree, isRecordSet,
} from './indexes.js';
import { PALETTE } from '../../domain/model/palette.js';
import type { Flow, Node } from '../../domain/model/types.js';
import type { SourceView } from '../../domain/source/source-window.js';
import type { Comment } from '../../domain/comment-store/comment-store.js';
import type { ServiceBundle } from '../services.js';

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
}

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

/** Render human comments as a markdown block (shared by node/flow/hotspot renderers). */
function renderComments(comments: Comment[] | null | undefined): string {
  if (!comments || !comments.length) return '';
  const lines = ['\n**Comments (human notes):**'];
  for (const c of comments) lines.push(`- ${c.text}${c.at ? `  _(${String(c.at).slice(0, 10)})_` : ''}`);
  return lines.join('\n');
}

/** Render one node context as readable markdown (for MCP text results and clipboard export). */
export function renderNodeContextMarkdown(ctx: NodeContext | null): string {
  if (!ctx) return '';
  const out: string[] = [];
  out.push(`## ${ctx.label}  _(${ctx.type})_`);
  if (ctx.description) out.push(ctx.description);
  const tags: string[] = [];
  if (ctx.inferred) tags.push('inferred from code');
  if (ctx.ownedBy) tags.push('state owned by ' + ctx.ownedBy);
  if (ctx.synchronous) tags.push('synchronous inline reaction');
  if (ctx.storeKind) tags.push(ctx.storeKind);
  if (ctx.fieldKind) tags.push(ctx.fieldKind);
  if (ctx.engine) tags.push(ctx.engine);
  for (const pv of (ctx.provenance || [])) tags.push(pv);
  if (tags.length) out.push(`_${tags.join(' · ')}_`);

  if (ctx.breadcrumb && ctx.breadcrumb.length > 1) {
    out.push(`\n**Location:** ${ctx.breadcrumb.map((c) => c.label).join(' ▸ ')}`);
  }

  if (ctx.fields && ctx.fields.length) {
    out.push(`\n**${ctx.type === 'readModel' ? 'Data returned' : ctx.type === 'aggregate' ? 'State & fields' : 'Fields'}:**`);
    for (const fld of ctx.fields) {
      const meta = [fld.dataType, fld.confidence && (fld.confidence + ' confidence'), fld.conceptual && 'conceptual'].filter(Boolean).join(', ');
      out.push(`- **${fld.name}**${meta ? ` _(${meta})_` : ''}${fld.derivation ? ' — ' + fld.derivation : ''}`);
      for (const s of fld.sources) out.push(`    - ${s.role || 'from'} \`${s.label || s.ref}\`${s.transform ? ' (' + s.transform + ')' : ''}${s.note ? ' — ' + s.note : ''}`);
      if (!fld.sources.length) out.push('    - _computed / no direct source_');
    }
  }

  if (ctx.contained && ctx.contained.length) {
    out.push(`\n**Fields (${ctx.contained.length}):** ` + ctx.contained.map((c) => `\`${c.label}\`${c.dataType ? ' ' + c.dataType : ''}`).join(', '));
  }
  if (ctx.usedBy && ctx.usedBy.length) {
    out.push(`\n**Used by:**`);
    for (const u of ctx.usedBy) out.push(`- ${u.label} _(${u.type})_ — ${u.verb}`);
  }
  if (ctx.storage && ctx.storage.length) {
    out.push(`\n**Storage:** ` + ctx.storage.map((s) => `${s.label} (${s.verb})`).join(', '));
  }

  if (ctx.related && ctx.related.nodes.length) {
    out.push(`\n**${ctx.related.heading}:**`);
    for (const r of ctx.related.nodes) out.push(`- ${r.label} _(${r.type})_`);
  }

  if (ctx.flows.length) {
    out.push(`\n**Appears in ${ctx.flows.length} flow${ctx.flows.length > 1 ? 's' : ''}:** ` +
      ctx.flows.map((f) => f.name + (f.status !== 'live' ? ` [${f.status}]` : '')).join(', '));
  }

  if (ctx.anchors.length) {
    out.push(`\n**Source anchors:**`);
    for (const a of ctx.anchors) {
      const loc = a.path + (a.line ? ':' + a.line : '') + (a.symbol ? ` (${a.symbol})` : '');
      out.push(`\n\`${loc}\`${a.note ? ' — ' + a.note : ''}`);
      if (a.source && a.source.exists) {
        out.push('```\n' + a.source.code + '\n```');
      }
    }
  }
  const cm = renderComments(ctx.comments);
  if (cm) out.push(cm);
  return out.join('\n');
}

/** Render a single bundle item (node / flow / hotspot) as markdown. */
export function renderItemMarkdown(services: ServiceBundle, { type, id }: { type: string; id: string }): string {
  if (type === 'flow') { const fc = buildFlowContext(services, id); return fc ? renderFlowMarkdown(fc) : ''; }
  if (type === 'hotspot') { const hc = buildHotspotContext(services, id); return hc ? renderHotspotMarkdown(hc) : ''; }
  const nc = buildNodeContext(services, id); return nc ? renderNodeContextMarkdown(nc) : '';
}

/** Render a whole bundle (typed items) as one markdown document. */
export function renderBundleMarkdown(services: ServiceBundle, items: { type: string; id: string }[] | null | undefined): string {
  if (!items || !items.length) return '_No items in the context bundle yet._';
  return items.map((it) => renderItemMarkdown(services, it)).filter(Boolean).join('\n\n---\n\n');
}

/** Assemble a whole flow: metadata, its edges (as labeled verbs), hotspots, and every node grounded. */
export function buildFlowContext(services: ServiceBundle, flowId: string, { includeSource = true }: { includeSource?: boolean } = {}): FlowContext | null {
  const { model, indexes } = services;
  const f = model.flows.find((x) => x.id === flowId);
  if (!f) return null;
  const nodeById = indexes.nodeById;
  const nodes = [...flowNodeIds(f)].map((id) => buildNodeContext(services, id, { includeSource })).filter((x): x is NodeContext => Boolean(x));
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

export function renderHotspotMarkdown(hc: HotspotContext | null): string {
  if (!hc) return '';
  const out = [`## Hotspot: ${hc.label}`];
  if (hc.description) out.push(hc.description);
  if (hc.explanation) out.push(`\n**Evidence:** ${hc.explanation}`);
  for (const a of hc.anchors) {
    const loc = a.path + (a.line ? ':' + a.line : '') + (a.symbol ? ` (${a.symbol})` : '');
    out.push(`\n\`${loc}\`${a.note ? ' — ' + a.note : ''}`);
    if (a.source && a.source.exists) out.push('```\n' + a.source.code + '\n```');
  }
  const cm = renderComments(hc.comments);
  if (cm) out.push(cm);
  return out.join('\n');
}

/** Render the recovered data model as markdown: the datastore containment tree (whatever kind of
 * storage it is) with the behavioral nodes that touch each record set. The storage the code uses. */
export function renderDataModelMarkdown(services: ServiceBundle): string {
  const { model, indexes } = services;
  const nodeById = indexes.nodeById;
  const { roots } = dataModelTree(model, nodeById);
  const dataCount = model.nodes.filter((n) => n.type === 'datastore' || n.type === 'field').length;
  if (!dataCount) return '_No data model recovered yet. Run the data-mapping phase to populate data stores and field lineage._';
  const out = ['# Data model', ''];
  const kindOf = (n: Node) => n.storeKind || 'store';
  const walk = (t: import('./indexes.js').DataTree, depth: number) => {
    const { node: ds, stores, fields } = t;
    const pad = '  '.repeat(depth);
    const header = depth === 0 ? `## ${ds.label}` : `${pad}- **${ds.label}**`;
    out.push(`${header} _(${kindOf(ds)})_${ds.host ? ` — \`${ds.host}\`` : ''}`);
    if (fields.length) out.push(`${pad}  - fields: ${fields.map((c) => `\`${c.label}\`${c.dataType ? ' ' + c.dataType : ''}`).join(', ')}`);
    if (isRecordSet(model, nodeById, ds)) {
      for (const c of datastoreConsumers(model, nodeById, ds.id)) out.push(`${pad}  - ${c.node.label} _(${c.node.type})_ — ${c.verb}`);
    }
    for (const s of stores) walk(s, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return out.join('\n');
}

/** Render a flow context as readable markdown for an MCP tool result. */
export function renderFlowMarkdown(fc: FlowContext | null): string {
  if (!fc) return '';
  const out: string[] = [];
  out.push(`# Flow: ${fc.name}${fc.status !== 'live' ? ` [${fc.status}${fc.supersededBy ? ' → ' + fc.supersededBy : ''}]` : ''}`);
  if (fc.summary) out.push(fc.summary);
  if (fc.trigger) out.push(`**Trigger:** ${fc.trigger}`);
  const fcc = renderComments(fc.comments);
  if (fcc) out.push(fcc);
  if (fc.edges.length) {
    out.push('\n**Flow:**');
    for (const e of fc.edges) out.push(`- ${e.fromLabel} —${e.verb}→ ${e.toLabel}`);
  }
  if (fc.hotspots.length) {
    out.push('\n**Hotspots (open questions):**');
    for (const h of fc.hotspots) out.push(`- **${h.label}** — ${h.description}`);
  }
  if (fc.mermaid) out.push('\n**Graph (Mermaid):**\n' + fc.mermaid);
  out.push('\n---\n\n' + fc.nodes.map(renderNodeContextMarkdown).join('\n\n'));
  return out.join('\n');
}
