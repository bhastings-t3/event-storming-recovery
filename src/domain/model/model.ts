// The Model aggregate: wraps the recovered nodes/flows/hotspots/terms and enforces the model's
// invariants via validate(). The merge path (mergeTraceDocs) produces the canonical model object
// and its byte-identical validation report; this aggregate offers the same invariant checks over an
// already-assembled model plus its derived meta/counts, for callers that hold a resolved model.
import type { Model as ModelData, Node, Flow, Hotspot, Term, ValidationResult } from './types.js';
import { crossValidate } from './invariants.js';

export class Model {
  readonly nodes: Node[];
  readonly flows: Flow[];
  readonly hotspots: Hotspot[];
  readonly terms: Term[];

  constructor(private readonly data: ModelData) {
    this.nodes = data.nodes || [];
    this.flows = data.flows || [];
    this.hotspots = data.hotspots || [];
    this.terms = data.terms || [];
  }

  static from(data: ModelData): Model {
    return new Model(data);
  }

  /** The underlying plain model object (what the API/MCP surfaces serialize). */
  toJSON(): ModelData {
    return this.data;
  }

  get meta() {
    return this.data.meta;
  }

  /**
   * Run the assembled-model invariants (referential integrity, the es-grammar rule, the terms
   * contract, data-model lineage, and the anchor-coverage warning) over this model, returning the
   * same error/warning strings the merge validator emits.
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const nodes = new Map<string, Node>(this.nodes.map((n) => [n.id, n]));
    const flows = new Map<string, Flow>(this.flows.map((f) => [f.id, f]));
    const hotspots = new Map<string, Hotspot>(this.hotspots.map((h) => [h.id, h]));
    const terms = new Map<string, Term>(this.terms.map((t) => [t.id, t]));
    crossValidate(nodes, flows, hotspots, terms, errors, warnings);
    return { errors, warnings };
  }
}
