Feature: Explorer SPA — the context bundle for Claude
  The operator curates a bundle of nodes and flows to hand to Claude. The drawer
  must show what was gathered, the "copy for Claude" action must produce a
  non-empty payload that names those items, and removing and clearing must take
  them back out. This drives the whole gather → copy → prune loop end to end.

  Scenario: Gather a node and a flow, copy them for Claude, then prune the bundle
    Given the explorer is open on the example model
    When I click the node labelled "AddComment"
    And I add the open node to the context bundle
    And I add the flow named "Operator generates the DOT + explorer views from the validated model" to the context bundle
    And I open the context bundle
    Then the context bundle lists "AddComment"
    And the context bundle lists "Operator generates the DOT + explorer views from the validated model"
    When I copy the bundle for Claude
    Then the copied payload is non-empty
    And the copied payload names "AddComment"
    And the copied payload names "GenerateViews"
    When I remove "AddComment" from the context bundle
    Then the context bundle does not list "AddComment"
    And the context bundle lists "Operator generates the DOT + explorer views from the validated model"
    When I clear the context bundle
    Then the context bundle is empty
