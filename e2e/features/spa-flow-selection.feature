Feature: Explorer SPA — selecting a flow
  The sidebar lists every recovered flow. Choosing one puts that flow on the
  board: the header names it and the board renders that flow's stickies. This is
  the first move of the core journey, so it drives the real sidebar → board
  wiring in a real browser rather than asserting on layout internals.

  Scenario: Choosing a flow in the sidebar puts it on the board
    Given the explorer is open on the example model
    When I select the flow named "Operator generates the DOT + explorer views from the validated model"
    Then the flow board is titled "Operator generates the DOT + explorer views from the validated model"
    And the board renders the node "GenerateViews"
