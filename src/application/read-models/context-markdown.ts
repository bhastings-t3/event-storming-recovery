// Markdown presentation for the grounded context read-models. These render the structured
// projections built in context.ts (NodeContext / FlowContext / HotspotContext) into the Markdown
// that the MCP tools return and the SPA's copy-for-claude export produces. That Markdown is a
// byte-exact contract; this file only presents, it never builds. Dependency direction: markdown
// depends on the builders and their types, never the reverse.
import { buildNodeContext, buildFlowContext, buildHotspotContext } from './context.js';
import type { NodeContext, FlowContext, HotspotContext } from './context.js';
import { datastoreConsumers, dataModelTree, isRecordSet } from './indexes.js';
import type { Node } from '../../domain/model/types.js';
import type { Comment } from '../../domain/comment-store/comment-store.js';
import type { ServiceBundle } from '../services.js';

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
