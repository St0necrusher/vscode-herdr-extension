# Code architecture

Status: canonical.

Read this document before planning, implementing, reviewing, or moving source or test code. It is the single architecture authority for the repository. Use the domain language in [`CONTEXT.md`](../../CONTEXT.md).

## Place every change

For every added or moved responsibility, answer these questions in order:

1. **Feature or mechanism?** User behavior, application state, and feature-specific presentation belong to a feature. External-system integration and shared runtime facilities belong to infrastructure.
2. **Owner?** Place the responsibility under the feature or mechanism that owns its behavior and lifecycle. Domain containment does not imply feature ownership.
3. **Role?** Mutable feature state belongs to an explicit model or store. Host rendering and input belong to a View. A coherent nested user workflow with its own lifecycle may be a child feature. Other roles use names that describe their actual responsibility.
4. **Boundary?** When another owner consumes the responsibility, identify the provider-owned facts and operations it needs and the policy it derives locally. Expose only those facts and operations through a narrow capability; keep single-owner details private.
5. **Composition?** The nearest common owner constructs collaborators, injects capabilities, initializes them, and disposes them.
6. **Visibility?** Export only what a production consumer needs. Tests may import their implementation under test directly.

The placement is resolved only when one owner and one dependency direction are clear. Surface an ambiguity before editing instead of creating a generic `core`, `common`, `utils`, `helpers`, event bus, registry, or service locator.

## Feature shape

A feature owns one coherent user capability or workflow. Organize it by semantic ownership, then by technical role:

```text
feature/
  Feature.ts       composition and lifecycle
  Model.ts         one authoritative state owner, when needed
  models/          several distinct models, when needed
  stores/          distinct state stores, when that vocabulary fits
  capabilities/    contracts crossing owned boundaries
  view/            host presentation and input
  child-feature/   coherent nested user capability, when needed
    ChildFeature.ts
    view/
```

This is an illustrative vocabulary, not a fixed layer list or mandatory directory template. Start with direct files. Introduce a semantic subgroup such as `models/`, `stores/`, or another responsibility when the feature has multiple related concepts that are clearer as a named group. Apply the same rule recursively inside child features. Create only structure required by current behavior.

### State owners

A model or store is the authoritative owner of a coherent part of a feature's mutable application state and transitions. A feature may have several when they own genuinely distinct state or lifecycles; place peer owners under a semantic plural directory when that makes the ownership graph clearer.

Define each variant of a non-trivial state-machine discriminated union as a named type. Define the aggregate union by composing those variant names rather than inlining every record. Apply this to new and changed state-machine code; do not rewrite unrelated stable unions only for style.

A coordinated state machine has one authoritative owner of its aggregate state and transitions, even when the state has named slices. That owner may provide several narrow capability interfaces or readonly projections; these are views of the same authority, not independent state machines. Publish related facts consistently so consumers do not reconstruct authority across peer services.

Split a state owner only for independently owned invariants, responsibility, or lifecycle. A new consumer is a reason to reconsider the public capability surface, not by itself to split state ownership. File size alone is not a boundary. Derived state is computed rather than copied into another mutable store.

Expose current readonly state and disposable typed subscriptions. Apply a complete transition before publication. Subscription failure and disposal rules are defined under Lifecycle.

### View

A View is the host-specific presentation and input adapter of its containing feature. It owns rendering, copy, icons, accessibility, host registrations, input handling, and transient host resources. It reads feature state and sends user intent through feature operations; it does not own a second copy of domain state.

Feature Views live in the nearest semantic `view/` directory. A broad feature-level `vscode/` bucket is not an ownership boundary. Views use `vscode` for presentation and input, while Feature lifecycle owners register and dispose commands. Feature models and capabilities remain host-neutral by ownership rule; this semantic distinction is reviewed in architecture and code review rather than enforced through path-based `vscode` import lint restrictions.

A View is not a child feature merely because it has host resources. A child feature has a coherent user workflow or lifecycle of its own and may own its own View. Controllers and view models are optional: introduce one only when it owns substantive workflow, policy, or transformation.

Commands are part of the feature that owns the user intent. The owning Feature registers and disposes them, invokes its model or other capabilities directly, and calls a View method only when the command requires presentation behavior. Views own their host registrations except commands. Registration cleanup follows the Lifecycle rules. The extension manifest remains the global command inventory.

### Child features

Feature ownership is recursive. A parent feature composes its children. Sibling child implementations communicate through capabilities owned by their nearest common parent, not through direct implementation imports.

Promote a child only when it gains an independent owner, user responsibility, or lifecycle. A second independent consumer is evidence to move a contract or implementation to their nearest common owner; future consumers are not.

## Capabilities and interfaces

A capability is a typed boundary between owners. Consumer needs determine its minimum surface; semantic ownership determines its meaning and name. Name the domain facts or operations provided, such as `HerdrSessionDirectory`, `ActiveSessionProjectionSource`, or `SessionsOperations`, rather than the consuming feature or a generic architectural role.

Place a capability at the nearest owner containing every current consumer and provider:

- repository-level boundaries in `src/capabilities/`;
- boundaries between parts of one feature in that feature's `capabilities/`;
- one-module interfaces beside their implementation.

Create an interface for a real cross-owner boundary, a narrower consumer role, an external or nondeterministic dependency, a dynamic resource factory, or multiple current providers. A concrete class does not need a matching interface for naming symmetry or test convenience.

Capability data uses domain vocabulary and readonly values. Node objects, VS Code objects, CLI responses, protocol DTOs, and ready-to-render presentation stay with their mechanisms or Views and are converted before crossing the boundary.

### Semantic ownership at boundaries

The provider owns the truth and validity of the facts it publishes, including their availability and freshness. It may derive a narrow public projection from its internal state machine so consumers do not have to interpret implementation-specific transitions. Preserve the identity, validity, and consistency information required to use that projection correctly; narrow does not mean a bare domain record with its authority stripped away.

The consumer owns what those facts mean for its workflow: local selection, filtering, grouping, and presentation policy. Derive that state within the consuming feature. For example, Sessions provides active Session identity, snapshot, and freshness; Navigation decides which Space is selected and how its Panes are grouped. Sessions does not publish Navigation context, and Navigation does not reconstruct Session freshness from connection internals.

Public-contract adaptation is a derivation, not a new state owner. Keep it with the provider's responsibility without introducing a second mutable store. Composition wires capabilities; it does not decide either feature's product policy. Choose the concrete file or helper by responsibility and complexity, not by a mandatory adapter layer. Moving a function or renaming a type alone does not repair misplaced policy.

A consumer-specific narrow interface is valid when it describes a real role the provider fulfills without making the provider implement the consumer's workflow. Provider-neutral semantics do not require a universal API or speculative support for future consumers.

Before accepting a cross-owner contract, answer:

- Who owns the truth of each exposed fact and the invariant of each operation?
- Which decisions remain local to the consumer, and can they change without changing the provider's contract when its facts and operations stay the same?
- Can the consumer use the contract correctly without understanding the provider's internal state machine, and are related facts published consistently?

Use these answers to evaluate semantic coupling in addition to import direction and type placement. If ownership is unclear, resolve it before choosing interface names or implementing the boundary.

### Capability implementation and composition

An interface defines a responsibility boundary, not a requirement for a separate runtime object. Choose its implementation in this order:

1. Identify the existing object that owns the provided responsibility and lifecycle at the public boundary.
2. If that ownership and lifecycle fit, have that object implement the capability directly. The common composition owner passes the object itself; the consumer's dependency is typed only as the capability interface, not the concrete implementation.
3. Introduce a separate provider or adapter only for a concrete additional responsibility or boundary, such as external-protocol adaptation, an independent lifecycle, or runtime access restriction. State that reason when choosing the boundary.

Direct implementation is the default for features, models, and infrastructure alike. A public property containing forwarding functions or a wrapper that only republishes the owner's methods is not a reason to create another object. Type-level narrowing alone needs no runtime wrapper; it does not enforce runtime access restrictions.

Distinguish the owner of a module's public boundary and lifecycle from its internal state owners. At an external boundary, the module's public object represents its capabilities; an internal model does not become public merely because it can implement the interface. Within the module, that model may directly provide capabilities to its local consumers.

Keep internal collaborators private across the external boundary. The public object may delegate to them and derive its public contract without taking over their mutable state. Consumer-specific policy remains with the consumer as described above.

## Dependency injection and objects

Use explicit constructor injection. The nearest composition owner selects concrete providers. Dynamic resources such as Session connections are created through injected factories. Host-specific classes may use narrow structural host dependencies; host neutrality and wrapper interfaces are not goals by themselves.

Manual composition is the default. A DI container requires a separate accepted architecture decision demonstrating a concrete scope or graph problem. Objects never resolve a container themselves.

Use classes for long-lived identity, mutable state, resource ownership, or lifecycle. Use readonly objects and discriminated unions for state, snapshots, commands, events, and errors. Use standalone functions for coherent stateless transformations. Keep small transformations private until they become independently meaningful.

One object owns each mutable state and live resource. A rich domain object owns real invariants or lifecycle; it does not merely forward an identifier to a service. TypeScript class-private members use `private`, not JavaScript `#` fields.

## Lifecycle

The nearest composition owner initializes children in dependency order and disposes them in reverse order. Register ownership before asynchronous initialization so partial failure can release every acquired resource.

Disposal is idempotent. It cancels owned timers and subscriptions, closes owned client resources, invalidates in-flight work, and prevents late publication. Disposing an extension-owned client never stops server-owned Herdr resources unless an explicit user operation requests it.

Support repeated, concurrent, or reentrant initialization only for a current caller or contract. Keep constructors lightweight: create owned objects, attach non-throwing internal listeners, and register synchronous host resources. Use explicit initialization for actual asynchronous startup or when a current lifecycle contract requires it, not to build a defensive state machine around programming errors. Successfully constructed owners retain and normally dispose their resources. Add partial-acquisition cleanup only for a concrete realistic failure path that can leave externally meaningful resources behind, not hypothetical constructor throws. Duplicate command/View identifiers and similar programming or manifest errors fail activation loudly rather than triggering local rollback scaffolding.

Feature-internal subscriber callbacks are non-throwing contracts. Let programming defects fail loudly; require callback isolation only at a concrete fallible boundary whose contract says delivery must continue. Asynchronous work rejects stale completions after replacement or disposal.

Use `async`/`await` for Promise-returning production flow. Preserve ordering, cancellation, and cleanup at asynchronous boundaries.

## Placement and dependencies

### Top-level graph

```text
src/
  capabilities/    cross-feature and feature–infrastructure contracts
  features/        user capabilities and workflows
  infrastructure/  external systems and shared runtime mechanisms
  extension/       top-level composition
```

The graph below describes dependencies between top-level categories, plus contract-to-contract dependencies. It does not enumerate imports within an implementation module; those follow ownership, child composition, and public-entry rules.

```text
capabilities   -> capabilities
features       -> capabilities
infrastructure -> capabilities
extension      -> capabilities + features + infrastructure
```

Features and infrastructure do not import each other's implementations. Top-level features do not import sibling implementations. Their nearest common composition owner connects them through capabilities.

### Infrastructure

Organize infrastructure by the external owner or mechanism, then by coherent responsibility:

```text
infrastructure/
  herdr/
  vscode/
  system/
```

Protocol and mechanism details remain inside infrastructure and become capability data at its boundary. Low-level contracts stay local until another independent owner consumes them. Shared VS Code logging or configuration may remain infrastructure; feature-specific presentation belongs to its feature's View.

### Imports and public surfaces

Production imports crossing a top-level module use its public `index.ts` through the `@capabilities`, `@features`, or `@infrastructure` aliases. Imports inside one module are relative, omit runtime extensions, and use directory resolution for public `index.ts` entries. The aliases are resolved consistently by TypeScript, esbuild, and Vitest; the bundled extension is the runtime entry point. A parent may import the public entry of a child it owns.

There are three visibility levels:

1. a private implementation file;
2. a child entry visible to its parent and permitted local consumers;
3. a top-level repository entry exported for outside consumers.

A child export does not imply a repository export. Add production exports for production consumers, never solely for tests. Do not create generic `internal/` directories; ownership and exports define visibility.

`shared/` is a placement under an existing owner, not an owner itself. Create a semantically named shared implementation only for at least two current sibling consumers. Move it back when one remains. Root-level shared contracts, workflows, and mechanisms belong to capabilities, a feature, or infrastructure respectively.

## Current responsibility map

This map applies the general rules to the implemented modules; it is not a template requiring every future feature to have the same shape.

- **Extension:** `HerdrExtension` composes top-level infrastructure and features and owns their lifecycle. Product policy remains in features.
- **Sessions:** owns discovery, explicit startup, local Session selection and persistence, the active navigation connection, projection authority, reconnect policy, the Sessions View, and connection status. `SessionsModel` owns one `SessionsState` with catalog and active slices and routes retry operations. Its child Status feature derives status from that state. `SessionsFeature` directly provides `ActiveSessionProjectionSource` over its private model.
- **Navigation:** consumes the active Session projection. `NavigationContextModel` owns local selected-Space state and reconciles it with the snapshot. Sibling Spaces and Panes child features derive their semantic states from the shared context and own their Views. Navigation does not own the Session connection or mutate its projection.
- **Herdr infrastructure:** owns CLI execution, socket transport, request correlation, protocol decoding, and normalization. A logical connection owns bootstrap/reconciliation sequencing and all physical transports it creates. Sessions depends on that logical contract, not socket topology.

Selected-Session persistence uses one minimal injected key-value capability; Sessions owns its key and ordering semantics, without Store/Storage adapter chains.

Future terminal surfaces, Agents, and notifications remain separate workflows rather than becoming Sessions responsibilities merely because they consume its snapshot. Terminal surfaces have a lifecycle independent of navigation Session selection.

Historical issue #11 behavior and migration rationale remain in [`feature-oriented-architecture-simplification.md`](../design/feature-oriented-architecture-simplification.md); issue #13 decisions are in [`issue-13-spaces-panes-navigation/architecture.md`](../design/issue-13-spaces-panes-navigation/architecture.md). This document, not historical target file inventories, is the architecture authority for later changes.

## Tests and guardrails

Test observable behavior at the narrowest practical level. Colocated tests may import the implementation under test directly. Integration tests may cross implementation entries deliberately. Tests do not justify production exports, forwarding facades, adapter chains, or assertions about private fields and incidental wiring.

Keep fast feature and infrastructure tests beside their owner. Put controlled external-boundary tests under `test/integration/` and a small critical VS Code suite under `test/extension/`. Host-neutral models and policy remain loadable without importing or globally mocking `vscode`.

ESLint is the executable architecture checker for the top-level graph, public entries, sibling isolation, cycles, and production-to-test isolation. Its rules express categories, not lists of current modules. It does not enforce semantic ownership through path-based restrictions on importing `vscode`; that placement remains a canonical architecture and review concern. Test import exceptions do not weaken the enforced production boundaries.

Repository scripts are the executable source of truth for validation commands. Run the checks affected by the change and record any environment-blocked check.

## Completion criteria

An architecture-affecting change is complete when:

- every changed responsibility has one semantic owner;
- every mutable state and live resource has one lifecycle owner;
- dependency direction and capability placement match the ownership graph, and cross-owner contracts pass the semantic-ownership questions above;
- Views render state and emit intent without copying domain authority;
- public surfaces contain only current production needs, and capability implementations follow the direct-owner default or have a concrete reason for a separate provider;
- tests cover stable behavior rather than the discarded composition shape;
- generic ESLint rules accept representative valid imports and reject representative forbidden imports; and
- code, documentation, guardrails, and affected validation agree.
