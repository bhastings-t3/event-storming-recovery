// The curated context bundle: a set of typed refs { type: 'node' | 'flow' | 'hotspot', id } the
// human gathers in the explorer, insertion-ordered so a whole flow ("the graph") can sit alongside
// individual nodes. In-memory, non-persistent; exposed as the `selected-nodes` MCP resource.
export interface BundleRef {
  type: string;
  id: string;
}

interface BundleEntry {
  type: string;
  id: string;
  at: number;
}

const key = (type: string, id: string): string => `${type}:${id}`;

export class ContextBundle {
  private readonly bundle = new Map<string, BundleEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  list(): BundleRef[] {
    return [...this.bundle.values()].map(({ type, id }) => ({ type, id }));
  }

  /** Idempotent: adding an existing `type:id` is a no-op. Returns the current list. */
  add(type: string, id: string): BundleRef[] {
    if (id && !this.bundle.has(key(type, id))) this.bundle.set(key(type, id), { type, id, at: this.now() });
    return this.list();
  }

  remove(type: string, id: string): BundleRef[] {
    this.bundle.delete(key(type, id));
    return this.list();
  }

  clear(): void {
    this.bundle.clear();
  }
}
