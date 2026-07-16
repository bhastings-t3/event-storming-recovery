/**
 * Merge per-flow trace JSONs into one canonical model, with validation.
 *
 * Extracted from tools/merge-flows.js as a reusable library so both the CLI
 * (tools/merge-flows.js) and the `es-view` server's on-the-fly `--traces`
 * resolution share exactly one implementation. The functions here never read
 * argv, write files, or call process.exit; they take data in and return a
 * result object. Side effects belong to the callers.
 */
import fs from 'node:fs';
import path from 'node:path';

export const NODE_TYPES = new Set(['actor', 'command', 'aggregate', 'event', 'policy', 'readModel', 'externalSystem', 'invariant']);
export const EDGE_VERBS = new Set(['issues', 'handled by', 'emits', 'triggers', 'updates', 'read by', 'reads', 'raises', 'enforces', 'calls', 'returns']);
const ANCHOR_REQUIRED = new Set(['command', 'aggregate', 'event', 'policy', 'readModel', 'invariant']);

/**
 * Merge already-parsed trace documents into a canonical model.
 *
 * @param {Array<{ doc: object, name: string }>} sources - parsed trace docs with their source file names
 * @returns {{ model: object, errors: string[], warnings: string[] }}
 */
export function mergeTraceDocs(sources) {
  const errors = [];
  const warnings = [];
  const nodes = new Map();     // id -> merged node
  const flows = new Map();     // id -> flow
  const hotspots = new Map();  // id -> hotspot

  for (const { doc, name } of sources) {
    const flowIds = (doc.flows || []).map(f => f.id).join(',') || name.replace(/\.json$/, '');

    for (const n of doc.nodes || []) {
      if (!n.id || !n.type || !n.label) { errors.push(`${name}: node missing id/type/label: ${JSON.stringify(n).slice(0, 80)}`); continue; }
      if (!NODE_TYPES.has(n.type)) errors.push(`${name}: node ${n.id} has unknown type '${n.type}'`);
      if (ANCHOR_REQUIRED.has(n.type) && !(n.tactical && Array.isArray(n.tactical.anchors) && n.tactical.anchors.length))
        warnings.push(`${name}: ${n.type} node ${n.id} has no tactical.anchors`);

      if (!nodes.has(n.id)) {
        const merged = { ...n };
        merged.usages = [];
        if (n.tactical) merged.usages.push({ flow: flowIds, explanation: n.tactical.explanation || '', anchors: n.tactical.anchors || [] });
        nodes.set(n.id, merged);
      } else {
        const m = nodes.get(n.id);
        if (m.type !== n.type) errors.push(`node ${n.id}: type conflict '${m.type}' vs '${n.type}' (${name})`);
        if ((n.description || '').length > (m.description || '').length) m.description = n.description;
        if (n.ownedBy && !m.ownedBy) m.ownedBy = n.ownedBy;
        if (n.synchronous !== undefined && m.synchronous === undefined) m.synchronous = n.synchronous;
        if (n.inferred === false) m.inferred = false; // explicit code naming wins
        if (n.tactical) {
          m.usages.push({ flow: flowIds, explanation: n.tactical.explanation || '', anchors: n.tactical.anchors || [] });
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
  }

  // Cross-reference validation
  for (const [fid, f] of flows) {
    if (!f.name) errors.push(`flow ${fid}: missing name`);
    if (!f.kind) warnings.push(`flow ${fid}: missing kind`);
    if (!f.status) { warnings.push(`flow ${fid}: missing status (assuming live)`); f.status = 'live'; }
    for (const s of f.steps || []) if (!nodes.has(s)) errors.push(`flow ${fid}: step '${s}' not in nodes`);
    for (const e of f.edges || []) {
      if (!nodes.has(e.from)) errors.push(`flow ${fid}: edge.from '${e.from}' not in nodes`);
      if (!nodes.has(e.to)) errors.push(`flow ${fid}: edge.to '${e.to}' not in nodes`);
      if (!EDGE_VERBS.has(e.verb)) warnings.push(`flow ${fid}: nonstandard edge verb '${e.verb}'`);
    }
    for (const h of f.hotspots || []) if (!hotspots.has(h)) errors.push(`flow ${fid}: hotspot '${h}' not defined`);
    if (f.supersededBy && !flows.has(f.supersededBy)) warnings.push(`flow ${fid}: supersededBy '${f.supersededBy}' not (yet) a known flow`);
  }

  // Aggregates never issue commands
  for (const [, f] of flows) {
    for (const e of f.edges || []) {
      const from = nodes.get(e.from);
      if (from && from.type === 'aggregate' && e.verb === 'issues') errors.push(`flow ${f.id}: aggregate ${e.from} issues a command - forbidden`);
    }
  }

  // Orphan check: nodes referenced by no flow
  const referenced = new Set();
  for (const [, f] of flows) {
    (f.steps || []).forEach(s => referenced.add(s));
    (f.edges || []).forEach(e => { referenced.add(e.from); referenced.add(e.to); });
  }
  for (const id of nodes.keys()) if (!referenced.has(id)) warnings.push(`node ${id} is referenced by no flow`);

  // Derived meta: shared-concept glossary + dead-flow index (regenerable, not hand-authored).
  const appearIn = new Map();
  for (const [, f] of flows) {
    const ids = new Set([...(f.steps || []), ...(f.edges || []).flatMap(e => [e.from, e.to])]);
    for (const id of ids) { if (!appearIn.has(id)) appearIn.set(id, []); appearIn.get(id).push(f.id); }
  }
  const glossary = [...appearIn.entries()]
    .filter(([, fl]) => fl.length > 1)
    .map(([id, fl]) => { const n = nodes.get(id); return n ? { id, type: n.type, label: n.label, description: n.description, flowCount: fl.length, flows: fl } : null; })
    .filter(Boolean)
    .sort((a, b) => b.flowCount - a.flowCount);
  const deadFlows = [...flows.values()].filter(f => f.status && f.status !== 'live').map(f => ({ id: f.id, status: f.status, supersededBy: f.supersededBy || null, name: f.name }));
  const typeCounts = {};
  for (const n of nodes.values()) typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;

  const model = {
    version: 1,
    meta: {
      generatedFrom: sources.map(s => s.name),
      counts: { flows: flows.size, nodes: nodes.size, hotspots: hotspots.size, byType: typeCounts },
      deadFlows,
      sharedGlossary: glossary,
    },
    nodes: [...nodes.values()].map(n => { const { _src, ...rest } = n; return rest; }),
    flows: [...flows.values()].map(f => { const { _sourceFile, ...rest } = f; return rest; }),
    hotspots: [...hotspots.values()],
  };

  return { model, errors, warnings };
}

/**
 * Read every *.json in a directory and merge them.
 *
 * @param {string} tracesDir
 * @returns {{ model: object, errors: string[], warnings: string[], files: string[] }}
 */
export function mergeTracesDir(tracesDir) {
  const files = fs.readdirSync(tracesDir).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) return { model: null, errors: ['no trace files found'], warnings: [], files: [] };

  const sources = [];
  const parseErrors = [];
  for (const file of files) {
    try {
      sources.push({ doc: JSON.parse(fs.readFileSync(path.join(tracesDir, file), 'utf8')), name: file });
    } catch (e) {
      parseErrors.push(`${file}: unparseable JSON: ${e.message}`);
    }
  }
  const result = mergeTraceDocs(sources);
  result.errors = [...parseErrors, ...result.errors];
  result.files = files;
  return result;
}
