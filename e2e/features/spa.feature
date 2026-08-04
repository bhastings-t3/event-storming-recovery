Feature: Explorer SPA — selecting a node
  The explorer renders the bundled example model in a real browser. Clicking a
  sticky on the board must open the detail panel and name the node clicked, and
  mark that node selected. This drives the real SPA face end to end: a real
  Chromium, the real DOM the layout engine builds, real Playwright locators.

  Scenario: Clicking a command opens the detail panel for it
    Given the explorer is open on the example model
    When I click the node labelled "AddComment"
    Then the detail panel names "AddComment"
    And that node is marked selected on the board

  Scenario: Clicking a different node moves the selection to it
    Given the explorer is open on the example model
    When I click the node labelled "Comment Store"
    Then the detail panel names "Comment Store"
