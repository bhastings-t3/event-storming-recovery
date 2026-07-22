// ListContextBundle: the curated bundle items + the rendered markdown for the whole set.
import type { ServiceBundle } from '../services.js';
import type { ContextBundle, BundleRef } from '../../domain/session/context-bundle.js';
import { renderBundleMarkdown } from '../read-models/context.js';

export function listContextBundle(services: ServiceBundle, bundle: ContextBundle): { items: BundleRef[]; markdown: string } {
  const items = bundle.list();
  return { items, markdown: renderBundleMarkdown(services, items) };
}
