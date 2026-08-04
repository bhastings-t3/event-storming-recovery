Feature: Static generated explorer — a conventional command/aggregate/event/policy model
  Every other E2E scenario drives the bundled self-model, which is pipeline/dataflow-shaped and
  ATYPICAL — it has no policy at all and none of the aggregate-enforces-invariant / event-triggers-
  policy grammar most domains have (see AGENTS.md, docs/refactor/refactor-targets.md, issue #33). That
  makes the net fixture-biased. These scenarios build the generated explorer from the hand-written
  toy-shop model (a small, ordinary Order/Inventory domain) and drive the exact reactive shape the
  self-model can't exercise — proving the tool renders a conventional model, not just its own atypical
  one. They reuse the static-explorer step library wholesale; only the baked-in model differs.

  Scenario: The generated conventional file loads with stickies on the board
    Given the conventional static explorer is open
    Then the static board shows stickies

  Scenario: Selecting the order flow renders the command→aggregate→event chain
    Given the conventional static explorer is open
    When I select the static flow named "Customer places an order"
    Then the static flow board is titled "Customer places an order"
    And the static board renders the node "PlaceOrder"
    And the static board renders the node "Order"
    And the static board renders the node "OrderPlaced"

  Scenario: The reactive policy is on the board and its detail opens
    Given the conventional static explorer is open
    When I select the static flow named "Customer places an order"
    Then the static board renders the node "Whenever an order is placed, reserve its stock"
    When I click the static node labelled "Whenever an order is placed, reserve its stock"
    Then the static detail panel names "Whenever an order is placed, reserve its stock"

  Scenario: The Gallery lists Policy — the node type the self-model lacks
    Given the conventional static explorer is open
    When I switch to the static "Gallery" tab
    Then the static gallery lists the node type "Policy"
    And the static gallery lists the node type "Aggregate"

  Scenario: The Glossary renders the conventional ubiquitous language
    Given the conventional static explorer is open
    When I switch to the static "Glossary" tab
    Then the static glossary view lists "Backorder"
