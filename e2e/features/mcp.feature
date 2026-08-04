Feature: MCP server — reading the model over POST /mcp
  The MCP face is served at POST /mcp by the same `view` process. An MCP SDK client
  connects over streamable HTTP (the endpoint is not behind the loopback guard) and
  drives the real tools against the bundled self-model.

  Scenario: Listing the model returns its flows and node ids
    Given an MCP client connected to the view server
    When I call the "list_model" tool
    Then the response indexes the model's flows and nodes

  Scenario: Getting a node by id returns its grounded context
    Given an MCP client connected to the view server
    When I call "get_node" for "agg-comment-store"
    Then the response describes the "Comment Store" aggregate
