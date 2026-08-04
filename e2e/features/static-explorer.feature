Feature: Static generated explorer — the self-contained explorer.html
  `generate` emits a self-contained explorer.html whose ~1,100-line client script (client-script.ts)
  is a SECOND implementation of the same views as the live SPA, with its own ids and classes. It has
  no server and no /api — the model is baked in — so these scenarios open the generated file directly
  over file:// and assert on the real rendered DOM. This is the coverage net #42 (de-dup) and #41
  (typed asset) both depend on: it mirrors the live-SPA journeys against the static file so a future
  refactor of the shared layout/tree math is caught if it changes user-visible behaviour.

  Scenario: The generated file loads with the first flow on the board
    Given the static explorer is open
    Then the static board shows stickies

  Scenario: Choosing a flow in the sidebar puts it on the board
    Given the static explorer is open
    When I select the static flow named "Operator generates the DOT + explorer views from the validated model"
    Then the static flow board is titled "Operator generates the DOT + explorer views from the validated model"
    And the static board renders the node "GenerateViews"

  Scenario: Clicking a node opens the detail panel for it
    Given the static explorer is open
    When I click the static node labelled "AddComment"
    Then the static detail panel names "AddComment"

  Scenario: The Data model tab renders the recovered storage
    Given the static explorer is open
    When I switch to the static "Data model" tab
    Then the static data model view renders a store named "Local filesystem"

  Scenario: The Glossary tab renders the ubiquitous language
    Given the static explorer is open
    When I switch to the static "Glossary" tab
    Then the static glossary view lists "AddComment"

  Scenario: The Overview tab renders every flow as a context box
    Given the static explorer is open
    When I switch to the static "Overview" tab
    Then the static overview view renders 15 flow boxes

  Scenario: The Gallery lists the node types present in the model
    Given the static explorer is open
    When I switch to the static "Gallery" tab
    Then the static gallery lists the node type "Command"
    And the static gallery lists the node type "Aggregate"
    And the static gallery renders sticky cards
