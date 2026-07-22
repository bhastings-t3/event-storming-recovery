// GetItem: label + grounded markdown for a bundle item (node / flow / hotspot); null when unknown.
import type { ServiceBundle } from '../services.js';
import { renderItemMarkdown } from '../read-models/context.js';
import { itemExists, itemLabel } from '../read-models/items.js';

export interface ItemResult {
  type: string;
  id: string;
  label: string;
  markdown: string;
}

export function getItem(services: ServiceBundle, type: string, id: string | null | undefined): ItemResult | null {
  if (!id || !itemExists(services, type, id)) return null;
  return { type, id, label: itemLabel(services, type, id), markdown: renderItemMarkdown(services, { type, id }) };
}
