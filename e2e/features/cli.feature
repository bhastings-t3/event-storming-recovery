Feature: CLI — merge then generate
  The CLI face is the `merge` and `generate` pipeline, run exactly as a user runs
  it: `node dist/node/adapters/cli/cli.js ...` against real trace JSON. The happy
  path turns traces into a canonical flows.json and a self-contained explorer; the
  failure path rejects an invalid model non-zero and leaves nothing behind (#8).

  Scenario: Merging valid traces then generating produces the model and explorer
    Given a directory of valid per-flow traces
    When I merge them into a flows.json
    And I generate the explorer from that flows.json
    Then a canonical flows.json and an explorer.html are produced

  Scenario: Merging an invalid trace fails without writing a model
    Given a directory containing an invalid trace
    When I merge that directory
    Then the CLI exits non-zero and writes no flows.json
