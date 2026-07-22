// The services bundle: model + indexes + repoRoot + comment store + source reader, shared by the
// HTTP API and the MCP server so both read the same resolved model and grounded source. Built at
// the composition root from a resolved model and the concrete adapters.
import type { Model } from '../domain/model/types.js';
import type { CommentStore } from '../domain/comment-store/comment-store.js';
import type { SourceGateway } from './ports.js';
import { buildIndexes, type Indexes } from './read-models/indexes.js';

export interface ResolvedModel {
  model: Model;
  source: string;
  sourcePath: string;
  repoRoot: string;
  warnings: string[];
}

export interface ServiceBundle {
  model: Model;
  indexes: Indexes;
  repoRoot: string;
  comments: CommentStore | null;
  readSource: SourceGateway['read'];
}

export interface BuildServicesDeps {
  comments?: CommentStore | null;
  sourceGateway: SourceGateway;
}

/** Build the services bundle (model + indexes + repoRoot + comment store) shared by the API and MCP. */
export function buildServices(resolved: ResolvedModel, deps: BuildServicesDeps): ServiceBundle {
  return {
    model: resolved.model,
    indexes: buildIndexes(resolved.model),
    repoRoot: resolved.repoRoot,
    comments: deps.comments ?? null,
    readSource: (repoRoot, relPath, line, ctx) => deps.sourceGateway.read(repoRoot, relPath, line, ctx),
  };
}
