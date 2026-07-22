// RegisterMcp: build the fixed `claude mcp add` command and run it via the ClaudeCliGateway,
// whitelisting the scope to local|project|user (nothing user-injectable).
import type { ClaudeCliGateway, ClaudeCliResult } from '../ports.js';

const SCOPES = ['local', 'project', 'user'];

export function registerMcp(input: { name: string; url: string; scope?: string }, gateway: ClaudeCliGateway): Promise<ClaudeCliResult> {
  const scope = input.scope && SCOPES.includes(input.scope) ? input.scope : undefined;
  return gateway.add({ name: input.name, url: input.url, scope });
}
