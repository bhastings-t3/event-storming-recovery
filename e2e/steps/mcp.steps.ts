/**
 * Steps for the MCP face. An MCP SDK client (the same client library the plugin uses) is connected
 * by the `mcpClient` fixture over POST /mcp against the running `view` server, then drives the real
 * tools and resource and asserts on their grounded text — proving the MCP contract end to end.
 *
 * Two scenarios also POST to the same process's HTTP `/api/*` face (via `viewServer.url`) to prove
 * the selection and bundle are shared across the HTTP and MCP faces in one process: the whole point
 * of the design (AGENTS.md: "Session state is process-global … shared across the HTTP and MCP faces").
 */
import { expect } from '@playwright/test';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Given, When, Then } from './fixtures.js';

/** The byte-exact tool names the plugin depends on (AGENTS.md). */
const CONTRACT_TOOLS = ['get_current_selection', 'get_node', 'get_flow', 'list_model', 'list_data_model'];

/** Flatten an MCP tool result's text content blocks. */
function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
}

/** POST JSON to the running view process's HTTP face with a loopback Origin, so the #7 guard passes. */
async function postApi(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify(body),
  });
}

Given('an MCP client connected to the view server', async ({ mcpClient }) => {
  // the fixture already connected; assert the contracted tool surface so a break here is legible
  const { tools } = await mcpClient.listTools();
  expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(CONTRACT_TOOLS));
});

Then('the tools are exactly the contracted set', async ({ mcpClient }) => {
  const { tools } = await mcpClient.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual([...CONTRACT_TOOLS].sort());
});

Then('the resource {string} is offered', async ({ mcpClient }, uri: string) => {
  const { resources } = await mcpClient.listResources();
  expect(resources.map((r) => r.uri)).toContain(uri);
});

When('I call the {string} tool', async ({ mcpClient, world }, toolName: string) => {
  world.toolText = textOf(await mcpClient.callTool({ name: toolName, arguments: {} }));
});

When('I call {string} for {string}', async ({ mcpClient, world }, toolName: string, nodeId: string) => {
  world.toolText = textOf(await mcpClient.callTool({ name: toolName, arguments: { nodeId } }));
});

When('I call {string} for flow {string}', async ({ mcpClient, world }, toolName: string, flowId: string) => {
  world.toolText = textOf(await mcpClient.callTool({ name: toolName, arguments: { flowId } }));
});

When('I read the {string} resource', async ({ mcpClient, world }, uri: string) => {
  const result = await mcpClient.readResource({ uri });
  world.resourceText = (result.contents ?? []).map((c) => (typeof c.text === 'string' ? c.text : '')).join('\n');
});

When('the human selects {string} in the explorer over HTTP', async ({ viewServer }, nodeId: string) => {
  const res = await postApi(viewServer.url, '/api/selection', { nodeId });
  expect(res.status).toBe(200); // the loopback guard admitted a same-origin loopback POST (#7)
});

When('the human adds {string} to the context bundle over HTTP', async ({ viewServer }, id: string) => {
  const res = await postApi(viewServer.url, '/api/context', { type: 'node', id });
  expect(res.status).toBe(200);
});

Then('the response indexes {int} flows and {int} nodes', async ({ world }, flows: number, nodes: number) => {
  expect(world.toolText).toContain('# Model index');
  expect(world.toolText).toContain(`## Flows (${flows})`);
  expect(world.toolText).toContain(`## Nodes (${nodes})`);
});

Then('it lists the {string} flow and the {string} node', async ({ world }, flowId: string, nodeId: string) => {
  expect(world.toolText).toContain(`\`${flowId}\``);
  expect(world.toolText).toContain(`\`${nodeId}\``);
});

Then('the response is the data model with datastores and their fields', async ({ world }) => {
  expect(world.toolText).toContain('# Data model');
  expect(world.toolText).toContain('_(filesystem)_'); // a recovered datastore kind
  expect(world.toolText).toContain('comments.json (sidecar)'); // a real datastore label
  expect(world.toolText).toMatch(/- fields: /); // each record set lists its columns
});

Then('the response describes the {string} aggregate', async ({ world }, label: string) => {
  expect(world.toolText).not.toContain('Unknown node');
  expect(world.toolText).toContain(`## ${label}  _(aggregate)_`);
});

Then('the response reports node {string} is unknown', async ({ world }, nodeId: string) => {
  expect(world.toolText).toBe(`Unknown node '${nodeId}'. Use list_model to see available node ids.`);
});

Then('the response details the flow {string}', async ({ world }, name: string) => {
  expect(world.toolText).not.toContain('Unknown flow');
  expect(world.toolText).toContain(`# Flow: ${name}`);
  expect(world.toolText).toContain('**Trigger:**');
  expect(world.toolText).toContain('**Flow:**'); // the command→aggregate→event chain
});

Then('the response reports flow {string} is unknown', async ({ world }, flowId: string) => {
  expect(world.toolText).toBe(`Unknown flow '${flowId}'. Use list_model to see available flow ids.`);
});

Then('the response says no node is selected', async ({ world }) => {
  expect(world.toolText).toContain('No node is currently selected in the explorer UI.');
});

Then('the resource is the empty-bundle placeholder', async ({ world }) => {
  expect(world.resourceText).toBe('_No items in the context bundle yet._');
});

Then('the resource contains the {string} aggregate', async ({ world }, label: string) => {
  expect(world.resourceText).not.toContain('_No items in the context bundle yet._');
  expect(world.resourceText).toContain(`## ${label}  _(aggregate)_`);
});
