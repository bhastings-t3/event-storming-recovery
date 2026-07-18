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

export const NODE_TYPES = new Set(['actor', 'command', 'aggregate', 'event', 'policy', 'readModel', 'externalSystem', 'invariant', 'datastore', 'field']);
export const EDGE_VERBS = new Set(['issues', 'handled by', 'emits', 'triggers', 'updates', 'read by', 'reads', 'raises', 'enforces', 'calls', 'returns', 'persists to', 'projects from', 'writes', 'connects via']);
const ANCHOR_REQUIRED = new Set(['command', 'aggregate', 'event', 'policy', 'readModel', 'invariant']);
const TERM_STATUS = new Set(['resolved', 'partial', 'unresolved']);
const TERM_CATEGORIES = new Set(['concept', 'jargon', 'acronym', 'role', 'system', 'state', 'metric']);

// Data-model field lineage enums (see docs/flows-schema.md). Nonstandard values are warnings, not
// errors, mirroring the forgiving treatment of nonstandard edge verbs.
const FIELD_CONFIDENCE = new Set(['high', 'medium', 'low']);
// Physical-storage containment (the data-model layer is technology-neutral): a `datastore` nests
// inside another `datastore` (server ▸ database ▸ table, or filesystem ▸ directory ▸ file, …); a
// `field` hangs off a datastore, or off another field for nested records. A node parented at the
// wrong level would silently vanish from the containment tree, so we warn on it.
const PARENT_LEVEL = { datastore: new Set(['datastore']), field: new Set(['datastore', 'field']) };
const FIELD_ROLES = new Set(['derived-from', 'filtered-by', 'joined-on', 'grouped-by', 'constant']);
const FIELD_TRANSFORMS = new Set(['identity', 'transformation', 'aggregation', 'join', 'filter', 'lookup', 'constant']);
// A field source ref that looks like a local physical node id must resolve to a known node.
const LOCAL_REF = /^(ds|fld)-/;

/**
 * Validate a node's `fields[]` (data-model layer). Pushes into the shared errors/warnings arrays.
 * A field is a conceptual property with a prose derivation and 0..N storage sources; empty/omitted
 * sources is valid. Refs that look like local node ids must resolve; free-form addresses pass as-is.
 *
 * @param {object} n - the node (already known to have `fields`)
 * @param {Map} nodes - id -> merged node (for ref resolution)
 * @param {string[]} errors
 * @param {string[]} warnings
 */
function validateFields(n, nodes, errors, warnings) {
  if (!Array.isArray(n.fields)) return;
  n.fields.forEach((f, i) => {
    if (!f || !String(f.name || '').trim() || !String(f.derivation || '').trim()) {
      errors.push(`node ${n.id}: field ${i} missing name/derivation`);
      return;
    }
    if (f.confidence !== undefined && !FIELD_CONFIDENCE.has(f.confidence)) warnings.push(`node ${n.id}: field '${f.name}' has nonstandard field confidence '${f.confidence}'`);
    if (f.conceptual !== undefined && typeof f.conceptual !== 'boolean') warnings.push(`node ${n.id}: field '${f.name}' has non-boolean conceptual`);
    for (const s of f.sources || []) {
      if (s.role !== undefined && !FIELD_ROLES.has(s.role)) warnings.push(`node ${n.id}: field '${f.name}' has nonstandard source role '${s.role}'`);
      if (s.transform !== undefined && !FIELD_TRANSFORMS.has(s.transform)) warnings.push(`node ${n.id}: field '${f.name}' has nonstandard source transform '${s.transform}'`);
      if (s.ref !== undefined && LOCAL_REF.test(s.ref) && !nodes.has(s.ref)) errors.push(`node ${n.id}: field '${f.name}' source ref '${s.ref}' not in nodes`);
    }
  });
}

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
  const terms = new Map();     // id -> ubiquitous-language term (authored by the glossary-mining phase)

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
        // Data-model enrichment often arrives in a LATER trace file (the data-mapping phase) than
        // the one that first defined the node. Carry fields + physical attributes across, unioning
        // fields by name so the data pass can annotate an aggregate/read model the trace pass made.
        if (Array.isArray(n.fields) && n.fields.length) {
          const byName = new Map((m.fields || []).map(f => [f.name, f]));
          for (const f of n.fields) byName.set(f.name, f); // the data pass is authority on a field
          m.fields = [...byName.values()];
        }
        for (const k of ['parent', 'storeKind', 'fieldKind', 'dataType', 'host', 'engine']) {
          if (n[k] !== undefined && m[k] === undefined) m[k] = n[k];
        }
        if (n.nullable !== undefined && m.nullable === undefined) m.nullable = n.nullable;
        if (Array.isArray(n.provenance) && n.provenance.length) m.provenance = [...new Set([...(m.provenance || []), ...n.provenance])];
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

    for (const t of doc.terms || []) {
      if (!t.id || !t.term) { errors.push(`${name}: term missing id/term: ${JSON.stringify(t).slice(0, 80)}`); continue; }
      if (terms.has(t.id)) { warnings.push(`duplicate term id ${t.id} (${name}) - keeping first`); continue; }
      terms.set(t.id, t);
    }
  }

  // Data-model integrity: parent containment must resolve (right level, no cycles), and fields[]
  // lineage is well-formed.
  for (const [, n] of nodes) {
    if (n.parent !== undefined && n.parent !== null) {
      const p = nodes.get(n.parent);
      if (!p) {
        errors.push(`node ${n.id}: parent '${n.parent}' not in nodes`);
      } else {
        const want = PARENT_LEVEL[n.type];
        if (want && !want.has(p.type)) warnings.push(`node ${n.id}: ${n.type} parent '${n.parent}' must be a ${[...want].join(' or ')} (it will be dropped from the data-model tree), not a ${p.type}`);
        // Walk up to catch a parent cycle (self-parent or a→b→a); parentChain would otherwise
        // produce a meaningless breadcrumb.
        const seen = new Set([n.id]);
        let cur = p;
        while (cur) { if (seen.has(cur.id)) { errors.push(`node ${n.id}: parent chain has a cycle`); break; } seen.add(cur.id); cur = cur.parent ? nodes.get(cur.parent) : null; }
      }
    }
    if (n.fields !== undefined) validateFields(n, nodes, errors, warnings);
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

  // Orphan check: nodes referenced by no flow. Physical nodes reached only via containment
  // (`parent`) or field lineage (`fields[].sources[].ref`) also count as referenced, so they
  // don't spuriously warn even when no flow step/edge names them directly.
  const referenced = new Set();
  for (const [, f] of flows) {
    (f.steps || []).forEach(s => referenced.add(s));
    (f.edges || []).forEach(e => { referenced.add(e.from); referenced.add(e.to); });
  }
  for (const [, n] of nodes) {
    if (n.parent !== undefined && n.parent !== null) referenced.add(n.parent);
    for (const f of n.fields || []) for (const s of f.sources || []) if (s.ref !== undefined) referenced.add(s.ref);
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
      generatedFrom: sources.map(s => s.name),
      counts: { flows: flows.size, nodes: nodes.size, hotspots: hotspots.size, terms: termList.length, unresolvedTerms, byType: typeCounts },
      deadFlows,
      sharedGlossary: glossary,
    },
    nodes: [...nodes.values()].map(n => { const { _src, ...rest } = n; return rest; }),
    flows: [...flows.values()].map(f => { const { _sourceFile, ...rest } = f; return rest; }),
    hotspots: [...hotspots.values()],
    terms: termList,
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
