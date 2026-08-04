Feature: Explorer SPA — switching tabs
  Besides the flow board, the explorer has a Data model, a Glossary, and an
  Overview tab. Each must render its own content when selected. These assert on
  the content the user reads, not on the layout engine that draws it.

  Scenario: The Data model tab renders the recovered storage
    Given the explorer is open on the example model
    When I switch to the "Data model" tab
    Then the data model view renders a store named "Local filesystem"

  Scenario: The Glossary tab renders the ubiquitous language
    Given the explorer is open on the example model
    When I switch to the "Glossary" tab
    Then the glossary view lists the term "AddComment"

  Scenario: The Overview tab renders every flow as a context box
    Given the explorer is open on the example model
    When I switch to the "Overview" tab
    Then the overview view renders 15 flow boxes
