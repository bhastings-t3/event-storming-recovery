Feature: Explorer SPA — filtering the flow list
  The sidebar search narrows the flow list with a tokenized AND match over each
  flow's name and the labels of its nodes. Typing a term that only one flow's
  content carries should leave that flow listed and drop the rest.

  Scenario: A search term narrows the flow list to the matching flows
    Given the explorer is open on the example model
    Then the sidebar lists 15 flows
    When I filter the flows by "glossary"
    Then the sidebar lists fewer than 15 flows
    And the flow named "Operator opens the explorer and reads the rendered model" is listed
    And the flow named "Operator adds a persistent comment to a model item" is not listed
