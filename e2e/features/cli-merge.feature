Feature: CLI merge — reporting and validate-then-write
  The proof slice (cli.feature) shows merge turns valid traces into a model and rejects an
  invalid one non-zero. These scenarios pin what the proof slice leaves unasserted: the exact
  stdout the user reads on success, the byte-exact validator error and the "refuse to write"
  guarantee on an invalid model (#8), and the distinct exit code for an empty traces directory.

  Scenario: Merging valid traces reports the counts and validates OK
    Given a directory of valid per-flow traces
    When I run merge on that traces directory
    Then the CLI exits zero
    And a flows.json is written
    And stdout reports the merged trace count and the node and flow counts
    And stdout reports "validation: OK"

  Scenario: An invalid trace prints the validator error and refuses to write the model
    Given a directory containing an invalid trace
    When I run merge on that traces directory
    Then the CLI exits non-zero
    And stdout reports "flow bad: aggregate agg-x issues a command - forbidden"
    And stderr reports "validation failed: refusing to write"
    And no flows.json is written

  Scenario: An empty traces directory fails with the no-trace-files error
    Given an empty traces directory
    When I run merge on that traces directory
    Then the CLI exits with code 2
    And stderr reports "no trace files found"
    And no flows.json is written
