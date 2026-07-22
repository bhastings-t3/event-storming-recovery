// AddContextItem: add a typed ref (node / flow / hotspot) to the curated bundle. Unknown target →
// not-found; otherwise returns the (idempotent) bundle list.
import type { ServiceBundle } from '../services.js';
import type { ContextBundle, BundleRef } from '../../domain/session/context-bundle.js';
import { itemExists } from '../read-models/items.js';

export type AddContextItemResult =
  | { ok: true; items: BundleRef[] }
  | { ok: false; error: string };

export function addContextItem(services: ServiceBundle, bundle: ContextBundle, type: string, id: string | null | undefined): AddContextItemResult {
  if (!id || !itemExists(services, type, id)) return { ok: false, error: `unknown ${type} '${id}'` };
  return { ok: true, items: bundle.add(type, id) };
}
