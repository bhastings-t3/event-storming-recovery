Feature: CLI generate — rendering, validate-then-render, and portable source links
  `generate` renders flows.dot + explorer.html from a canonical flows.json. It runs the one model
  validator first, so a shape-valid but broken model is refused rather than rendered (#8), and it
  resolves --repo-root to an absolute, forward-slashed vscode:// link so the emitted views are
  portable (#27). A missing input file fails with a clean message, not a stack trace.

  Scenario: Generating from a valid model writes both views and reports counts
    Given a valid flows.json describing a command and an aggregate
    When I generate the explorer from that model
    Then the CLI exits zero
    And a flows.dot and an explorer.html are written
    And stdout reports "flows: 1, nodes: 2, hotspots: 0"

  Scenario: A dangling step reference is refused rather than rendered
    Given a flows.json with a dangling step reference
    When I generate the explorer from that model
    Then the CLI exits non-zero
    And stdout reports "flow f1: step 'agg-missing' not in nodes"
    And stderr reports "validation failed: refusing to render an invalid model"
    And no explorer.html is written

  Scenario: A missing input file fails cleanly
    Given a path to a flows.json that does not exist
    When I generate the explorer from that model
    Then the CLI exits non-zero
    And stderr reports "generate: cannot read a model from"
    And no explorer.html is written

  Scenario: Generating with --repo-root . emits an absolute, forward-slashed source link
    Given a valid flows.json describing a command and an aggregate
    When I generate the explorer with repo-root set to the current directory
    Then the CLI exits zero
    And the generated flows.dot carries an absolute forward-slashed vscode link
    And the generated explorer.html bakes the absolute repo root as its default
