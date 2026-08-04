// The MCP face of the es-view server. Runs in the SAME process as the web UI and shares its
// in-memory session (selection + bundle), so when the human clicks a node in the browser, a
// connected Claude session sees it via get_current_selection. Mounted at POST /mcp over streamable
// HTTP. Ported from src/server/mcp.mjs — same McpServer name/version, tools, resource, titles,
// descriptions, inputSchemas, body cap, session handling, and JSON-RPC error bodies.
//
// Design (per the integration research): "current selection" is a TOOL (always fresh, no
// subscription needed); the curated bundle is a RESOURCE the user can @-mention.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ServiceBundle } from '../../application/services.js';
import type { Selection } from '../../domain/session/selection.js';
import type { ContextBundle } from '../../domain/session/context-bundle.js';
import { buildNodeContext, renderNodeContextMarkdown, renderBundleMarkdown } from '../../application/read-models/context.js';
import { getNode } from '../../application/queries/get-node.js';
import { getFlow } from '../../application/queries/get-flow.js';
import { listModel } from '../../application/queries/list-model.js';
import { listDataModel } from '../../application/queries/list-data-model.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

function buildMcpServer(services: ServiceBundle, selection: Selection, bundle: ContextBundle): McpServer {
  const server = new McpServer({ name: 'event-storming-recovery', version: '0.1.0' });

  server.registerTool(
    'get_current_selection',
    {
      title: 'Get the current selection',
      description: 'Returns the domain node the human is currently looking at in the Event Storming explorer UI (label, type, description, the invariants it enforces, the flows it appears in, and the real source behind each anchor). Call this when the user refers to "the selected node/aggregate/…".',
      inputSchema: {},
    },
    async () => {
      const sel = selection.get();
      if (!sel) return text('No node is currently selected in the explorer UI. Ask the user to click a node, or use get_node / list_model.');
      const ctx = buildNodeContext(services, sel.nodeId);
      return ctx ? text(renderNodeContextMarkdown(ctx)) : text(`The selected node '${sel.nodeId}' is no longer in the model.`);
    },
  );

  server.registerTool(
    'get_node',
    {
      title: 'Get a domain node by id',
      description: 'Returns the grounded context for a specific node id (see list_model for ids): its type, description, enforced/enforcing invariants, flows, and source anchors with real code.',
      inputSchema: { nodeId: z.string().describe('the node id, e.g. "agg-order"') },
    },
    async ({ nodeId }) => text(getNode(services, nodeId)),
  );

  server.registerTool(
    'get_flow',
    {
      title: 'Get a flow by id',
      description: 'Returns a whole flow grounded in code: its trigger/summary, the command→aggregate→event chain, hotspots (open questions), a Mermaid graph of the flow, and every node with its source anchors.',
      inputSchema: { flowId: z.string().describe('the flow id, e.g. "place-order"') },
    },
    async ({ flowId }) => text(getFlow(services, flowId)),
  );

  server.registerTool(
    'list_model',
    {
      title: 'List the model index',
      description: 'A compact index of the whole Event Storming model: every flow id + name, and every node id + label + type. Use this to discover ids for get_node / get_flow.',
      inputSchema: {},
    },
    async () => text(listModel(services)),
  );

  server.registerTool(
    'list_data_model',
    {
      title: 'List the recovered data model',
      description: 'The storage the code actually touches, whatever its kind: the datastore containment tree — data stores (each with its store kind and host) and their fields — plus, for each record set, the behavioral nodes that write/read/project it. Use this for "what stores does this touch", "where does this data live", or "who writes this store". For a single node\'s fields and lineage, use get_node.',
      inputSchema: {},
    },
    async () => text(listDataModel(services)),
  );

  server.registerResource(
    'selected-nodes',
    'event-storming://selected-nodes',
    {
      title: 'Curated context bundle',
      description: 'The items the human has gathered in the explorer: nodes, whole flows (each with a Mermaid graph), and hotspots — every one grounded with its invariants, flows, and source anchors. @-mention this to hand Claude the entire set at once.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: renderBundleMarkdown(services, bundle.list()) }],
    }),
  );

  return server;
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 4_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : undefined); } catch { resolve(undefined); } });
    req.on('error', () => resolve(undefined));
  });
}

const isInitialize = (b: any): boolean => Array.isArray(b) ? b.some((m) => m && m.method === 'initialize') : !!(b && b.method === 'initialize');

/**
 * Returns an async (req,res)=>Promise<boolean> handler for /mcp. Stateful over streamable HTTP:
 * an `initialize` POST spins up a session (Mcp-Session-Id), and later POST/GET/DELETE reuse the
 * transport for that session. Every session's tools close over the shared `services` + session,
 * so the live selection the human sets in the UI is always what Claude reads.
 */
export function createMcpHandler(services: ServiceBundle, selection: Selection, bundle: ContextBundle) {
  const transports = new Map<string, StreamableHTTPServerTransport>(); // sessionId -> transport

  return async function mcpHandler(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const body = req.method === 'POST' ? await readJsonBody(req) : undefined;

      let transport: StreamableHTTPServerTransport | undefined = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (req.method === 'POST' && !sessionId && isInitialize(body)) {
          const t: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true,
            onsessioninitialized: (sid: string) => { transports.set(sid, t); },
          });
          transport = t;
          t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
          await buildMcpServer(services, selection, bundle).connect(t);
        } else {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'No valid session. Send an initialize request first.' }, id: null }));
          return true;
        }
      }

      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: String((err && (err as Error).message) || err) }, id: null }));
      }
    }
    return true;
  };
}
