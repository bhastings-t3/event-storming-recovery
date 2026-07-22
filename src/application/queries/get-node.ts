// GetNode: the grounded markdown for a node id, or the MCP unknown-id fallback string.
import type { ServiceBundle } from '../services.js';
import { buildNodeContext, renderNodeContextMarkdown } from '../read-models/context.js';

export function getNode(services: ServiceBundle, nodeId: string): string {
  const ctx = buildNodeContext(services, nodeId);
  return ctx ? renderNodeContextMarkdown(ctx) : `Unknown node '${nodeId}'. Use list_model to see available node ids.`;
}
