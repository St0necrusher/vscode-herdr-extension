# Architecture verification

Read this reference before changing tests, import enforcement, ESLint architecture rules, or the validation baseline. Apply the ownership rules in [`code-architecture.md`](code-architecture.md).

## Tests

Test observable behavior through stable feature and capability surfaces. Use the highest stable seam that proves the behavior at the narrowest practical test level.

A behavioral test survives changes to private classes, child-module boundaries, file placement, dependency wiring, and internal algorithms while observable behavior remains unchanged. A production-only refactor does not require changes to its behavioral assertions. If a refactor forces a behavioral test to change, verify that an accepted public capability changed; otherwise move the test to a more stable seam.

- Place fast Vitest tests beside the owning feature or infrastructure module.
- Test Herdr Session discovery, startup policy, bootstrap ordering, buffered events, state transitions, reconnect, selection, errors, and disposal through controlled capability implementations.
- Put controlled Herdr CLI, socket, process, and protocol integration tests under `test/integration/` when they cross real infrastructure boundaries.
- Put a small `@vscode/test-cli` and `@vscode/test-electron` suite under `test/extension/` for activation, registrations, Views, commands, disposal, and critical VS Code integration.
- Keep the normal suite and CI independent of an installed Herdr instance. Isolate tests that intentionally require a real Herdr installation.

Tests follow production boundaries. A module's own focused test may exercise its public child-module surface when that module has an independently meaningful contract. End-to-end feature behavior is tested through the top-level feature surface so internal child composition can change without test rewrites. Test-specific access remains local and is not re-exported as production surface.

A controlled implementation used in a test satisfies the same capability consumed in production. Tests do not require a production service to construct its own fake dependency.

A test does not assert private methods, concrete child classes, constructor wiring, incidental collaborator calls, or file layout. Calls that are themselves required external effects, such as explicitly starting a Herdr Session, remain observable behavior.

## Architecture lint

ESLint is the authoritative architecture lint surface. Rules express categories and ownership patterns, not a list of every current feature or infrastructure module.

Automated checks cover:

- top-level dependency direction;
- capability independence from implementations;
- feature-to-infrastructure isolation;
- sibling feature and sibling infrastructure isolation;
- public entry points and private-file imports;
- native `#capabilities`, `#features`, and `#infrastructure` aliases for top-level module imports;
- forbidden cycles;
- forbidden cross-owner imports;
- source and test imports where the same boundary applies.

Use maintained ESLint rules or plugins when they express the policy. Do not add a custom architecture checker or a per-module rule list when one generic ownership rule can express the invariant.

The current Dependency Cruiser configuration is transitional. Replace its per-module rules with generic ESLint enforcement. Remove Dependency Cruiser after ESLint covers the required cycle and boundary checks. Keep one authoritative architecture rule set.

## Import behavior

The intended import behavior is:

```text
capabilities   -> capabilities
features       -> capabilities
infrastructure -> capabilities
extension      -> capabilities + features + infrastructure
```

A parent composition module may import concrete child entry points that it owns. Sibling child implementations do not import each other.

Cross-module imports use public entry points. Files inside one module may import each other directly. A local child entry point is visible to its parent without becoming a repository-wide export.

## Validation baseline

Repository scripts are the executable source of truth for command names. Completion runs the applicable equivalents of:

```text
typecheck
lint, including architecture rules
format check
fast tests
infrastructure integration tests when affected
Extension Host tests when affected
```

The full Extension Host suite belongs in CI and feature completion. The focused Vitest suite remains the tight development loop.

Record unrun or environment-blocked checks explicitly. A local check is evidence for the tested environment; it is not a claim that CI enforces the same check.

## Guardrail completion criteria

An architecture guardrail change is complete when:

- the written rule has one automated implementation;
- the rule applies generically to current and future modules;
- representative valid imports pass;
- representative forbidden imports fail;
- source and test treatment matches the written policy;
- obsolete Dependency Cruiser or custom-checker rules are removed rather than left as a second authority;
- the repository validation commands pass or every blocker is recorded.
