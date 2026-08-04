/**
 * Steps for the MCP face. An MCP SDK client (the same client library the plugin uses) is connected
 * by the `mcpClient` fixture over POST /mcp against the running `view` server, then drives the real
 * tools and asserts on their grounded text — proving the MCP contract end to end.
 */
import { expect } from '@playwright/test';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Given, When, Then } from './fixtures.js';

/** Flatten an MCP tool result's text content blocks. */
function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
}

Given('an MCP client connected to the view server', async ({ mcpClient }) => {
  // the fixture already connected; assert the contracted tool surface so a break here is legible
  const { tools } = await mcpClient.listTools();
  expect(tools.map((t) => t.name)).toEqual(
    expect.arrayContaining(['get_current_selection', 'get_node', 'get_flow', 'list_model', 'list_data_model']),
  );
});

When('I call the {string} tool', async ({ mcpClient, world }, toolName: string) => {
  world.toolText = textOf(await mcpClient.callTool({ name: toolName, arguments: {} }));
});

When('I call {string} for {string}', async ({ mcpClient, world }, toolName: string, nodeId: string) => {
  world.toolText = textOf(await mcpClient.callTool({ name: toolName, arguments: { nodeId } }));
});

Then("the response indexes the model's flows and nodes", async ({ world }) => {
  expect(world.toolText).toContain('# Model index');
  expect(world.toolText).toContain('agg-comment-store'); // a real node id from the self-model
});

Then('the response describes the {string} aggregate', async ({ world }, label: string) => {
  expect(world.toolText).not.toContain('Unknown node');
  expect(world.toolText).toContain(label);
});
