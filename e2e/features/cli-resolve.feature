Feature: CLI resolve tier — the model validator guards the --model serve path
  Issue #8 makes validation a boundary on every serve path, not only merge-on-the-fly. The `view`
  command resolves and validates an explicit --model before it binds a port, so an invalid model
  exits non-zero with the validator's error and never leaves a server running. Driven through the
  CLI as a bounded child process (no browser, no lingering server).

  Scenario: An invalid --model is rejected before a server starts
    Given a flows.json that is shape-valid but breaks the aggregate grammar
    When I view that model
    Then the CLI exits non-zero
    And stderr reports "failed validation"
    And stderr reports "aggregate agg-x issues a command - forbidden"
