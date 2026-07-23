// ClearSelection: clear the current selection.
import type { Selection } from '../../domain/session/selection.js';

export function clearSelection(selection: Selection): void {
  selection.clear();
}
