// GetFlow: the grounded markdown for a flow id, or the MCP unknown-id fallback string.
import type { ServiceBundle } from '../services.js';
import { buildFlowContext, renderFlowMarkdown } from '../read-models/context.js';

export function getFlow(services: ServiceBundle, flowId: string, opts: { includeSource?: boolean } = {}): string {
  const fc = buildFlowContext(services, flowId, opts);
  return fc ? renderFlowMarkdown(fc) : `Unknown flow '${flowId}'. Use list_model to see available flow ids.`;
}
