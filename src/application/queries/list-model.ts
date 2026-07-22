// ListModel: a compact index of the whole model — every flow id + name, every node id + label +
// type — the text the MCP list_model tool returns.
import type { ServiceBundle } from '../services.js';

export function listModel(services: ServiceBundle): string {
  const { model } = services;
  const flows = model.flows.map((f) => `- \`${f.id}\` — ${f.name}${f.status && f.status !== 'live' ? ` [${f.status}]` : ''}`).join('\n');
  const nodes = model.nodes.map((n) => `- \`${n.id}\` — ${n.label} _(${n.type})_`).join('\n');
  return `# Model index\n\n## Flows (${model.flows.length})\n${flows}\n\n## Nodes (${model.nodes.length})\n${nodes}`;
}
