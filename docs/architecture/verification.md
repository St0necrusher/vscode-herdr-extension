# Architecture verification

Read this reference before changing tests, import enforcement, ESLint architecture rules, or the validation baseline. Apply the ownership rules in [`code-architecture.md`](code-architecture.md).

## Tests

Test observable behavior at the narrowest practical level. A stable behavioral seam does not have to be a repository-public export.

Tests may directly import the implementation under test, bypassing production entry points and package aliases. Do not add production exports, barrel files, or separate host-neutral public entries solely for tests. A refactor may require updating a test's import path or setup without changing its behavioral assertions; that alone is not evidence of a bad test. Avoid coupling assertions to private fields, child composition, or incidental algorithms.

- Place fast Vitest tests beside the owning feature or infrastructure module.
- Test Herdr Session discovery, startup policy, bootstrap ordering, buffered events, state transitions, reconnect, selection, errors, and disposal through controlled capability implementations.
- Put controlled Herdr CLI, socket, process, and protocol integration tests under `test/integration/` when they cross real infrastructure boundaries.
- Keep host-neutral state/policy implementation modules loadable in Vitest without loading or globally mocking `vscode`. Tests may import these files directly even when the feature's public entry exports host composition.
- Put a small `@vscode/test-cli` and `@vscode/test-electron` suite under `test/extension/` for activation, registrations, Views, commands, disposal, and critical VS Code integration.
- Keep the normal suite and CI independent of an installed Herdr instance. Isolate tests that intentionally require a real Herdr installation.

Production import visibility is not a test-access policy. Colocated tests may directly import their module's implementation; integration tests may directly import implementations they intentionally exercise. These exceptions do not allow production code to import tests or bypass its own boundaries. Do not manually assemble another module's private children merely to assert their wiring; prefer its meaningful behavior. Keep test helpers out of production exports.

A controlled implementation used in a test satisfies the same real boundary consumed in production. Tests do not require a production service to construct its own fake dependency. Do not preserve a host-neutral feature wrapper, forwarding controller, command registry interface, or production-only-for-tests accessors to retain a test harness. Test catalog/state and substantive status policy directly; test real command binding and feature composition at the host integration boundary. If a seam is removed, migrate its behavioral coverage rather than recreate it as production scaffolding.

A test does not assert private methods, concrete child classes, constructor wiring, incidental collaborator calls, or file layout. Calls that are themselves required external effects, such as explicitly starting a Herdr Session, remain observable behavior.

## Architecture lint

ESLint is the authoritative architecture lint surface. Rules express categories and ownership patterns, not a list of every current feature or infrastructure module.

Automated checks cover:

- top-level dependency direction;
- capability independence from implementations;
- feature-to-infrastructure implementation isolation;
- VS Code imports restricted to feature `vscode/` children, host infrastructure, and extension composition, including type imports;
- host-neutral state/policy modules independent of host implementations and their transitive dependencies;
- sibling feature and sibling infrastructure isolation;
- production public entry points and private-file imports, with direct access to the implementation under test allowed in tests;
- native `#capabilities`, `#features`, and `#infrastructure` aliases for production top-level module imports; tests may use direct relative imports;
- TypeScript `private` members instead of JavaScript `#` private identifiers;
- forbidden cycles;
- forbidden cross-owner imports;
- explicit test overrides for entry-point, alias, and owner-direction restrictions on imports of the implementation under test; retain applicable correctness, cycle, and production-to-test prohibition checks. Test exceptions must not weaken checks on production files.

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

A parent composition module may import concrete child entry points that it owns. Sibling child implementations do not import each other. Feature-root host composition may construct its host and host-neutral children without importing the VS Code API itself; concrete API use stays in its `vscode/` children. Extension composition uses the ordinary feature alias, which may export host composition. Tests load host-neutral implementation files directly. Additional public entries require actual production consumers.

Representative checks must accept feature `vscode/` children importing `vscode`, extension composition importing a feature's host composition from its ordinary public entry, and tests directly importing the implementation under test. Reject `vscode` imports in production catalog/state/capabilities, concrete Herdr infrastructure imports from feature host code, production private-entry bypasses, production sibling implementation imports, production imports of tests, and cycles. Check source and runtime feature alias resolution. Record evidence rather than assuming a passing check of the current tree exercises forbidden cases.

Production cross-module imports use public entry points. Files inside one module may import each other directly. Tests use the direct-import exception above. A local child entry point is visible to its parent without becoming a repository-wide export.

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
