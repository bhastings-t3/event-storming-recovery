// The current selection: the single node the human last clicked in the explorer UI. In-memory,
// non-persistent — the live "what am I looking at right now" for this run. get_current_selection
// (MCP) and GET /api/selection (HTTP) read it; a click in the SPA sets it.
export interface SelectionRef {
  nodeId: string;
  at: number;
}

export class Selection {
  private selection: SelectionRef | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  get(): SelectionRef | null {
    return this.selection;
  }

  /** A falsy nodeId clears the selection. Returns the new selection (or null). */
  set(nodeId: string | null | undefined): SelectionRef | null {
    this.selection = nodeId ? { nodeId, at: this.now() } : null;
    return this.selection;
  }

  clear(): void {
    this.selection = null;
  }
}
