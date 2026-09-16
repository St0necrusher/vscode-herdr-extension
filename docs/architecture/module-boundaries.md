# Module boundaries

Status: accepted in [Define the extension module architecture](https://github.com/St0necrusher/vscode-herdr-extension/issues/8).

Read this document before planning, implementing, reviewing, or moving source and test modules. Apply every rule to the resulting dependency graph; a change is complete only when the graph and its automated checks agree with this document.

## Architecture

The extension uses an acyclic, locality-first module graph:

```text
extension ──────> features
    │                │
    └──> adapters ───┤
             │       │
             └───────┴──> named contracts / model
                                │
                                └──> shared
```

An arrow means that the source may import the target. `extension/` is the composition root. It is the only layer that assembles concrete adapters and coordinates sibling features.

Create optional directories such as `contracts/`, `model/`, and root `shared/` only when an actual second consumer requires them.

A representative layout is:

```text
src/
  extension/
    activate.ts
    compose.ts

  features/
    navigation/
      <public entry point>
      internal/
      shared/
    pane-terminal/
    lifecycle/
    notifications/

  adapters/
    herdr/
      socket/
      terminal-cli/
      shared/
    vscode/
      navigation/
      terminal/
      notifications/
      shared/

  contracts/        # created lazily
  model/            # created lazily
  shared/           # created lazily
```

## Ownership and imports

### Composition

- `extension/` owns activation, concrete wiring, cross-feature orchestration, and disposal.
- Cross-feature workflows are raised to their nearest common consumer in `extension/`.
- The composition graph remains explicit in typed factories; runtime lookup and mutable global state stay outside the design.

### Features

- A feature owns one user-facing capability and presents a small public interface.
- A feature imports named contracts, model modules, and shared code beneath it.
- Sibling features remain isolated from one another.
- A feature receives external behavior through injected interfaces.

### Adapters

- Adapters are grouped first by the external owner, such as `herdr/` or `vscode/`, and then by the seam they adapt.
- Sibling adapters remain isolated from one another. Their composition belongs in `extension/`; common implementation inside one external-owner group belongs in that group's `shared/`.
- Concrete adapters stay outside features.
- An adapter may use a type-only import from a feature's public interface when it implements a consumer-owned port. It does not import the feature's implementation.
- An interface consumed by several features moves to a named `contracts/*` module rather than being assigned to an arbitrary feature.

### Public interfaces

- Every module declares one public entry point. Cross-module imports go through that entry point.
- Internal implementation stays under the owning module and is imported only from within that module.
- Public interfaces include observable behavior, invariants, ordering constraints, errors, lifecycle, and performance characteristics—not only TypeScript types.
- Prefer a deep module: keep the public interface small while hiding protocol, reconnect, buffering, process, or VS Code lifecycle complexity behind it.

## Sharing

Use the nearest shared owner:

| Situation | Placement |
| --- | --- |
| One consumer | Beside that consumer |
| Several consumers inside one owner | `<owner>/shared/` |
| Several owners and one coherent concept | A named lower-level module with its own interface |
| Several owners but no coherent concept | Keep ownership local and revisit the consumers |

`shared/` expresses visibility within an existing owner; it is not an owner itself. Name files and extracted modules after the concept they implement. Generic ownership names such as `core`, `utils`, `common`, and `helpers` do not establish a valid module seam.

Before extracting shared code, identify the consumers, their nearest common owner, and the interface of the shared concept. The extraction is complete when every consumer imports through that owner without introducing a forbidden edge or cycle.

## Dependency injection and lifecycle

Use manual constructor or factory injection with typed dependency objects:

```ts
interface NavigationDependencies {
  herdrClient: HerdrClient;
  view: NavigationView;
  logger: Logger;
}

function createNavigation(
  dependencies: NavigationDependencies,
): NavigationFeature {
  // Implementation hidden behind NavigationFeature.
}
```

Use explicit composition instead of a DI container or service locator. If composition grows, split it into typed composition factories while preserving a readable graph.

The composition root owns the lifetime of what it creates. Long-lived modules and adapters expose disposal and are registered with VS Code's extension subscriptions. This includes sockets, child processes, event subscriptions, terminal controllers, and output channels.

## Tests

The interface is the test surface. Assert observable outcomes through public interfaces so internal refactors do not require test rewrites.

- Place fast Vitest tests beside the source they exercise.
- Test reducers, snapshot/event ordering, reconnect behavior, terminal ownership, errors, and feature orchestration through typed fakes.
- Put adapter integration tests under `test/integration/`; exercise controlled socket and process boundaries instead of adapter internals.
- Put a small `@vscode/test-cli` and `@vscode/test-electron` suite under `test/extension/` for activation, registrations, disposal, and critical VS Code integration.
- Keep the normal suite and CI independent of an installed Herdr instance.

Use the narrowest test surface that proves the behavior. The Extension Host suite covers VS Code integration rather than repeating behavior already proved through module interfaces.

## Automated guardrails

The project baseline is:

- npm with a committed `package-lock.json`;
- strict TypeScript;
- ESLint flat config with TypeScript support;
- Prettier run separately from ESLint, with `eslint-config-prettier` disabling conflicting rules;
- architecture-aware lint or dependency rules that check layer direction, public entry points, sibling isolation, internal imports, and cycles.

Once configured, the repository scripts are the executable source of truth for command details. Completion requires the equivalent of:

```text
typecheck
lint
format:check
test
test:extension
```

The full Extension Host suite belongs in CI and feature completion; the focused Vitest suite is the tight development loop.

## Changing the architecture

Treat a required forbidden edge as design feedback. First try moving orchestration to the common consumer, injecting an interface, or extracting a coherent named module. If the accepted graph still cannot express the requirement, make an explicit architecture decision and update this document and the automated guardrails together.
