/**
 * Merge per-flow trace JSONs into one canonical model, with validation. PURE: no node:fs, no argv,
 * no process.exit — data in, result out. The fs-reading counterpart (mergeTracesDir) lives in the
 * fs model-repository adapter. Extracted from the pre-refactor src/lib/merge.mjs; the merged output
 * shape and the validate() error/warning STRINGS are byte-identical (tests assert them).
 */
import type { Model, Node, Flow, Hotspot, Term, TraceSource, GlossaryEntry, DeadFlow } from './types.js';
import { NODE_TYPES, ANCHOR_REQUIRED, crossValidate } from './invariants.js';

export { NODE_TYPES, EDGE_VERBS } from './invariants.js';

export interface MergeResult {
  model: Model;
  errors: string[];
  warnings: string[];
}

/**
 * Merge already-parsed trace documents into a canonical model.
 */
export function mergeTraceDocs(sources: TraceSource[]): MergeResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodes = new Map<string, Node>();     // id -> merged node
  const flows = new Map<string, Flow>();     // id -> flow
  const hotspots = new Map<string, Hotspot>();  // id -> hotspot
  const terms = new Map<string, Term>();     // id -> ubiquitous-language term (authored by the glossary-mining phase)

  for (const { doc, name } of sources) {
    const flowIds = (doc.flows || []).map((f) => f.id).join(',') || name.replace(/\.json$/, '');

    for (const n of doc.nodes || []) {
      if (!n.id || !n.type || !n.label) { errors.push(`${name}: node missing id/type/label: ${JSON.stringify(n).slice(0, 80)}`); continue; }
      if (!NODE_TYPES.has(n.type)) errors.push(`${name}: node ${n.id} has unknown type '${n.type}'`);
      if (ANCHOR_REQUIRED.has(n.type) && !(n.tactical && Array.isArray(n.tactical.anchors) && n.tactical.anchors.length))
        warnings.push(`${name}: ${n.type} node ${n.id} has no tactical.anchors`);

      if (!nodes.has(n.id)) {
        const merged: Node = { ...n };
        merged.usages = [];
        if (n.tactical) merged.usages.push({ flow: flowIds, explanation: n.tactical.explanation || '', anchors: n.tactical.anchors || [] });
        nodes.set(n.id, merged);
      } else {
        const m = nodes.get(n.id)!;
        if (m.type !== n.type) errors.push(`node ${n.id}: type conflict '${m.type}' vs '${n.type}' (${name})`);
        if ((n.description || '').length > (m.description || '').length) m.description = n.description;
        if (n.ownedBy && !m.ownedBy) m.ownedBy = n.ownedBy;
        if (n.synchronous !== undefined && m.synchronous === undefined) m.synchronous = n.synchronous;
        if (n.inferred === false) m.inferred = false; // explicit code naming wins
        // Data-model enrichment often arrives in a LATER trace file (the data-mapping phase) than
        // the one that first defined the node. Carry fields + physical attributes across, unioning
        // fields by name so the data pass can annotate an aggregate/read model the trace pass made.
        if (Array.isArray(n.fields) && n.fields.length) {
          const byName = new Map((m.fields || []).map((f) => [f.name, f]));
          for (const f of n.fields) byName.set(f.name, f); // the data pass is authority on a field
          m.fields = [...byName.values()];
        }
        for (const k of ['parent', 'storeKind', 'fieldKind', 'dataType', 'host', 'engine']) {
          if (n[k] !== undefined && m[k] === undefined) m[k] = n[k];
        }
        if (n.nullable !== undefined && m.nullable === undefined) m.nullable = n.nullable;
        if (Array.isArray(n.provenance) && n.provenance.length) m.provenance = [...new Set([...(m.provenance || []), ...n.provenance])];
        if (n.tactical) {
          m.usages!.push({ flow: flowIds, explanation: n.tactical.explanation || '', anchors: n.tactical.anchors || [] });
          // keep the richest explanation as the primary tactical block
          if (!m.tactical || (n.tactical.explanation || '').length > ((m.tactical && m.tactical.explanation) || '').length) m.tactical = n.tactical;
        }
      }
    }

    for (const f of doc.flows || []) {
      if (flows.has(f.id)) { errors.push(`duplicate flow id ${f.id} (${name})`); continue; }
      flows.set(f.id, f);
    }

    for (const h of doc.hotspots || []) {
      if (hotspots.has(h.id)) { warnings.push(`duplicate hotspot id ${h.id} (${name}) - keeping first`); continue; }
      hotspots.set(h.id, h);
    }

    for (const t of doc.terms || []) {
      if (!t.id || !t.term) { errors.push(`${name}: term missing id/term: ${JSON.stringify(t).slice(0, 80)}`); continue; }
      if (terms.has(t.id)) { warnings.push(`duplicate term id ${t.id} (${name}) - keeping first`); continue; }
      terms.set(t.id, t);
    }
  }

  // Data-model integrity, cross-reference validation, the es-grammar rule, term validation, and the
  // orphan warning — in the exact pre-refactor order.
  crossValidate(nodes, flows, hotspots, terms, errors, warnings);

  // Derived meta: shared-concept glossary + dead-flow index (regenerable, not hand-authored).
  const appearIn = new Map<string, string[]>();
  for (const [, f] of flows) {
    const ids = new Set([...(f.steps || []), ...(f.edges || []).flatMap((e) => [e.from, e.to])]);
    for (const id of ids) { if (!appearIn.has(id)) appearIn.set(id, []); appearIn.get(id)!.push(f.id); }
  }
  const glossary = [...appearIn.entries()]
    .filter(([, fl]) => fl.length > 1)
    .map(([id, fl]): GlossaryEntry | null => { const n = nodes.get(id); return n ? { id, type: n.type, label: n.label, description: n.description, flowCount: fl.length, flows: fl } : null; })
    .filter((x): x is GlossaryEntry => Boolean(x))
    .sort((a, b) => b.flowCount - a.flowCount);
  const deadFlows: DeadFlow[] = [...flows.values()].filter((f) => f.status && f.status !== 'live').map((f) => ({ id: f.id, status: f.status, supersededBy: f.supersededBy || null, name: f.name }));
  const typeCounts: Record<string, number> = {};
  for (const n of nodes.values()) typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
  const termList = [...terms.values()].sort((a, b) => String(a.term).localeCompare(String(b.term), undefined, { sensitivity: 'base' }));
  const unresolvedTerms = termList.filter((t) => (t.status || 'resolved') !== 'resolved').length;

  const model: Model = {
    version: 1,
    meta: {
      generatedFrom: sources.map((s) => s.name),
      counts: { flows: flows.size, nodes: nodes.size, hotspots: hotspots.size, terms: termList.length, unresolvedTerms, byType: typeCounts },
      deadFlows,
      sharedGlossary: glossary,
    },
    nodes: [...nodes.values()].map((n) => { const { _src, ...rest } = n; return rest as Node; }),
    flows: [...flows.values()].map((f) => { const { _sourceFile, ...rest } = f; return rest as Flow; }),
    hotspots: [...hotspots.values()],
    terms: termList,
  };

  return { model, errors, warnings };
}
