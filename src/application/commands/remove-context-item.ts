// RemoveContextItem: drop a typed ref from the curated bundle; returns the remaining list.
import type { ContextBundle, BundleRef } from '../../domain/session/context-bundle.js';

export function removeContextItem(bundle: ContextBundle, type: string, id: string): BundleRef[] {
  return bundle.remove(type, id);
}
