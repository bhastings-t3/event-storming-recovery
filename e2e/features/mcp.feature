Feature: MCP server — the tools/resource contract over POST /mcp
  The MCP face is served at POST /mcp by the same `view` process. An MCP SDK client
  (the same library the plugin uses) connects over streamable HTTP and drives the
  real tools and resource against the bundled self-model. The tool and resource
  names are a byte-exact contract (AGENTS.md), and the selection/bundle are shared
  in-process with the HTTP face — so a click in the browser is visible to a
  connected Claude session. These scenarios pin both.

  Scenario: The MCP surface exposes exactly the contracted tools and resource
    Given an MCP client connected to the view server
    Then the tools are exactly the contracted set
    And the resource "event-storming://selected-nodes" is offered

  Scenario: Listing the model indexes its flows and nodes
    Given an MCP client connected to the view server
    When I call the "list_model" tool
    Then the response indexes 15 flows and 87 nodes
    And it lists the "add-comment" flow and the "agg-comment-store" node

  Scenario: Listing the data model returns the recovered storage layer
    Given an MCP client connected to the view server
    When I call the "list_data_model" tool
    Then the response is the data model with datastores and their fields

  Scenario: Getting a node by id returns its grounded context
    Given an MCP client connected to the view server
    When I call "get_node" for "agg-comment-store"
    Then the response describes the "Comment Store" aggregate

  Scenario: Getting an unknown node returns a sane error, not a crash
    Given an MCP client connected to the view server
    When I call "get_node" for "no-such-node"
    Then the response reports node "no-such-node" is unknown

  Scenario: Getting a flow by id returns its grounded detail
    Given an MCP client connected to the view server
    When I call "get_flow" for flow "add-comment"
    Then the response details the flow "Operator adds a persistent comment to a model item"

  Scenario: Getting an unknown flow returns a sane error, not a crash
    Given an MCP client connected to the view server
    When I call "get_flow" for flow "no-such-flow"
    Then the response reports flow "no-such-flow" is unknown

  Scenario: With nothing selected the current selection is the empty default
    Given an MCP client connected to the view server
    When I call the "get_current_selection" tool
    Then the response says no node is selected

  Scenario: A selection made over HTTP is visible to the MCP client
    Given an MCP client connected to the view server
    When the human selects "agg-comment-store" in the explorer over HTTP
    And I call the "get_current_selection" tool
    Then the response describes the "Comment Store" aggregate

  Scenario: The selected-nodes resource is the empty placeholder with an empty bundle
    Given an MCP client connected to the view server
    When I read the "event-storming://selected-nodes" resource
    Then the resource is the empty-bundle placeholder

  Scenario: Adding to the bundle over HTTP shows in the selected-nodes resource
    Given an MCP client connected to the view server
    When the human adds "agg-comment-store" to the context bundle over HTTP
    And I read the "event-storming://selected-nodes" resource
    Then the resource contains the "Comment Store" aggregate
