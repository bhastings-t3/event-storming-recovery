// Existence + label for a typed bundle/comment ref (node / flow / hotspot). Shared by the context,
// comment, and item read/write use-cases. Ported from the helpers in server.mjs.
import type { ServiceBundle } from '../services.js';

export function itemExists(services: ServiceBundle, type: string, id: string): boolean {
  if (type === 'flow') return services.model.flows.some((f) => f.id === id);
  if (type === 'hotspot') return services.indexes.hotspotById.has(id);
  return services.indexes.nodeById.has(id);
}

export function itemLabel(services: ServiceBundle, type: string, id: string): string {
  if (type === 'flow') { const f = services.model.flows.find((x) => x.id === id); return f ? (f.name as string) : id; }
  if (type === 'hotspot') { const h = services.indexes.hotspotById.get(id); return h ? h.label : id; }
  const n = services.indexes.nodeById.get(id); return n ? n.label : id;
}
