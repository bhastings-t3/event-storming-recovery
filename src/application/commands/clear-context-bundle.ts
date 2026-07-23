// ClearContextBundle: empty the curated bundle.
import type { ContextBundle } from '../../domain/session/context-bundle.js';

export function clearContextBundle(bundle: ContextBundle): void {
  bundle.clear();
}
