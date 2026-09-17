# Architecture verification

Read this reference before changing tests, import enforcement, ESLint architecture rules, or the validation baseline. Apply the ownership rules in [`code-architecture.md`](code-architecture.md).

Migration: [#23](https://github.com/St0necrusher/vscode-herdr-extension/issues/23) updates the current source and lint to the accepted feature-host boundaries. Until then, the existing presentation infrastructure is a tracked legacy exception, not proof of target compliance.

## Tests

Test observable behavior through stable feature and capability surfaces. Use the highest stable seam that proves the behavior at the narrowest practical test level.

A behavioral test survives changes to private classes, child-module boundaries, file placement, dependency wiring, and internal algorithms while observable behavior remains unchanged. A production-only refactor does not require changes to its behavioral assertions. If a refactor forces a behavioral test to change, verify that an accepted public capability changed; otherwise move the test to a more stable seam.

- Place fast Vitest tests beside the owning feature or infrastructure module.
- Test Herdr Session discovery, startup policy, bootstrap ordering, buffered events, state transitions, reconnect, selection, errors, and disposal through controlled capability implementations.
- Put controlled Herdr CLI, socket, process, and protocol integration tests under `test/integration/` when they cross real infrastructure boundaries.
- Keep host-neutral public entries loadable in Vitest without loading or globally mocking `vscode`. Separate host entry points from state/policy exports.
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
- feature-to-infrastructure implementation isolation;
- VS Code imports restricted to feature `vscode/` children, host infrastructure, and extension composition, including type imports;
- host-neutral feature entries independent of host entry exports and their transitive dependencies;
- sibling feature and sibling infrastructure isolation;
- public entry points and private-file imports;
- native `#capabilities`, `#features`, and `#infrastructure` aliases for top-level module imports;
- TypeScript `private` members instead of JavaScript `#` private identifiers;
- forbidden cycles;
- forbidden cross-owner imports;
- source and test imports where the same boundary applies.

Use maintained ESLint rules or plugins when they express the policy. Do not add a custom architecture checker or a per-module rule list when one generic ownership rule can express the invariant.

ESLint is the sole authoritative architecture checker; Dependency Cruiser was removed in #22. Extend the existing generic rules for feature host boundaries rather than adding a second checker or one-off module allowlists.

## Import behavior

The intended import behavior is:

```text
capabilities   -> capabilities
features       -> capabilities
infrastructure -> capabilities
extension      -> capabilities + features + infrastructure
```

A parent composition module may import concrete child entry points that it owns. Sibling child implementations do not import each other. Feature-root host composition may construct its host and host-neutral children without importing the VS Code API itself; concrete API use stays in its `vscode/` children. Extension composition uses the deliberate feature host alias. Host-neutral consumers use the ordinary feature entry.

Representative checks must accept a feature `vscode/` child importing `vscode` and injected local capabilities, and extension composition importing the host entry. Reject `vscode` imports in catalog/state/capabilities, host exports from the host-neutral barrel, concrete Herdr infrastructure imports from feature host code, arbitrary child entry exposure, sibling implementation imports, and cycles. Check source and runtime host alias resolution. Record evidence rather than assuming a passing check of the current tree exercises forbidden cases.

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
