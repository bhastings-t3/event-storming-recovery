Feature: Explorer SPA — commenting on a model item
  A human can pin a comment to a model item; it renders in the dialog and can be
  deleted again. Comments persist to a sidecar next to the model, so this drives
  a writable copy of the example model (the bundled one may be read-only — issue
  #9) and asserts the visible add-then-delete round trip.

  Scenario: Add a comment to a node, see it, then delete it
    Given the explorer is open on a writable copy of the example model
    When I open the comment dialog for the node "AddComment"
    And I add the comment "Revisit the atomicity gap here"
    Then the comment "Revisit the atomicity gap here" is shown in the dialog
    When I delete the comment "Revisit the atomicity gap here"
    Then the dialog shows no comments
