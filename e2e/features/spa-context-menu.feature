Feature: Explorer SPA — the board sticky right-click menu
  Right-clicking a sticky on the flow board opens a context menu wired straight
  into the board's imperative layout engine (Board.jsx threads onContextMenu into
  flow-geometry.js placeCard). The menu must appear over the node it was invoked
  on and offer that node's actions, and its "add to context bundle" action must
  actually add the node — proving the wiring end to end, not merely that a menu is
  visible. This is the code path #42 refactored with no automated net (issue #63).

  Scenario: Right-clicking a board sticky opens its context menu and adds the node to the bundle
    Given the explorer is open on the example model
    When I select the flow named "Operator generates the DOT + explorer views from the validated model"
    And I right-click the board node labelled "GenerateViews"
    Then the board context menu offers the node actions for "GenerateViews"
    When I add the node to the context bundle from its context menu
    And I open the context bundle
    Then the context bundle lists "GenerateViews"
