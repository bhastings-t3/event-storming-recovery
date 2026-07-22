// The flows-schema, typed. These interfaces describe the shape of the recovered Event Storming
// model (nodes, flows, terms, hotspots) and its data-model layer (datastores, fields). They carry
// index signatures so the merge/validate/render code can spread and dynamically access properties
// exactly as the pre-refactor JS did, without fighting strict mode.

export interface Anchor {
  path: string;
  line?: number;
  symbol?: string;
  note?: string;
  [k: string]: unknown;
}

export interface Tactical {
  explanation?: string;
  anchors?: Anchor[];
  [k: string]: unknown;
}

export interface Usage {
  flow: string;
  explanation: string;
  anchors: Anchor[];
}

export interface FieldSource {
  ref?: string;
  role?: string;
  transform?: string;
  note?: string;
  [k: string]: unknown;
}

export interface Field {
  name: string;
  derivation?: string;
  dataType?: string;
  conceptual?: boolean;
  confidence?: string;
  nullable?: boolean;
  sources?: FieldSource[];
  [k: string]: unknown;
}

export interface Node {
  id: string;
  type: string;
  label: string;
  description?: string;
  inferred?: boolean;
  ownedBy?: string;
  synchronous?: boolean;
  provenance?: string[];
  tactical?: Tactical;
  usages?: Usage[];
  fields?: Field[];
  parent?: string | null;
  storeKind?: string;
  fieldKind?: string;
  dataType?: string;
  host?: string;
  engine?: string;
  nullable?: boolean;
  [k: string]: unknown;
}

export interface Edge {
  from: string;
  to: string;
  verb: string;
  [k: string]: unknown;
}

export interface Flow {
  id: string;
  name?: string;
  tier?: number;
  kind?: string;
  status?: string;
  steps?: string[];
  edges?: Edge[];
  hotspots?: string[];
  summary?: string;
  trigger?: string;
  supersededBy?: string;
  [k: string]: unknown;
}

export interface Hotspot {
  id: string;
  label: string;
  description?: string;
  tactical?: Tactical;
  [k: string]: unknown;
}

export interface Term {
  id: string;
  term: string;
  definition?: string;
  status?: string;
  category?: string;
  openQuestion?: string;
  relatedNodes?: string[];
  aka?: string[];
  [k: string]: unknown;
}

export interface ModelCounts {
  flows: number;
  nodes: number;
  hotspots: number;
  terms: number;
  unresolvedTerms: number;
  byType: Record<string, number>;
}

export interface DeadFlow {
  id: string;
  status?: string;
  supersededBy: string | null;
  name?: string;
}

export interface GlossaryEntry {
  id: string;
  type: string;
  label: string;
  description?: string;
  flowCount: number;
  flows: string[];
}

export interface ModelMeta {
  generatedFrom?: string[];
  counts?: ModelCounts;
  deadFlows?: DeadFlow[];
  sharedGlossary?: GlossaryEntry[];
  repoRoot?: string;
  title?: string;
  [k: string]: unknown;
}

export interface Model {
  version?: number;
  meta?: ModelMeta;
  nodes: Node[];
  flows: Flow[];
  hotspots: Hotspot[];
  terms?: Term[];
  [k: string]: unknown;
}

// A parsed trace document paired with its source file name (the input to the merge).
export interface TraceSource {
  doc: {
    nodes?: Node[];
    flows?: Flow[];
    hotspots?: Hotspot[];
    terms?: Term[];
    [k: string]: unknown;
  };
  name: string;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}
