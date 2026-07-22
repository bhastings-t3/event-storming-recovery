// GetCurrentSelection: the grounded context (+ markdown) for the node the human last selected, or
// null/empty when nothing is selected. Backs GET /api/selection and the selection POST response.
import type { ServiceBundle } from '../services.js';
import type { Selection } from '../../domain/session/selection.js';
import { buildNodeContext, renderNodeContextMarkdown, type NodeContext } from '../read-models/context.js';

export interface SelectionResponse {
  selection: NodeContext | null;
  markdown: string;
}

export function getCurrentSelection(services: ServiceBundle, selection: Selection): SelectionResponse {
  const sel = selection.get();
  const ctx = sel ? buildNodeContext(services, sel.nodeId) : null;
  return { selection: ctx, markdown: ctx ? renderNodeContextMarkdown(ctx) : '' };
}
