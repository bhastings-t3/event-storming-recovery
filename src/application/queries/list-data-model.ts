// ListDataModel: the recovered physical storage as markdown (the MCP list_data_model tool text).
import type { ServiceBundle } from '../services.js';
import { renderDataModelMarkdown } from '../read-models/context.js';

export function listDataModel(services: ServiceBundle): string {
  return renderDataModelMarkdown(services);
}
