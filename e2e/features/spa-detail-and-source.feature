Feature: Explorer SPA — hotspots and the source behind an anchor
  The detail panel is where grounding lives. A hotspot opens the panel on the
  open question a human should answer; a node's source anchor pulls the real code
  from the repo behind it (the anchor-scoped, loopback-guarded /api/source of
  issue #7 — a same-origin browser is a legitimate caller). Both are asserted on
  what the user sees, not on how the panel is built.

  Scenario: Opening a hotspot shows its detail
    Given the explorer is open on the example model
    When I open the hotspots drawer for the current flow
    And I click the hotspot card "Comment persistence is non-atomic and its failure is silent"
    Then the detail panel shows the hotspot "Comment persistence is non-atomic and its failure is silent"

  Scenario: Revealing the source behind a node's anchor returns real code
    Given the explorer is open on the example model
    When I click the node labelled "AddComment"
    And I reveal the source behind its first anchor
    Then the real source code is shown for that anchor
