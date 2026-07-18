// Assemble the grounded context for a node: what it is, the invariants it enforces (or is
// enforced by), the flows it lives in, and the REAL source behind each anchor. This is the
// payload the SPA shows inline and the MCP tools hand to Claude so a refactor request is
// anchored to actual files, not just a label.
import {
  nodeFlows, enforcesRelation, nodeUsages, flowNodeIds,
  isDataNode, parentChain, datastoreConsumers, fieldConsumers, nodeStorageLinks, dataModelTree, isRecordSet,
} from '../lib/selectors.mjs';
import { PALETTE } from '../lib/palette.mjs';
import { readSource } from './source.mjs';

/**
 * @param {{ model, indexes, repoRoot }} services
 * @param {string} nodeId
 * @param {{ includeSource?: boolean }} [opts]
 * @returns {object|null}
 */
export function buildNodeContext(services, nodeId, { includeSource = true } = {}) {
  const { model, indexes, repoRoot } = services;
  const n = indexes.nodeById.get(nodeId);
  if (!n) return null;

  const nodeById = indexes.nodeById;
  const flows = nodeFlows(model, nodeId).map((f) => ({ id: f.id, name: f.name, status: f.status || 'live', kind: f.kind || null }));
  const rel = enforcesRelation(model, nodeById, n);
  const usages = nodeUsages(n);
  const dataNode = isDataNode(n);

  // Conceptual fields (read models / aggregates): each a prose derivation over 0..N storage sources.
  const fields = (n.fields || []).map((fld) => ({
    name: fld.name,
    dataType: fld.dataType || null,
    conceptual: !!fld.conceptual,
    confidence: fld.confidence || null,
    derivation: fld.derivation || '',
    sources: (fld.sources || []).map((s) => {
      const col = /^(ds|fld)-/.test(s.ref || '') ? nodeById.get(s.ref) : null;
      return { ref: s.ref || null, label: col ? col.label : (s.ref || null), role: s.role || null, transform: s.transform || null, note: s.note || null };
    }),
  }));

  // Physical-storage grounding: containment breadcrumb, contained fields, and what depends on it.
  const breadcrumb = dataNode ? parentChain(nodeById, n).map((c) => ({ id: c.id, type: c.type, label: c.label, storeKind: c.storeKind || c.fieldKind || null })) : null;
  const contained = n.type === 'datastore'
    ? model.nodes.filter((x) => x.type === 'field' && x.parent === n.id).map((c) => ({ id: c.id, label: c.label, dataType: c.dataType || null, fieldKind: c.fieldKind || null }))
    : null;
  const usedBy = n.type === 'datastore'
    ? datastoreConsumers(model, nodeById, n.id).map((c) => ({ id: c.node.id, label: c.node.label, type: c.node.type, verb: c.verb }))
    : n.type === 'field'
      ? fieldConsumers(model, n.id).map((c) => ({ id: c.node.id, label: c.node.label, type: c.node.type, verb: 'field ' + c.field.name }))
      : null;
  const storage = !dataNode ? nodeStorageLinks(model, nodeById, n.id).map((s) => ({ id: s.node.id, label: s.node.label, verb: s.verb })) : null;

  const anchors = [];
  for (const u of usages) {
    for (const a of (u.anchors || [])) {
      const entry = { path: a.path, line: a.line || null, symbol: a.symbol || null, note: a.note || null, flow: u.flow || null };
      if (includeSource) entry.source = readSource(repoRoot, a.path, a.line);
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
  };
}

/** Render one node context as readable markdown (for MCP text results and clipboard export). */
export function renderNodeContextMarkdown(ctx) {
  if (!ctx) return '';
  const out = [];
  out.push(`## ${ctx.label}  _(${ctx.type})_`);
  if (ctx.description) out.push(ctx.description);
  const tags = [];
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
  return out.join('\n');
}

/** Render a single bundle item (node / flow / hotspot) as markdown. */
export function renderItemMarkdown(services, { type, id }) {
  if (type === 'flow') { const fc = buildFlowContext(services, id); return fc ? renderFlowMarkdown(fc) : ''; }
  if (type === 'hotspot') { const hc = buildHotspotContext(services, id); return hc ? renderHotspotMarkdown(hc) : ''; }
  const nc = buildNodeContext(services, id); return nc ? renderNodeContextMarkdown(nc) : '';
}

/** Render a whole bundle (typed items) as one markdown document. */
export function renderBundleMarkdown(services, items) {
  if (!items || !items.length) return '_No items in the context bundle yet._';
  return items.map((it) => renderItemMarkdown(services, it)).filter(Boolean).join('\n\n---\n\n');
}

/** Assemble a whole flow: metadata, its edges (as labeled verbs), hotspots, and every node grounded. */
export function buildFlowContext(services, flowId, { includeSource = true } = {}) {
  const { model, indexes } = services;
  const f = model.flows.find((x) => x.id === flowId);
  if (!f) return null;
  const nodeById = indexes.nodeById;
  const nodes = [...flowNodeIds(f)].map((id) => buildNodeContext(services, id, { includeSource })).filter(Boolean);
  const edges = (f.edges || []).map((e) => ({
    from: e.from, to: e.to, verb: e.verb,
    fromLabel: (nodeById.get(e.from) || {}).label || e.from,
    toLabel: (nodeById.get(e.to) || {}).label || e.to,
  }));
  const hotspots = (f.hotspots || []).map((h) => indexes.hotspotById.get(h)).filter(Boolean)
    .map((h) => ({ id: h.id, label: h.label, description: h.description || '' }));
  return {
    id: f.id, name: f.name, status: f.status || 'live', kind: f.kind || null,
    summary: f.summary || '', trigger: f.trigger || '', supersededBy: f.supersededBy || null,
    edges, hotspots, nodes,
    mermaid: flowMermaid(services, f),   // a colored flowchart so the model "sees" the graph
  };
}

// A Mermaid flowchart of a flow's graph, colored by the event-storming palette. This is how the
// model sees the graph structurally (exact labels, no OCR) when a flow is added to context.
export function flowMermaid(services, f) {
  const nodeById = services.indexes.nodeById;
  const sane = (id) => 'n_' + String(id).replace(/[^a-zA-Z0-9]/g, '_');
  const esc = (s) => String(s || '').replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
  const present = new Set();
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
export function buildHotspotContext(services, hotspotId, { includeSource = true } = {}) {
  const h = services.indexes.hotspotById.get(hotspotId);
  if (!h) return null;
  const anchors = ((h.tactical && h.tactical.anchors) || []).map((a) => {
    const entry = { path: a.path, line: a.line || null, symbol: a.symbol || null, note: a.note || null };
    if (includeSource) entry.source = readSource(services.repoRoot, a.path, a.line);
    return entry;
  });
  return { id: h.id, label: h.label, description: h.description || '', explanation: (h.tactical && h.tactical.explanation) || '', anchors };
}

export function renderHotspotMarkdown(hc) {
  if (!hc) return '';
  const out = [`## Hotspot: ${hc.label}`];
  if (hc.description) out.push(hc.description);
  if (hc.explanation) out.push(`\n**Evidence:** ${hc.explanation}`);
  for (const a of hc.anchors) {
    const loc = a.path + (a.line ? ':' + a.line : '') + (a.symbol ? ` (${a.symbol})` : '');
    out.push(`\n\`${loc}\`${a.note ? ' — ' + a.note : ''}`);
    if (a.source && a.source.exists) out.push('```\n' + a.source.code + '\n```');
  }
  return out.join('\n');
}

/** Render the recovered data model as markdown: the datastore containment tree (whatever kind of
 * storage it is) with the behavioral nodes that touch each record set. The storage the code uses. */
export function renderDataModelMarkdown(services) {
  const { model, indexes } = services;
  const nodeById = indexes.nodeById;
  const { roots } = dataModelTree(model, nodeById);
  const dataCount = model.nodes.filter((n) => n.type === 'datastore' || n.type === 'field').length;
  if (!dataCount) return '_No data model recovered yet. Run the data-mapping phase to populate data stores and field lineage._';
  const out = ['# Data model', ''];
  const kindOf = (n) => n.storeKind || 'store';
  const walk = (t, depth) => {
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
export function renderFlowMarkdown(fc) {
  if (!fc) return '';
  const out = [];
  out.push(`# Flow: ${fc.name}${fc.status !== 'live' ? ` [${fc.status}${fc.supersededBy ? ' → ' + fc.supersededBy : ''}]` : ''}`);
  if (fc.summary) out.push(fc.summary);
  if (fc.trigger) out.push(`**Trigger:** ${fc.trigger}`);
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
