// renderDot: build flows.dot — a Graphviz digraph, one cluster per flow, event-storming colors.
// Pure string builder (no fs, no timestamps/random). Extracted verbatim from generate-views.ts
// (issue #21, Target 2 / slice 21-C2) with byte-identical output.
import { PALETTE } from '../../../domain/model/palette.js';
import type { Model } from '../../../domain/model/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function renderDot(model: Model, repoRoot: string): string {
  const nodeById = new Map<string, any>(model.nodes.map((n) => [n.id, n]));
  const DATA_TYPES = new Set(['datastore', 'field']);
  const isDataId = (id: any) => { const n = nodeById.get(id); return n && DATA_TYPES.has(n.type); };
  const dotEsc = (s: any) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const anchorUrl = (a: any) => `vscode://file/${repoRoot}/${a.path}${a.line ? ':' + a.line : ''}`;
  const dot: string[] = [];
  dot.push('digraph event_storming {');
  dot.push('  bgcolor="#0a0a0d"; rankdir=LR; fontname="Segoe UI"; compound=true;');
  dot.push('  node [shape=box, style="filled,rounded", fontname="Segoe UI", fontsize=10, margin="0.15,0.08"];');
  dot.push('  edge [fontname="Segoe UI", fontsize=8, color="#8a8a94", fontcolor="#a1a1aa"];');
  for (const f of (model.flows as any[])) {
    const dead = f.status && f.status !== 'live';
    dot.push(`  subgraph "cluster_${f.id}" {`);
    dot.push(`    label="${dotEsc(f.name)}${dead ? '  [' + f.status.toUpperCase() + ']' : ''}"; fontsize=13; color="${dead ? '#3a3a44' : '#4a4a56'}"; style="rounded"; fontcolor="${dead ? '#71717a' : '#e4e4e7'}";`);
    const used = new Set<any>();
    (f.steps || []).forEach((s: any) => { if (!isDataId(s)) used.add(s); });
    (f.edges || []).forEach((e: any) => { if (isDataId(e.from) || isDataId(e.to)) return; used.add(e.from); used.add(e.to); });
    for (const id of used) {
      const n = nodeById.get(id); if (!n) continue;
      const p = PALETTE[n.type] || PALETTE.invariant;
      const firstAnchor = n.tactical && n.tactical.anchors && n.tactical.anchors[0];
      const url = firstAnchor ? `, URL="${anchorUrl(firstAnchor)}"` : '';
      const tip = dotEsc((n.description || '').slice(0, 300));
      const deadStyle = dead ? ',dashed' : '';
      dot.push(`    "${f.id}__${id}" [label="${dotEsc(n.label)}", fillcolor="${p.fill}", color="${p.edge}", fontcolor="${p.text}", style="filled,rounded${deadStyle}", tooltip="${tip}"${url}];`);
    }
    for (const e of f.edges || []) {
      if (!used.has(e.from) || !used.has(e.to)) continue;
      dot.push(`    "${f.id}__${e.from}" -> "${f.id}__${e.to}" [label="${dotEsc(e.verb)}"];`);
    }
    dot.push('  }');
  }
  dot.push('}');
  return dot.join('\n');
}
