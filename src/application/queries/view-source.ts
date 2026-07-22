// ViewSource: the real code behind an anchor (path, line window, code) via the SourceGateway.
import type { SourceGateway } from '../ports.js';
import type { SourceView } from '../../domain/source/source-window.js';

export function viewSource(gateway: SourceGateway, repoRoot: string, path: string | undefined | null, line?: number, ctx?: number): SourceView {
  return gateway.read(repoRoot, path, line, ctx);
}
