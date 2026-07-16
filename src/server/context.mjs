// Assemble the grounded context for a node: what it is, the invariants it enforces (or is
// enforced by), the flows it lives in, and the REAL source behind each anchor. This is the
// payload the SPA shows inline and the MCP tools hand to Claude so a refactor request is
// anchored to actual files, not just a label.
import { nodeFlows, enforcesRelation, nodeUsages, flowNodeIds } from '../lib/selectors.mjs';
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

  const flows = nodeFlows(model, nodeId).map((f) => ({ id: f.id, name: f.name, status: f.status || 'live', kind: f.kind || null }));
  const rel = enforcesRelation(model, indexes.nodeById, n);
  const usages = nodeUsages(n);

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
    flows,
    related: rel ? { heading: rel.heading, nodes: rel.related.map((r) => ({ id: r.id, type: r.type, label: r.label })) } : null,
    usages: usages.map((u) => ({ flow: u.flow || null, explanation: u.explanation || '' })),
    anchors,
  };
}

/** Build contexts for a set of node ids (the curated bundle), skipping unknown ids. */
export function buildBundleContext(services, nodeIds, opts) {
  return nodeIds.map((id) => buildNodeContext(services, id, opts)).filter(Boolean);
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
  if (tags.length) out.push(`_${tags.join(' · ')}_`);

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

/** Render a whole bundle as one markdown document. */
export function renderBundleMarkdown(contexts) {
  if (!contexts.length) return '_No nodes in the context bundle yet._';
  return contexts.map(renderNodeContextMarkdown).join('\n\n---\n\n');
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
  };
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
  out.push('\n---\n\n' + fc.nodes.map(renderNodeContextMarkdown).join('\n\n'));
  return out.join('\n');
}
