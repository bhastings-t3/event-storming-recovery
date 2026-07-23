// The domain invariants for a recovered Event Storming model: referential integrity, the
// event-storming grammar (an aggregate never issues a command), the ubiquitous-language terms
// contract, data-model lineage, and anchor coverage (a warning). Extracted verbatim from the
// pre-refactor merge.mjs validator so the error/warning STRINGS and their order are byte-identical.
import type { Node, Flow, Hotspot, Term } from './types.js';

export const NODE_TYPES = new Set(['actor', 'command', 'aggregate', 'event', 'policy', 'readModel', 'externalSystem', 'invariant', 'datastore', 'field']);
export const EDGE_VERBS = new Set(['issues', 'handled by', 'emits', 'triggers', 'updates', 'read by', 'reads', 'raises', 'enforces', 'calls', 'returns', 'persists to', 'projects from', 'writes', 'connects via']);
export const ANCHOR_REQUIRED = new Set(['command', 'aggregate', 'event', 'policy', 'readModel', 'invariant']);
export const TERM_STATUS = new Set(['resolved', 'partial', 'unresolved']);
export const TERM_CATEGORIES = new Set(['concept', 'jargon', 'acronym', 'role', 'system', 'state', 'metric']);

// Data-model field lineage enums (see docs/flows-schema.md). Nonstandard values are warnings, not
// errors, mirroring the forgiving treatment of nonstandard edge verbs.
export const FIELD_CONFIDENCE = new Set(['high', 'medium', 'low']);
// Physical-storage containment (the data-model layer is technology-neutral): a `datastore` nests
// inside another `datastore` (server ▸ database ▸ table, or filesystem ▸ directory ▸ file, …); a
// `field` hangs off a datastore, or off another field for nested records. A node parented at the
// wrong level would silently vanish from the containment tree, so we warn on it.
export const PARENT_LEVEL: Record<string, Set<string>> = { datastore: new Set(['datastore']), field: new Set(['datastore', 'field']) };
export const FIELD_ROLES = new Set(['derived-from', 'filtered-by', 'joined-on', 'grouped-by', 'constant']);
export const FIELD_TRANSFORMS = new Set(['identity', 'transformation', 'aggregation', 'join', 'filter', 'lookup', 'constant']);
// A field source ref that looks like a local physical node id must resolve to a known node.
export const LOCAL_REF = /^(ds|fld)-/;

/**
 * Validate a node's `fields[]` (data-model layer). Pushes into the shared errors/warnings arrays.
 * A field is a conceptual property with a prose derivation and 0..N storage sources; empty/omitted
 * sources is valid. Refs that look like local node ids must resolve; free-form addresses pass as-is.
 */
export function validateFields(n: Node, nodes: Map<string, Node>, errors: string[], warnings: string[]): void {
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
 * Run the assembled-model invariants over the merged Maps, pushing into the shared errors/warnings
 * arrays in the exact order the pre-refactor validator used: data-model integrity, cross-reference
 * validation, the aggregate-never-issues-a-command grammar rule, term validation, and the orphan
 * (referenced-by-no-flow) warning.
 */
export function crossValidate(
  nodes: Map<string, Node>,
  flows: Map<string, Flow>,
  hotspots: Map<string, Hotspot>,
  terms: Map<string, Term>,
  errors: string[],
  warnings: string[],
): void {
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
        let cur: Node | null | undefined = p;
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
  const referenced = new Set<string>();
  for (const [, f] of flows) {
    (f.steps || []).forEach((s) => referenced.add(s));
    (f.edges || []).forEach((e) => { referenced.add(e.from); referenced.add(e.to); });
  }
  for (const [, n] of nodes) {
    if (n.parent !== undefined && n.parent !== null) referenced.add(n.parent);
    for (const f of n.fields || []) for (const s of f.sources || []) if (s.ref !== undefined) referenced.add(s.ref);
  }
  for (const id of nodes.keys()) if (!referenced.has(id)) warnings.push(`node ${id} is referenced by no flow`);
}
