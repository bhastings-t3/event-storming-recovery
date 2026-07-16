#!/usr/bin/env node
/**
 * Merge per-flow trace JSONs (scratchpad/traces/*.json) into one canonical flows.json.
 *
 * Shared nodes (same id across flows) are merged: the merged node keeps the first-seen
 * type/label, the longest description, and accumulates every source's tactical detail
 * as a per-flow "usages" entry so the explorer can show flow-specific context.
 *
 * Usage: node merge-flows.js <tracesDir> <outFile>
 * Exits non-zero and prints a validation report if the merged model is inconsistent.
 */
const fs = require('fs');
const path = require('path');

const tracesDir = process.argv[2];
const outFile = process.argv[3];
if (!tracesDir || !outFile) {
  console.error('usage: node merge-flows.js <tracesDir> <outFile>');
  process.exit(2);
}

const NODE_TYPES = new Set(['actor', 'command', 'aggregate', 'event', 'policy', 'readModel', 'externalSystem', 'invariant']);
const EDGE_VERBS = new Set(['issues', 'handled by', 'emits', 'triggers', 'updates', 'read by', 'reads', 'raises', 'enforces', 'calls', 'returns']);
const ANCHOR_REQUIRED = new Set(['command', 'aggregate', 'event', 'policy', 'readModel', 'invariant']);
const TERM_STATUS = new Set(['resolved', 'partial', 'unresolved']);
const TERM_CATEGORIES = new Set(['concept', 'jargon', 'acronym', 'role', 'system', 'state', 'metric']);

const errors = [];
const warnings = [];

const files = fs.readdirSync(tracesDir).filter(f => f.endsWith('.json')).sort();
if (files.length === 0) { console.error('no trace files found'); process.exit(2); }

const nodes = new Map();     // id -> merged node
const flows = new Map();     // id -> flow
const hotspots = new Map();  // id -> hotspot
const terms = new Map();     // id -> ubiquitous-language term (authored by the glossary-mining phase)

for (const file of files) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(path.join(tracesDir, file), 'utf8'));
  } catch (e) {
    errors.push(`${file}: unparseable JSON: ${e.message}`);
    continue;
  }
  const flowIds = (doc.flows || []).map(f => f.id).join(',') || file.replace(/\.json$/, '');

  for (const n of doc.nodes || []) {
    if (!n.id || !n.type || !n.label) { errors.push(`${file}: node missing id/type/label: ${JSON.stringify(n).slice(0, 80)}`); continue; }
    if (!NODE_TYPES.has(n.type)) errors.push(`${file}: node ${n.id} has unknown type '${n.type}'`);
    if (ANCHOR_REQUIRED.has(n.type) && !(n.tactical && Array.isArray(n.tactical.anchors) && n.tactical.anchors.length))
      warnings.push(`${file}: ${n.type} node ${n.id} has no tactical.anchors`);

    if (!nodes.has(n.id)) {
      const merged = { ...n };
      merged.usages = [];
      if (n.tactical) merged.usages.push({ flow: flowIds, explanation: n.tactical.explanation || '', anchors: n.tactical.anchors || [] });
      nodes.set(n.id, merged);
    } else {
      const m = nodes.get(n.id);
      if (m.type !== n.type) errors.push(`node ${n.id}: type conflict '${m.type}' vs '${n.type}' (${file})`);
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
    if (flows.has(f.id)) { errors.push(`duplicate flow id ${f.id} (${file})`); continue; }
    f._sourceFile = file;
    flows.set(f.id, f);
  }

  for (const h of doc.hotspots || []) {
    if (hotspots.has(h.id)) { warnings.push(`duplicate hotspot id ${h.id} (${file}) - keeping first`); continue; }
    hotspots.set(h.id, h);
  }

  for (const t of doc.terms || []) {
    if (!t.id || !t.term) { errors.push(`${file}: term missing id/term: ${JSON.stringify(t).slice(0, 80)}`); continue; }
    if (terms.has(t.id)) { warnings.push(`duplicate term id ${t.id} (${file}) - keeping first`); continue; }
    terms.set(t.id, t);
  }
}

// Cross-reference validation
for (const [fid, f] of flows) {
  if (!f.name) errors.push(`flow ${fid}: missing name`);
  if (!f.kind) warnings.push(`flow ${fid}: missing kind`);
  if (!f.status) warnings.push(`flow ${fid}: missing status (assuming live)`), (f.status = 'live');
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

// Ubiquitous-language term validation. A term is either resolved (has a definition) or flagged
// with the specific question a human should answer - the same contract hotspots use.
for (const [tid, t] of terms) {
  const status = t.status || 'resolved';
  if (!TERM_STATUS.has(status)) errors.push(`term ${tid}: unknown status '${status}'`);
  if (t.category && !TERM_CATEGORIES.has(t.category)) warnings.push(`term ${tid}: nonstandard category '${t.category}'`);
  if (status === 'resolved' && !(t.definition || '').trim()) errors.push(`term ${tid}: resolved term has no definition (flag it partial/unresolved with an openQuestion instead)`);
  if (status !== 'resolved' && !(t.openQuestion || '').trim()) errors.push(`term ${tid}: status '${status}' requires an openQuestion (what a human should answer)`);
  for (const nid of t.relatedNodes || []) if (!nodes.has(nid)) errors.push(`term ${tid}: relatedNodes '${nid}' not in nodes`);
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
const termList = [...terms.values()].sort((a, b) => String(a.term).localeCompare(String(b.term), undefined, { sensitivity: 'base' }));
const unresolvedTerms = termList.filter(t => (t.status || 'resolved') !== 'resolved').length;

const model = {
  version: 1,
  meta: {
    generatedFrom: files,
    counts: { flows: flows.size, nodes: nodes.size, hotspots: hotspots.size, terms: termList.length, unresolvedTerms, byType: typeCounts },
    deadFlows,
    sharedGlossary: glossary,
  },
  nodes: [...nodes.values()].map(n => { const { _src, ...rest } = n; return rest; }),
  flows: [...flows.values()].map(f => { const { _sourceFile, ...rest } = f; return rest; }),
  hotspots: [...hotspots.values()],
  terms: termList,
};

fs.writeFileSync(outFile, JSON.stringify(model, null, 2));

console.log(`merged ${files.length} trace files -> ${outFile}`);
console.log(`nodes: ${model.nodes.length}, flows: ${model.flows.length}, hotspots: ${model.hotspots.length}, terms: ${model.terms.length}${unresolvedTerms ? ` (${unresolvedTerms} need input)` : ''}`);
if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.forEach(w => console.log('  - ' + w)); }
if (errors.length) { console.log(`\nERRORS (${errors.length}):`); errors.forEach(e => console.log('  - ' + e)); process.exit(1); }
console.log('\nvalidation: OK');
