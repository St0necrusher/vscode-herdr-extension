# Code architecture

Status: accepted by the owner. This document supersedes the adapter-centric layout originally accepted in [Define the extension module architecture](https://github.com/St0necrusher/vscode-herdr-extension/issues/8).

Read this document before planning, implementing, reviewing, or moving source or test code. Apply it when choosing ownership, placement, dependencies, sharing, imports, or public surfaces. A change is complete only when its ownership and dependency graph agree with these rules.

Use the domain language from [`CONTEXT.md`](../../CONTEXT.md). Herdr is the product domain, not an interchangeable backend. Names such as **Herdr Session**, **Space**, **Herdr Tab**, and **Pane** belong in feature code and capability contracts. Node, VS Code, CLI, and wire-protocol details are implementation details.

## Read the applicable reference

This file contains the rules needed for every code change. Read the additional reference when its branch applies:

- **Object design:** before defining or changing interfaces, classes, dependency injection, factories, state ownership, runtime composition, initialization, or disposal, read [`object-design.md`](object-design.md).
- **Herdr Sessions:** before changing Herdr Session discovery, startup, selection, connection, bootstrap, reconnect, status, commands, or Sessions View behavior, read [`sessions.md`](sessions.md).
- **Verification:** before changing tests, import enforcement, ESLint architecture rules, or the validation baseline, read [`verification.md`](verification.md).

## Top-level architecture

The extension has four top-level owners:

```text
src/
  capabilities/
  features/
  infrastructure/
  extension/
```

The dependency direction is:

```text
features ───────> capabilities
infrastructure ─> capabilities
extension ──────> capabilities
extension ──────> features
extension ──────> infrastructure
```

`capabilities/` depends only on other capability modules and standard language types. Feature and infrastructure implementations do not enter `capabilities/`.

`features/` and `infrastructure/` do not import each other's implementations. The composition owner supplies concrete infrastructure to features through capability interfaces.

`extension/` is the top-level composition root. It creates top-level infrastructure and features, controls initialization, and disposes what it creates. It contains composition policy, not product behavior.

## Modules and ownership

A **module** is a directory with one owner, one coherent responsibility, and a deliberate public surface. A module can own child modules. Apply the same ownership rules recursively:

```text
extension
└── feature
    └── child module
        └── owned implementation
```

Place a module under its only owner. If module `B` exists only to implement feature `A`, use:

```text
features/
  a/
    b/
```

not:

```text
features/
  a/
  b/
```

A parent module is the local composition root for its children. It may import their concrete classes, construct them, inject their dependencies, initialize them, and dispose them. Sibling children depend on capability interfaces, not on each other's implementations.

Move a child upward only when ownership changes. A second independent owner is evidence to promote the child to their nearest common owner. If the second owner later disappears, move the implementation back to its remaining owner.

## Capabilities

A **capability** is a typed contract or data shape that crosses a module boundary. Capability names describe what a consumer needs, not how a provider implements it.

Top-level capabilities cross top-level boundaries:

```text
capabilities/
  sessions/
  runtime/
```

A parent module can own local capabilities used only by its children:

```text
features/
  sessions/
    capabilities/
    catalog/
    active-session/
```

Keep a capability at the nearest owner that contains every consumer and provider. An interface used only inside one implementation module remains inside that module.

A capability module may contain:

- interfaces implemented across a module boundary;
- readonly data consumed across a module boundary;
- observable result and error types;
- lifecycle contracts required across the boundary;
- domain identifiers and states used by both sides.

A capability module does not contain:

- concrete implementations;
- feature orchestration;
- protocol DTOs;
- CLI arguments;
- Node or VS Code objects;
- interfaces used only inside one implementation module.

Herdr vocabulary is valid in a capability because Herdr is the domain. Concrete mechanisms stay behind the capability. For example, a feature may consume `HerdrSessionConnectionFactory`; its infrastructure provider may be named `JsonSocketHerdrSessionConnectionFactory`. The capability does not expose `net.Socket`, JSON envelopes, request framing, or Node error codes.

## Features

A **feature** owns user-visible behavior or a coherent application workflow. Feature code contains smart services, controllers, handlers, local state, and orchestration. It depends on capabilities and receives concrete providers through dependency injection.

A top-level feature can own smaller feature modules. Sibling feature modules do not import each other's implementations. They communicate through capabilities owned by their nearest common parent.

A parent feature composes its children. Child features do not use a global event bus, service locator, or mutable registry to find each other. Use direct typed capabilities, queries, operations, and subscriptions.

Create a child module when it has a coherent responsibility, state owner, lifecycle, or independent consumer. Do not create empty directories to predict future structure.

## Infrastructure

`infrastructure/` contains concrete mechanisms for external systems and runtime facilities. Organize it first by the external owner or mechanism, then by a coherent responsibility:

```text
infrastructure/
  herdr/
  vscode/
  system/
```

Infrastructure classes implement top-level capabilities. Protocol DTOs remain inside Herdr infrastructure and are converted to capability data before delivery to a feature. VS Code types remain inside VS Code infrastructure and are constructed from feature presentation data by the concrete view implementation.

Keep low-level contracts local when no feature consumes them. For example, a `SocketFactory` used only by Herdr socket infrastructure stays under that infrastructure owner. Promote it only when another independent owner requires the same capability.

Infrastructure follows the same ownership tree as features. Sibling infrastructure implementations communicate through local capabilities and are composed by their nearest common owner.

## Extension composition

`extension/` owns the top-level runtime graph:

```text
extension/
  activate.ts
  HerdrExtension.ts
```

`activate.ts` creates `HerdrExtension`, registers it for disposal, and initializes it. `HerdrExtension` explicitly creates top-level infrastructure and features.

The top-level graph remains readable. A parent feature may own the construction of its children, but its local graph remains explicit in one discoverable composition class. See [`object-design.md`](object-design.md) for injection and lifecycle rules.

## Sibling isolation

Sibling implementations stay isolated. Given:

```text
features/
  sessions/
    catalog/
    active-session/
    capabilities/
```

`active-session/` does not import the implementation in `catalog/`. Both depend on contracts in their parent's `capabilities/`. Their parent composition owner imports the concrete children and connects them.

The same rule applies to top-level features and to infrastructure siblings. If one sibling exists only for another, nest it under that owner instead of maintaining an artificial sibling relationship.

## Public surfaces and visibility

The project uses three visibility levels:

1. **Private implementation** — files used only inside one module and not exported from its `index.ts`.
2. **Parent-local public surface** — a child module's `index.ts`, available to its parent composition and permitted local consumers.
3. **Repository public surface** — exports re-exported by a top-level feature, capability, or infrastructure module for outside consumers.

A local export does not automatically become a repository export. Parent modules re-export only the surface required outside their ownership tree.

Cross-module imports use the target module's public entry point. Files inside one module may import each other directly.

Do not create `internal/` directories. Ownership and exports define visibility. Create subdirectories for semantic responsibilities, not for a generic public/private split.

## Shared implementation

`shared/` is an optional visibility scope inside an existing owner. It is not an owner and is not a default directory.

Create `<owner>/shared/` only when one concrete implementation has at least two current sibling consumers under that owner. Give each shared concept a semantic name:

```text
features/
  sessions/
    shared/
      state-events/
      retry-scheduling/
```

Place capability contracts in the nearest `capabilities/`, not in `shared/`. Keep feature-specific shared behavior with the feature; sharing alone does not make code infrastructure.

When a shared implementation loses all but one consumer, move it to the remaining owner in the same change. When consumers acquire different requirements, duplicate a small implementation locally or extract a new coherent capability instead of retaining accidental coupling.

At the repository root, classify a shared concept by responsibility instead of creating a generic root `shared/`:

- a cross-boundary contract belongs in top-level `capabilities/`;
- a user workflow belongs to the nearest common feature owner;
- an external or runtime mechanism belongs in `infrastructure/`;
- an independently owned user capability becomes a top-level feature.

## Placement procedure

Before adding or moving code, answer these questions in order:

1. **Behavior or mechanism?** User behavior and application state belong to a feature. External-system and runtime mechanisms belong to infrastructure.
2. **Who owns it?** Place it under its only owner. A parent owns the lifecycle and composition of its children.
3. **Who consumes it?** Keep one-consumer implementation local. Put proven sibling implementation under their nearest common owner.
4. **Does a boundary need a contract?** Put a cross-boundary interface or data shape in the nearest `capabilities/` scope.
5. **Is it independent?** Promote a child only when it gains an independent owner, lifecycle, or user responsibility.
6. **What is public?** Export only the surface required by the parent or outside consumer.
7. **Who creates and disposes it?** The nearest composition owner constructs it, injects its dependencies, initializes it, and disposes it.

If these answers do not produce one clear location, stop and raise the ownership ambiguity before implementing. Do not resolve ambiguity by creating `core`, `common`, `utils`, `helpers`, a global event bus, or a service locator.

## Changing the architecture

Treat a required forbidden edge as ownership feedback. Resolve it in this order:

1. nest a single-consumer module under its owner;
2. inject a capability instead of importing a sibling implementation;
3. move a shared contract to the nearest common `capabilities/` scope;
4. move proven shared implementation to the nearest common owner's named `shared/` scope;
5. raise cross-owner composition to their nearest common composition owner;
6. promote the concept to an independently owned feature or infrastructure module when its responsibility and lifecycle justify it.

If the accepted graph still cannot express the requirement, make an explicit architecture decision. Update this document and the automated guardrails together before relying on the new edge.
