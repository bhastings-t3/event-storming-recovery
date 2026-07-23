// SelectNode: set the current selection to a node id (a falsy id clears it). Unknown id → not-found;
// otherwise returns the grounded selection response.
import type { ServiceBundle } from '../services.js';
import type { Selection } from '../../domain/session/selection.js';
import { getCurrentSelection, type SelectionResponse } from '../queries/get-current-selection.js';

export type SelectNodeResult =
  | ({ ok: true } & SelectionResponse)
  | { ok: false; error: string };

export function selectNode(services: ServiceBundle, selection: Selection, nodeId: string | null | undefined): SelectNodeResult {
  if (nodeId && !services.indexes.nodeById.has(nodeId)) return { ok: false, error: `unknown node '${nodeId}'` };
  selection.set(nodeId || null);
  return { ok: true, ...getCurrentSelection(services, selection) };
}
