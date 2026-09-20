# Accepted direction: simplify the feature architecture around explicit models, views, and semantic ownership

Status: **accepted direction and migration input; canonical rules are in `docs/architecture/code-architecture.md`**
Date: 2026-09-19
Applies to: the current uncommitted issue #11 implementation and the planned MVP work in issues #12–#21

> **Approved amendments (2026-09-19):** commands are owned, registered, and disposed by the owning Feature. A command may call a View method when presentation is required, but Views do not own command registration. ESLint does not restrict `vscode` imports by path; semantic host ownership is enforced through architecture and review. These decisions supersede the command-registration details in D6 and the path-based `vscode` lint requirements below; the canonical architecture contains the current rules.

## 1. Purpose of this document

This document records an architecture direction reached while reviewing the completed issue #11 implementation. It explains:

- what was difficult to understand in the current structure;
- which alternatives were considered;
- the architecture direction selected in the discussion;
- the terminology and ownership rules behind that direction;
- the expected top-level feature boundaries for the remaining MVP;
- a complete target file layout for the code that exists today;
- how each current production file maps to the proposed structure;
- which runtime and lifecycle behaviors must remain unchanged;
- which canonical architecture rules and guardrails need to change; and
- a staged migration path from the current working tree.

This document preserves the analysis, rejected alternatives, concrete target, and migration detail behind the accepted direction. The shorter [`code-architecture.md`](../architecture/code-architecture.md) is the sole canonical rule set. This document does not by itself authorize a source migration; source, tests, and lint guardrails must move coherently against the canonical architecture.

## 2. Executive summary

The accepted direction is:

1. Keep manual dependency injection and explicit composition.
2. Replace the separately observable Session catalog and active-Session services with one `SessionsModel` that owns one coherent `SessionsState` and the feature's operations.
3. Keep external mechanisms behind concrete capabilities: configuration, Session directory, Session connection factory, persistence, and logging.
4. Treat `view/` as a technical child of the feature that owns the displayed state. A View is not promoted into an independent feature merely because it owns VS Code resources.
5. Treat user-visible responsibilities with their own workflow and lifecycle, such as connection status, as child features. Features may therefore be recursively or “fractally” structured.
6. Do not introduce a mutable store for a child feature when its model is derivable from parent state. Status is currently a projection of `SessionsState`, not another state owner.
7. Do not require a controller layer. Put policy with the feature/model that owns it and presentation with the relevant View.
8. Remove the feature-wide `vscode/` mechanism bucket. Organize feature code by semantic ownership, while concrete filenames and imports still make the host mechanism explicit.
9. Simplify selected-Session persistence to one minimal injected key-value capability backed directly by VS Code `workspaceState`; remove the current `Store → Storage → adapter` chain.
10. Do not add a DI container. Constructor injection already provides isolation, and the current graph does not demonstrate a scope or wiring problem that a container would solve.
11. Do not nest every future Herdr concept under the Sessions feature. Domain containment in a Session snapshot is not feature ownership.
12. Expect separate top-level features for Sessions, navigation, terminal surfaces, Agents, and notifications as the MVP grows.

The intended primary flow becomes:

```text
external mechanisms
        ↓
  SessionsModel
        ↓
  SessionsState
        ↓
Views and child features
        ↓ user intent
 SessionsOperations
        ↓
  SessionsModel
```

## 3. Why revisit the current structure

The issue #11 implementation is behaviorally substantial and intentionally follows the current accepted architecture. The concern is not that its main runtime behaviors are incorrect. The concern is that understanding those behaviors requires reconstructing a distributed object graph from several technical modules.

The current Sessions feature contains:

```text
SessionsFeature
├── HerdrSessionsService
├── ActiveHerdrSessionService
├── HerdrStatusController
├── VsCodeHerdrStatusView
├── VsCodeHerdrSessionsView
├── VsCodeHerdrCommands
└── VsCodeHerdrSessionSelectionStore
```

Its observable and operational relationships include:

```text
ActiveHerdrSessionService
├── observes catalog state
├── invokes catalog operations
├── invokes the Session directory
├── creates Session connections
└── persists selection

HerdrStatusController
├── observes catalog state
├── observes active state
├── routes retry between catalog and active operations
└── renders through a separate status View

VsCodeHerdrSessionsView
├── observes catalog state
└── observes active state

VsCodeHerdrCommands
├── invokes catalog operations
├── invokes active operations
├── invokes status operations
└── invokes configuration actions
```

This graph is acyclic, but it is cognitively expensive. Several facts are not obvious from the filesystem:

- which object is the single feature entry;
- which state a View should treat as authoritative;
- why status needs both a controller and a View;
- why selected-Session persistence has both `Store` and `Storage` contracts;
- which command belongs to which user-facing responsibility;
- whether `vscode/` is one module or a bucket for unrelated host behavior; and
- whether future Spaces, Panes, terminal surfaces, Agents, layouts, and notifications should all be nested under Sessions.

The target should make the normal reading order match the runtime behavior:

```text
feature composition
→ feature model
→ feature state and operations
→ feature View or child feature
→ external capability
```

## 4. Goals

### 4.1 Primary goals

- Make the filesystem communicate product ownership and runtime flow.
- Give Sessions one obvious state owner and operation surface.
- Make state authority obvious to Views and child features.
- Reduce pass-through objects and layers whose primary purpose is wiring.
- Keep external mechanisms and protocol details out of feature state.
- Preserve deterministic tests of races, lifecycle, cancellation, and persistence ordering.
- Preserve explicit construction and disposal ownership.
- Provide a structure that can grow into the accepted MVP without turning Sessions into the owner of the entire product.

### 4.2 Secondary goals

- Reduce ambiguous names such as `Store`, `Storage`, `Controller`, and broad `vscode/` buckets.
- Make command ownership follow the user-facing responsibility that exposes the command.
- Split currently large capability and protocol files along responsibilities that already exist.
- Keep future promotion and extraction evidence-driven rather than speculative.

## 5. Non-goals

This direction does not change the product behavior accepted for issues #9–#11. In particular, it does not:

- change Herdr's ownership of Sessions, Spaces, Herdr Tabs, Panes, processes, or Agents;
- change Session selection precedence;
- auto-start a stopped Session;
- add reconnect, stale-state retention, jitter, or backoff before issue #12;
- add Spaces, Panes, Agents, terminal, layout, or notification UI before their tickets;
- replace the public JSON Socket or supported CLI boundaries;
- change socket bootstrap ordering or reconciliation semantics;
- introduce a DI container, event bus, state-management framework, or service locator;
- introduce a generic repository layer;
- create empty future feature directories;
- make a View an independent product feature merely because it owns host resources; or
- treat every GitHub ticket as exactly one source module.

## 6. Terminology and architectural vocabulary

### 6.1 Feature

A **feature** owns a coherent user-visible capability or workflow. It may own:

- a model or state owner;
- operations;
- a lifecycle;
- one or more Views;
- child features; and
- feature-specific host resources.

Feature ownership is recursive. A child feature is justified by its own coherent workflow or lifecycle, not by a desire to reproduce a universal layer template.

### 6.2 Model

A **model** is the authoritative feature-level owner of mutable application state and state transitions. In this direction, `SessionsModel` owns `SessionsState` and all Session-feature operations.

`Model` is preferred over `Store` here because the object does more than retain values: it coordinates discovery, selection, persistence, connection lifecycle, projection installation, retries, and disposal.

### 6.3 View

A **View** is a technical presentation and input adapter owned by its containing feature.

For example:

```text
features/sessions/view/
```

means “the View of the Sessions feature.” It does not mean that the View is a child feature.

Likewise:

```text
features/sessions/status/view/
```

means “the View of the Status child feature owned by Sessions.”

A View may own local host state such as:

- VS Code registrations and disposables;
- a TreeDataProvider event emitter;
- an open Quick Pick interaction;
- a feedback-loop guard; or
- transient rendering resources.

A View does not own or copy authoritative domain state such as the selected Session, connection authority, snapshot, selected Space, or Agent status.

The normal flow is:

```text
feature state → View rendering
user input → feature operation
```

### 6.4 Child feature

A **child feature** is a recursively owned user capability with meaningful behavior or lifecycle of its own.

Status qualifies as a child feature because it owns a user-visible status workflow, action availability, interaction, and lifecycle. The Sessions Tree View does not qualify merely because it is a VS Code View; it is the presentation of the parent Sessions feature.

### 6.5 Capability

A **capability** is a narrow typed boundary between owners. It describes what a consumer needs, not a generic architectural role.

Prefer names such as:

- `HerdrSessionDirectory`;
- `HerdrSessionConnectionFactory`;
- `SessionsStateSource`;
- `SessionsOperations`; and
- `PersistentKeyValueStorage`.

Avoid explaining the architecture through generic “ports” terminology when the concrete capability name communicates more.

### 6.6 Host-specific and host-neutral

Host-neutrality is not a universal goal and does not justify arbitrary wrappers.

A responsibility should be host-neutral when its actual behavior is independent of VS Code and benefits from being expressed in domain/application terms. A responsibility should be VS Code-specific when its purpose is to render through, register with, or react to VS Code.

Test isolation comes primarily from dependency injection, not from banning host types. A host-specific class can still be tested with an injected structural dependency. Conversely, a host-neutral interface that only mirrors another API can still be unnecessary ceremony.

### 6.7 Dependency injection

Manual constructor injection remains the default:

```ts
new SessionsModel(configuration, directory, connectionFactory, storage, logger);
```

The repository already uses dependency injection. A container would automate lookup and construction but would not remove conceptual dependencies. No current requirement justifies token registration, container scopes, runtime lookup errors, or hidden lifecycle ownership.

## 7. Core decisions

### D1. Sessions has one observable model

Replace the separately observable `HerdrSessionsService` and `ActiveHerdrSessionService` with one `SessionsModel`.

The current split represents real internal concerns, but exposing both as peer state owners makes every consumer reconstruct the feature state. Selection and active connection also react directly to the catalog, so the two state machines are already coordinated.

The proposed model owns one state containing two explicit slices:

```ts
export type SessionsState = Readonly<{
  configuration: HerdrConfiguration;
  catalog: SessionsCatalogState;
  active: ActiveSessionState;
}>;
```

This preserves the conceptual distinction without requiring consumers to subscribe to two sources.

The model exposes one subscription surface and one operation surface:

```ts
export interface SessionsStateSource {
  getState(): SessionsState;
  onDidChange(listener: (state: SessionsState) => void): Disposable;
}

export interface SessionsOperations {
  refresh(): Promise<void>;
  selectSession(sessionId: HerdrSessionId): Promise<void>;
  startSelectedSession(): Promise<void>;
  retryConnection(): Promise<void>;
}
```

The exact retry name may become `retry()` once the combined state makes routing unambiguous. What matters is that presentation no longer chooses between catalog retry and connection retry.

### D2. SessionsFeature remains the composition and lifecycle owner

`SessionsFeature` constructs and owns:

```text
SessionsFeature
├── SessionsModel
├── Sessions View
└── Status child feature
```

It initializes them in dependency order and disposes them in reverse order. It contains no Session transition policy.

### D3. `view/` is a technical child of its containing feature

Replace the broad feature-level `vscode/` bucket with semantically scoped `view/` children.

For Sessions:

```text
features/sessions/view/VsCodeSessionsView.ts
```

For Status:

```text
features/sessions/status/view/VsCodeStatusView.ts
```

The containing path provides the semantic noun. `view/` only states the technical role.

### D4. Status is a child feature, but it does not currently own a store

Status owns a coherent user-facing workflow:

- derive connection status and available actions;
- render the Status Bar item;
- expose diagnostics and recovery actions; and
- own the related host lifecycle.

Status state is currently derived completely from `SessionsState`:

```text
SessionsState
    ↓ statusModel()
StatusModel
    ↓
Status View
```

Therefore Status does not get an additional mutable store. Add one only if Status later owns non-derivable state such as suppressed warnings, pending interaction state with product meaning, or independent notification history.

### D5. No mandatory controller layer

Do not retain `HerdrStatusController` merely to satisfy a Controller/View pattern.

Its current responsibilities move as follows:

| Current responsibility | Proposed owner |
| --- | --- |
| Combine catalog and active state | `SessionsModel` exposes one state |
| Route retry to catalog or active service | `SessionsModel` operation |
| Derive status model/actions | pure `statusModel()` in Status feature |
| Own status workflow and subscription | `StatusFeature` |
| Create VS Code item and Quick Pick | `VsCodeStatusView` |

A class named `Controller` remains valid if a future workflow genuinely has that responsibility. It is not a required layer.

### D6. Command ownership follows the user-facing responsibility

Do not keep a central command router merely because all commands use VS Code.

Expected ownership:

- Sessions View owns selection and refresh interactions;
- Status owns status actions, retry, Start Herdr, settings, and diagnostics interactions; and
- cross-feature commands, if any, are registered by their nearest common feature owner.

Registration can be a function returning a `Disposable` when no long-lived command object state exists. A class is appropriate only when it owns meaningful lifecycle beyond the returned registrations.

### D7. Selected-Session persistence uses one minimal storage capability

Remove the current chain:

```text
HerdrSessionSelectionStorage
→ VsCodeHerdrSessionSelectionStore
→ HerdrSessionSelectionStore
→ ActiveHerdrSessionService
```

Use one minimal injected key-value capability:

```ts
export interface PersistentKeyValueStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}
```

VS Code `ExtensionContext.workspaceState` structurally implements this capability and can be injected directly.

`SessionsModel` owns the feature key:

```ts
const selectedSessionKey = "herdr.selectedSession";
```

It also continues to own selection precedence, persistence ordering, failure logging, and stale-generation rejection.

Initially keep `PersistentKeyValueStorage` in the nearest Sessions-owned capability scope. When another independent feature, such as Navigation, needs the same mechanism for accepted behavior, promote it to the nearest common runtime capability owner in that later change. Do not create a generic top-level storage abstraction solely because future sharing is imaginable.

### D8. Manual dependency injection remains

Do not introduce a DI container during this migration.

Reconsider a container only if the application later demonstrates a concrete problem involving scopes, graph size, conditional providers, or lifecycle construction that explicit composition cannot express clearly.

If a container is ever introduced, classes must still declare constructor dependencies and must never resolve the container themselves.

### D9. Domain containment is not feature ownership

A Herdr Session contains Spaces, Herdr Tabs, Panes, layouts, and Agents in the domain snapshot:

```text
Session
└── Spaces
    └── Herdr Tabs
        └── Panes
            └── Agents
```

This does not imply this source tree:

```text
features/sessions/spaces/tabs/panes/agents/
```

Feature boundaries follow user workflow, state ownership, and lifecycle. Sessions owns connection and projection authority. Other features consume that projection through capabilities.

### D10. External mechanisms remain separate infrastructure

The simplification stops at real external/mechanism boundaries:

```text
SessionsModel
├── HerdrConfigurationSource
├── HerdrSessionDirectory
├── HerdrSessionConnectionFactory
├── PersistentKeyValueStorage
└── HerdrLogger
```

The model does not parse CLI JSON, frame NDJSON, open Unix sockets, decode protocol records, or call VS Code presentation APIs.

### D11. Large mechanism files split only along existing responsibilities

The current socket implementation already contains three named responsibilities:

- logical Session bootstrap and reconciliation;
- one physical JSON socket client; and
- protocol decoding/subscription construction.

These may be split into semantic files during or after the main feature migration. The split is structural and must not change protocol behavior.

## 8. Proposed Sessions state and operations

The exact TypeScript spelling can be refined during implementation, but the ownership must remain clear.

```ts
export type SessionsCatalogState =
  | Readonly<{ kind: "checking" }>
  | Readonly<{ kind: "missing-executable" }>
  | Readonly<{
      kind: "ready";
      sessions: readonly HerdrSessionDescriptor[];
    }>
  | Readonly<{
      kind: "error";
      diagnostic: string;
      sessions?: readonly HerdrSessionDescriptor[];
    }>;

export type ActiveSessionState =
  | Readonly<{ kind: "unselected" }>
  | Readonly<{
      kind: "selected-stopped";
      session: HerdrSessionDescriptor;
    }>
  | Readonly<{
      kind: "resolving";
      session: HerdrSessionDescriptor;
    }>
  | Readonly<{
      kind: "connecting";
      session: HerdrSessionDescriptor;
      endpoint: string;
    }>
  | Readonly<{
      kind: "connected";
      session: HerdrSessionDescriptor;
      endpoint: string;
      metadata: HerdrSessionMetadata;
      snapshot: HerdrSessionSnapshot;
    }>
  | Readonly<{
      kind: "incompatible";
      session: HerdrSessionDescriptor;
      endpoint?: string;
      failure: Extract<HerdrConnectionFailure, { kind: "incompatible" }>;
    }>
  | Readonly<{
      kind: "disconnected";
      session: HerdrSessionDescriptor;
      endpoint?: string;
      metadata?: HerdrSessionMetadata;
      failure: Exclude<HerdrConnectionFailure, { kind: "incompatible" }>;
    }>;

export type SessionsState = Readonly<{
  configuration: HerdrConfiguration;
  catalog: SessionsCatalogState;
  active: ActiveSessionState;
}>;
```

Configuration is stored once at the aggregate root rather than repeated in every catalog union member.

`SessionsModel` is responsible for atomic publications. Consumers never observe a new catalog with an active state derived from an older catalog revision after the transition is complete.

Expected operations:

```ts
export interface SessionsOperations {
  refresh(): Promise<void>;
  selectSession(sessionId: HerdrSessionId): Promise<void>;
  startSelectedSession(): Promise<void>;
  retry(): Promise<void>;
}
```

`retry()` interprets the aggregate state:

- catalog not ready: retry listing;
- selected Session disconnected or incompatible: retry active connection;
- other ready states: perform only behavior explicitly accepted for that state.

Presentation does not choose the retry target.

## 9. Proposed runtime graph

```text
activate(context)
    ↓
HerdrExtension
├── creates configuration
├── creates logger
├── creates CLI directory
├── creates socket connection factory
└── creates SessionsFeature
        ├── creates SessionsModel
        ├── creates Sessions View
        └── creates StatusFeature
                └── creates Status View
```

Data flow:

```text
Herdr CLI list / configuration changes
                ↓
          SessionsModel
                ↓
          SessionsState
           ↙          ↘
Sessions View       StatusFeature
                         ↓
                    Status View
```

Connection flow:

```text
select or restore Session
          ↓
    SessionsModel
          ↓ resolve
HerdrSessionDirectory
          ↓ endpoint
    SessionsModel
          ↓ create
HerdrSessionConnectionFactory
          ↓
logical connection bootstrap
          ↓ metadata + snapshots + closure
    SessionsModel
          ↓ publish
      SessionsState
```

User intent flow:

```text
Sessions View selection ────→ SessionsModel.selectSession()
Sessions View refresh ──────→ SessionsModel.refresh()
Status Start action ────────→ SessionsModel.startSelectedSession()
Status Retry action ────────→ SessionsModel.retry()
Status settings action ─────→ HerdrConfigurationActions
```

## 10. Complete target file structure for currently implemented code

The following structure accounts for the production responsibilities already implemented in the current working tree. Future feature directories are deliberately excluded until their tickets are implemented.

```text
src/
├── capabilities/
│   ├── runtime/
│   │   └── index.ts
│   │
│   └── sessions/
│       ├── index.ts
│       ├── configuration.ts
│       ├── session.ts
│       ├── snapshot.ts
│       ├── directory.ts
│       └── connection.ts
│
├── extension/
│   ├── activate.ts
│   └── HerdrExtension.ts
│
├── features/
│   └── sessions/
│       ├── index.ts
│       ├── SessionsFeature.ts
│       ├── SessionsModel.ts
│       ├── SessionsModel.test.ts
│       │
│       ├── capabilities/
│       │   └── index.ts
│       │
│       ├── view/
│       │   ├── index.ts
│       │   └── VsCodeSessionsView.ts
│       │
│       └── status/
│           ├── index.ts
│           ├── StatusFeature.ts
│           ├── statusModel.ts
│           ├── StatusFeature.test.ts
│           │
│           └── view/
│               ├── index.ts
│               └── VsCodeStatusView.ts
│
└── infrastructure/
    ├── herdr/
    │   ├── index.ts
    │   │
    │   ├── cli/
    │   │   ├── index.ts
    │   │   ├── ProcessRunner.ts
    │   │   ├── HerdrCliSessionDirectory.ts
    │   │   └── HerdrCliSessionDirectory.test.ts
    │   │
    │   └── socket/
    │       ├── index.ts
    │       ├── NodeHerdrSocketConnector.ts
    │       ├── JsonSocketClient.ts
    │       ├── JsonSocketHerdrSessionConnection.ts
    │       ├── JsonSocketHerdrSessionConnectionFactory.ts
    │       │
    │       └── protocol/
    │           ├── index.ts
    │           ├── HerdrProtocol.ts
    │           ├── HerdrSubscriptions.ts
    │           └── HerdrSessionSnapshotDecoder.ts
    │
    └── vscode/
        ├── index.ts
        ├── VsCodeHerdrConfiguration.ts
        └── VsCodeHerdrLogger.ts
```

Tests outside `src/` remain organized by external boundary:

```text
test/
├── extension/
│   ├── activation.test.ts
│   └── sessions.test.ts
│
└── integration/
    └── herdr-socket/
        └── JsonSocketHerdrSessionConnection.test.ts
```

### 10.1 Top-level capability files

`capabilities/sessions/index.ts` is the repository public entry and re-exports deliberate capability types.

`configuration.ts` owns:

- `HerdrConfiguration`;
- `HerdrConfigurationSource`; and
- `HerdrConfigurationActions`.

`session.ts` owns:

- `HerdrSessionId`;
- `HerdrSessionDescriptor`;
- `HerdrSessionMetadata`; and
- `HerdrResolvedSession`.

`snapshot.ts` owns:

- `HerdrSessionSnapshot`;
- Space, Herdr Tab, Pane, Agent, worktree, scroll, and layout data values.

`directory.ts` owns:

- `HerdrSessionListResult`; and
- `HerdrSessionDirectory` with `list`, `resolve`, and `start`.

`connection.ts` owns:

- normalized connection failures;
- `HerdrConnectionFailureError`;
- `HerdrSessionProjectionConsumer`;
- `HerdrSessionConnection`; and
- `HerdrSessionConnectionFactory`.

These files split the existing large public entry without changing its repository-visible alias or semantics.

### 10.2 Sessions feature files

`SessionsFeature.ts`:

- is the feature composition and lifecycle owner;
- constructs the model, parent View, and Status child feature;
- initializes them in dependency order;
- disposes them in reverse order; and
- contains no state-transition policy.

`SessionsModel.ts`:

- owns the combined Sessions state;
- owns discovery revision and configuration-change handling;
- owns selection precedence and persistence ordering;
- owns the active connection generation;
- owns endpoint resolution and connection replacement;
- owns metadata and snapshot installation;
- owns stale-result rejection and observer isolation;
- owns explicit start and retry routing; and
- disposes all in-flight model work and its active connection.

`features/sessions/capabilities/index.ts`:

- owns `SessionsState` and its slices;
- owns `SessionsStateSource`;
- owns `SessionsOperations`; and
- initially owns the minimal persistence capability.

`view/VsCodeSessionsView.ts`:

- consumes one `SessionsStateSource` and `SessionsOperations`;
- derives ordered Session rows;
- renders selected/default/availability/connection information;
- sends selection and refresh intent to the model;
- owns the TreeDataProvider, emitter, registrations, and feedback guards; and
- stores no domain replica.

`status/StatusFeature.ts`:

- owns status workflow and lifecycle;
- subscribes to `SessionsState`;
- computes status presentation values through `statusModel()`;
- invokes Sessions or configuration operations for selected actions; and
- owns its concrete Status View.

`status/statusModel.ts`:

- contains pure derivation from `SessionsState` to immutable `StatusModel`;
- determines available actions from current state; and
- contains no subscription, host API, mutable store, or side effect.

`status/view/VsCodeStatusView.ts`:

- owns the VS Code Status Bar item;
- owns tooltip, icon, copy, accessibility, and Quick Pick rendering;
- returns user intent to its Status feature; and
- disposes host resources.

### 10.3 CLI infrastructure files

`HerdrCliSessionDirectory.ts` remains the concrete implementation of:

```text
list known Sessions
resolve one running Session endpoint
explicitly start one selected Session
```

`ProcessRunner.ts` remains the low-level injected process execution seam and Node implementation until a real reason appears to split them.

### 10.4 Socket infrastructure files

`JsonSocketHerdrSessionConnectionFactory.ts` selects concrete connection construction and timeout configuration.

`JsonSocketHerdrSessionConnection.ts` owns one logical Session connection:

- ping validation;
- broad subscription acknowledgement;
- snapshot reconciliation;
- Pane-specific subscription replacement;
- single-flight and dirty scheduling;
- stable bootstrap completion;
- unexpected-closure reporting; and
- complete logical disposal.

`JsonSocketClient.ts` owns one physical socket client:

- NDJSON framing and UTF-8 chunk decoding;
- line bounds;
- request IDs and pending request correlation;
- request timeout;
- response/event routing; and
- physical transport listener and pending-request cleanup.

`NodeHerdrSocketConnector.ts` owns only `node:net` connection establishment, cancellation, transport event adaptation, and socket disposal.

`protocol/HerdrProtocol.ts` owns protocol constants, record/result validation, pong decoding, normalized request failures, and shared protocol value decoding.

`protocol/HerdrSubscriptions.ts` owns base lifecycle subscriptions, Pane-specific subscription construction, and subscribed-event validation.

`protocol/HerdrSessionSnapshotDecoder.ts` owns complete snapshot decoding, field validation, unknown-field tolerance, uniqueness, and referential consistency.

The exact internal helper placement can be refined during the mechanical split. Do not create generic `utils` or `helpers` modules.

### 10.5 Shared VS Code infrastructure files

Flatten the current one-file `configuration/` and `logging/` children:

```text
infrastructure/vscode/
├── VsCodeHerdrConfiguration.ts
├── VsCodeHerdrLogger.ts
└── index.ts
```

They remain infrastructure because they are shared host mechanisms rather than presentation owned by one feature.

## 11. Expected future feature boundaries

Do not create these directories during the issue #11 migration. They document expected ownership for later tickets and prevent the Sessions feature from becoming the root of the whole product.

### 11.1 Sessions — issues #10–#12

Sessions owns:

- local Session listing and explicit startup;
- selected Session persistence;
- active navigation connection;
- connection metadata and compatibility;
- authoritative/stale projection state;
- reconnect and backoff in issue #12;
- Sessions View; and
- connection status.

Proposed eventual shape:

```text
features/sessions/
├── SessionsFeature.ts
├── SessionsModel.ts
├── capabilities/
├── view/
└── status/
    └── view/
```

### 11.2 Navigation — issue #13 and navigation parts of later tickets

Navigation owns:

- local selected Space;
- Spaces View;
- Panes View scoped to the selected Space;
- grouping Panes for presentation;
- restoring navigation context from a focused terminal surface; and
- revealing a canonical Pane.

It consumes the active Session projection but does not own the Session connection.

Expected shape when implemented:

```text
features/navigation/
├── NavigationFeature.ts
├── NavigationModel.ts
├── capabilities/
└── view/
    ├── VsCodeSpacesView.ts
    └── VsCodePanesView.ts
```

The two VS Code Views are presentations of one navigation feature, not automatically two child features.

### 11.3 Terminal surfaces — issues #14, #16, and likely #19

Terminal surfaces own:

- open surface identity and reuse by Session plus terminal ID;
- native terminal editor instances;
- observe/control bridge lifecycle;
- detach semantics;
- tombstones and final screen retention;
- focus-driven control handoff; and
- surface disposal independent of navigation selection.

This must be separate from Sessions because an open surface outlives navigation Session switching.

Expected broad shape:

```text
features/terminal-surfaces/
├── TerminalSurfacesFeature.ts
├── TerminalSurfacesModel.ts
├── capabilities/
├── control/
└── layout/
```

Exact extraction of `control/` and `layout/` should wait for their behavior. Issue #19 may become a child feature here or an independently composed layout feature depending on its final consumers.

### 11.4 Agents — issue #15 and Agent navigation portions of #20

Agents owns:

- Agent View;
- Agent ordering and presentation;
- Agent status projection for user navigation; and
- the Agent selection workflow.

Agent selection coordinates capabilities from Sessions, Navigation, and terminal surfaces:

```text
select Agent
→ restore Session
→ select Space
→ reveal Pane
→ open or focus terminal surface
```

Expected shape:

```text
features/agents/
├── AgentsFeature.ts
├── AgentsModel.ts
├── capabilities/
└── view/
    └── VsCodeAgentsView.ts
```

### 11.5 Notifications — issue #20

Agent notification policy does not belong inside Sessions status merely because the same delivery ticket includes connection status.

Notifications depend on:

- Agent transitions;
- active Pane identity;
- focused VS Code window;
- notification preferences; and
- navigation/open-Agent operations.

Expected shape when implemented:

```text
features/notifications/
├── NotificationsFeature.ts
├── NotificationPolicy.ts
└── view/
    └── VsCodeNotifications.ts
```

Connection Status Bar behavior can remain a Sessions child feature while Agent toasts live in Notifications. A ticket may modify more than one feature.

### 11.6 Creation and destructive operations — issues #17–#18

Do not decide their final module solely from the noun being mutated.

- Space/Pane creation originates in navigation Views but creates server resources and opens terminal surfaces.
- Pane rename/close affects navigation state and may dispose a terminal surface.
- destructive-result reconciliation depends on Session authority and fresh snapshots.

Place each workflow with the feature that owns its user intent and lifecycle, and compose required cross-feature operations through capabilities. Do not make Sessions own all mutations merely because the server request travels through the active Session connection.

## 12. Current-to-target production mapping

| Current path or concept | Proposed target | Notes |
| --- | --- | --- |
| `capabilities/runtime/index.ts` | same path | Keep the repository-visible runtime capability entry; no architectural move is required. |
| `capabilities/sessions/index.ts` | semantic source files plus the same public entry | Split declarations by responsibility without changing the repository-visible import alias. |
| `extension/activate.ts` | same path | Keep the VS Code activation adapter thin and delegate construction to `HerdrExtension`. |
| `extension/HerdrExtension.ts` | same path | Remain the application composition root; inject `workspaceState` structurally and own shared infrastructure plus `SessionsFeature`. |
| `features/sessions/SessionsFeature.ts` | same path, simplified | Construct and own `SessionsModel`, the Sessions View, and `StatusFeature`; initialize explicitly and dispose in reverse ownership order. |
| `features/sessions/catalog/HerdrSessionsService.ts` | `features/sessions/SessionsModel.ts` | Merge catalog state and revision handling into aggregate model. |
| `features/sessions/active-session/ActiveHerdrSessionService.ts` | `features/sessions/SessionsModel.ts` | Merge selection, persistence, connection generation, and projection authority. |
| `features/sessions/catalog/HerdrSessionsService.test.ts` | `features/sessions/SessionsModel.test.ts` | Preserve listing, revision, explicit start, observer, and disposal behavior. |
| `features/sessions/active-session/ActiveHerdrSessionService.test.ts` | `features/sessions/SessionsModel.test.ts` | Preserve persistence ordering and stale-generation behavior. |
| `features/sessions/catalog/index.ts` | remove | The aggregate model is exported from the Sessions feature entry. |
| `features/sessions/active-session/index.ts` | remove | The aggregate model is exported from the Sessions feature entry. |
| `features/sessions/index.ts` | same path, revised exports | Remain the feature entry and expose only the intended Sessions composition surface. |
| `features/sessions/capabilities/index.ts` | same path, simplified | Expose one Sessions state and operation surface plus local persistence seam. |
| `features/sessions/status/HerdrStatusController.ts` | `features/sessions/status/StatusFeature.ts` plus `statusModel.ts` | Remove mandatory controller layer; move retry routing into model. |
| `features/sessions/status/HerdrStatusController.test.ts` | `status/StatusFeature.test.ts` and/or pure model tests | Assert status derivation and action behavior without controller-shaped contracts. |
| `features/sessions/status/index.ts` | same path, revised exports | Remain the child-feature entry; export its lifecycle owner and deliberate contracts. |
| `features/sessions/vscode/VsCodeHerdrStatusView.ts` | `features/sessions/status/view/VsCodeStatusView.ts` | Status feature presentation. |
| `features/sessions/vscode/VsCodeHerdrSessionsView.ts` | `features/sessions/view/VsCodeSessionsView.ts` | Parent feature presentation consuming one state source. |
| `features/sessions/vscode/VsCodeHerdrCommands.ts` | registrations owned by Sessions View and Status | Keep a shared registration function only for genuinely cross-owner commands. |
| `features/sessions/vscode/VsCodeHerdrSessionSelectionStore.ts` | remove | Inject minimal storage directly into model. |
| `HerdrSessionSelectionStore` | remove | Model owns persistence semantics. |
| `HerdrSessionSelectionStorage` | replace with local `PersistentKeyValueStorage` | Backed structurally by `workspaceState`. |
| `features/sessions/vscode/index.ts` | remove | Replaced by semantic child entries under `view/` and `status/view/`. |
| new `features/sessions/view/index.ts` | feature-owned View entry | Expose only the parent Sessions presentation constructor needed by its composition owner. |
| new `features/sessions/status/view/index.ts` | child-feature-owned View entry | Expose only the Status presentation constructor needed by `StatusFeature`. |
| `infrastructure/herdr/index.ts` | same path, revised exports | Remain the concrete Herdr infrastructure entry; do not expose socket internals to features. |
| `infrastructure/herdr/cli/HerdrCliSessionDirectory.ts` | same path | Preserve the concrete directory behavior and the new `list()` contract. |
| `infrastructure/herdr/cli/HerdrCliSessionDirectory.test.ts` | same path | Update obsolete discovery assertions first, then preserve adapter coverage. |
| `infrastructure/herdr/cli/ProcessRunner.ts` | same path | Keep the process boundary and implementation together until they gain independent reasons to move. |
| `infrastructure/herdr/cli/index.ts` | same path, revised exports if needed | Remain the CLI infrastructure entry. |
| `infrastructure/herdr/socket/JsonSocketHerdrSessionConnection.ts` | factory, logical connection, and client files | Preserve behavior; separate current named responsibilities. |
| `infrastructure/herdr/socket/NodeHerdrSocketConnector.ts` | same semantic file | Keep physical Unix-socket establishment isolated from JSON and logical connection behavior. |
| `infrastructure/herdr/socket/protocol.ts` | semantic protocol child files | Preserve decoding and validation behavior. |
| `infrastructure/herdr/socket/index.ts` | same path, revised exports | Remain the socket infrastructure entry and hide protocol/client implementation details. |
| `infrastructure/vscode/configuration/` | `infrastructure/vscode/VsCodeHerdrConfiguration.ts` | Flatten one-file child. |
| `infrastructure/vscode/logging/` | `infrastructure/vscode/VsCodeHerdrLogger.ts` | Flatten one-file child. |
| `infrastructure/vscode/index.ts` | same path, revised exports | Remain the shared VS Code infrastructure entry after flattening. |

## 13. Behaviors and invariants that the migration must preserve

The architecture migration is behavior-preserving. It must retain all accepted issue #11 behavior.

### 13.1 Catalog and configuration

- Listing returns every known local Session.
- Listing result types remain separate from observable feature state.
- Configuration changes invalidate older listing work.
- A stale listing result cannot replace newer state.
- Missing executable remains distinct from a general listing failure.
- Observer failures do not interrupt authoritative publication.
- Start is explicit and targets the selected stopped Session.
- Selection never auto-starts a stopped Session.

### 13.2 Selection and persistence

- Selection precedence remains saved Session, configured Session, then default Session.
- An unavailable saved selection falls back and heals persistence.
- A stopped Session remains a valid selected Session.
- Rapid selection changes cannot allow an older persistence write to overwrite a newer selection.
- Persistence failure is diagnostic and does not roll back successful in-memory selection.
- Switching Session changes local navigation context only.
- Switching does not stop Herdr resources or close independently owned terminal surfaces.

### 13.3 Connection and projection

- Only one logical navigation connection generation is current.
- Selection rotation disposes the previous logical connection.
- Late resolve, bootstrap, snapshot, close, or failure callbacks from old generations are ignored.
- Connected state is published only after validated metadata and a complete snapshot exist.
- Observer failures do not become protocol failures.
- Unexpected closure transitions the active state once.
- Intentional disposal never reports an unexpected closure and never stops the Herdr Session.

### 13.4 Socket bootstrap and reconciliation

- Connect attempts have a bounded timeout and cancellation.
- A transport resolving after cancellation is disposed.
- Ping validates protocol and endpoint compatibility.
- Broad subscription is acknowledged before the first snapshot.
- Relevant events are invalidation signals rather than projection patches.
- Snapshot reconciliation is single-flight.
- Invalidation during an in-flight snapshot schedules a later pass.
- Pane-specific subscription replacement is acknowledged before the previous subscription is disposed.
- Replacement is followed by a stabilizing snapshot.
- Protocol records reject arrays where objects are required and tolerate documented unknown fields.
- All physical clients, timers, pending requests, subscriptions, and transports are disposed.

### 13.5 Presentation

- Sessions View displays every known Session in default-first, stable order.
- Selected, default, stopped/running, resolving, connecting, connected, incompatible, and disconnected information remains available.
- Selected Session diagnostics include endpoint, version, protocol, and failure information where applicable.
- Status `connected` means validated active Session authority, not CLI-reported running state.
- Retry routing remains based on aggregate feature state.
- Presentation stores no independent copy of domain state.

### 13.6 Lifecycle

- Construction or initialization failure cleans every acquired resource.
- Initialization order remains command/input registration, listing, selection resolution, and connection bootstrap.
- Disposal prevents late publication.
- Host inputs and presentation subscriptions stop before their state owner.
- Model disposal closes only extension-owned client resources.

## 14. Initialization and disposal in the proposed structure

Expected initialization:

```text
HerdrExtension.initialize()
→ SessionsFeature.initialize()
    → initialize/register Sessions View inputs
    → initialize Status feature
    → initialize SessionsModel
        → subscribe to configuration
        → list Sessions
        → resolve saved/configured/default selection
        → connect and bootstrap when running
```

Whether a particular VS Code registration occurs during construction or an explicit `initialize()` should be consistent and exception-safe. The migration must not claim that constructors cannot fail. If resource acquisition is moved into initialization, partial initialization still requires reverse cleanup.

Expected disposal:

```text
SessionsFeature.dispose()
→ dispose Sessions View inputs/subscriptions/resources
→ dispose Status feature and View
→ dispose SessionsModel
    → invalidate generation/revisions
    → unsubscribe configuration
    → cancel persistence effects where applicable
    → dispose active connection
    → clear observers
```

Then `HerdrExtension` disposes infrastructure it owns, such as the logger.

## 15. Testing strategy after migration

The simplification must not replace real behavior tests with wiring assertions.

### 15.1 SessionsModel tests

Test the real model through observable state and operations with controlled external boundaries:

- listing success, missing executable, and failure;
- stale listing result rejection;
- saved/configured/default precedence;
- stopped selection without auto-start;
- explicit selected-Session start;
- persistence healing, ordering, and failure;
- rapid Session switching;
- old connection disposal;
- stale generation rejection;
- authoritative connected state;
- incompatible/disconnected state;
- observer isolation; and
- initialization/disposal races.

Avoid assertions about private methods, internal slice functions, or exact collaborator call order unless the call itself is the required external effect.

### 15.2 Status tests

Test `statusModel()` as a pure projection where useful:

- accessible kind and diagnostic;
- selected Session identity;
- available actions;
- connected metadata; and
- incompatible/disconnected representation.

Test Status feature behavior through chosen actions and resulting public operations, not through a generic controller interface.

### 15.3 Socket integration tests

Keep the existing controlled connector/transport integration suite. If `JsonSocketClient` and protocol files are split, tests continue to target the public `HerdrSessionConnection` behavior unless a lower-level boundary has its own externally meaningful contract.

The current controlled transport does not prove the real `NodeHerdrSocketConnector`; a focused real Unix-socket adapter test remains an optional follow-up rather than a prerequisite to the architecture migration.

### 15.4 Extension Host tests

Keep focused coverage for:

- activation;
- Sessions View registration;
- status registration;
- commands and user actions;
- workspace-state persistence wiring;
- disposal; and
- absence of Herdr without activation failure.

Host-neutral tests do not replace this wiring evidence.

## 16. Canonicalization outcome

The architecture rules were consolidated into one [`code-architecture.md`](../architecture/code-architecture.md). The former object-design, Sessions, and verification references were removed because they duplicated general rules or mixed architecture with a temporary implementation snapshot.

The canonical document now captures the durable decisions: recursive feature ownership, one aggregate Sessions model, semantically owned Views, optional controllers, minimal persistence, explicit composition and lifecycle, capability boundaries, test access, and generic lint enforcement.

This document and the issue #11 design remain decision history and behavior/migration references. Where their old internal graph conflicts with the canonical document, the canonical document wins.

## 17. Required guardrail changes before or with source migration

ESLint currently treats feature `vscode/` children as the generic host-import boundary. The new rules should express semantic ownership generically rather than enumerate every feature.

Representative valid imports should include:

```text
features/sessions/view/**              → vscode
features/sessions/status/view/**       → vscode
features/navigation/view/**            → vscode
features/agents/view/**                → vscode
```

Representative invalid imports should include:

```text
features/**/Model.ts                   -X→ vscode
features/**/capabilities/**            -X→ vscode
capabilities/**                        -X→ vscode
infrastructure/herdr/**                -X→ vscode
feature View                           -X→ concrete Herdr infrastructure
one top-level feature implementation   -X→ sibling feature implementation
```

Prefer a pattern representing the semantic View role, such as `features/**/view/**`, over a list of specific feature names.

If a host-specific feature owner outside `view/` genuinely needs direct VS Code calls, document and express that category rather than adding a one-off exception. The default should remain that concrete host rendering and registration live in the owned View.

## 18. Staged migration plan

The migration should be reviewable and preserve a green baseline between behavioral slices where practical.

### Phase 0: restore the current test baseline

The working tree already contains a small follow-up production refactor made during the architecture discussion:

- `HerdrSessionDirectory.discover()` was renamed to `list()`;
- `HerdrSessionListResult` was separated from feature catalog state;
- the listing result no longer echoes configuration;
- `HerdrSessionsService` explicitly maps listing results into catalog state; and
- `HerdrSessionCatalogState` moved into feature-local capabilities.

Tests were intentionally deferred. At the time this document was created:

- production-only lint passed;
- formatting and `git diff --check` passed;
- `npm test` had 19 passing and 6 failing tests;
- failures were caused by tests still calling `discover()` and using `HerdrSessionDiscovery`;
- full typecheck and lint were blocked by the same obsolete test contracts.

Before the larger architecture migration, update those tests to the `list()` contract and restore the complete green baseline. Do not mix that mechanical test migration with the model merge unless explicitly choosing one review unit.

### Phase 1: align guardrails

The canonical documentation is accepted. Before or with source migration, update generic ESLint ownership/import rules and their representative verification cases so the guardrails express the target graph.

### Phase 2: introduce aggregate Sessions capabilities

Define `SessionsState`, `SessionsStateSource`, and `SessionsOperations` in the feature-local capability scope.

Keep current services temporarily while an aggregate implementation is introduced behind the new seam, or migrate atomically if a temporary wrapper would add more risk than value. Do not leave a permanent forwarding facade.

### Phase 3: merge catalog and active ownership into SessionsModel

Move behavior in coherent groups:

1. configuration subscription and listing revision;
2. initial selection and persistence;
3. resolve/connect/bootstrap generation;
4. snapshot/closure callbacks;
5. retry and explicit start; and
6. disposal and observer publication.

At each step preserve complete state transitions. Do not publish a catalog slice that makes the active slice temporarily contradict the committed aggregate state.

Delete `catalog/` and `active-session/` only after their behavior is present and covered through `SessionsModel`.

### Phase 4: simplify persistence

Inject the minimal key-value storage into SessionsModel, pass `context.workspaceState` through composition, and remove:

- `HerdrSessionSelectionStore`;
- `HerdrSessionSelectionStorage`; and
- `VsCodeHerdrSessionSelectionStore`.

Retain the existing serialized persistence ordering and diagnostics.

### Phase 5: restructure Sessions presentation

Create:

```text
features/sessions/view/
features/sessions/status/view/
```

Move Sessions Tree presentation into the parent View. Introduce `StatusFeature`, pure `statusModel()`, and its concrete View. Remove `HerdrStatusController` after its policy has a clear owner.

Distribute command registration to the responsible feature/View. Do not preserve `VsCodeHerdrCommands` as an empty central router.

### Phase 6: split public capability files

Split the large `capabilities/sessions/index.ts` into semantic source files while retaining the same repository public entry and aliases. This is mechanical and may be done earlier if it materially helps the model migration, but avoid combining it with behavior changes in an unreviewable diff.

### Phase 7: split socket implementation files

Extract `JsonSocketClient`, the logical connection, factory, and semantic protocol decoders. Preserve the public connection seam and integration tests. This phase is structurally independent and can be deferred if the feature migration is already large.

### Phase 8: flatten one-file VS Code infrastructure children

Move configuration and logger implementations directly under `infrastructure/vscode/`, update the public entry, and remove empty child directories.

### Phase 9: complete validation

Run the repository-defined equivalents of:

```text
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:extension
git diff --check HEAD
```

Record environment-blocked checks explicitly. The Extension Host sandbox limitation observed during issue #11 remains an environment consideration rather than permission to skip the suite silently.

## 19. Migration acceptance criteria

The source migration is complete only when:

- one `SessionsModel` owns the complete Sessions feature state;
- consumers subscribe to one Sessions state source;
- catalog and active distinctions remain explicit state slices;
- presentation no longer routes retry between state owners;
- `SessionsFeature` is a small, explicit lifecycle/composition owner;
- parent Sessions presentation lives under `sessions/view/`;
- Status is a child feature with its View under `status/view/`;
- Status has no mutable store unless new non-derivable state is introduced;
- the mandatory controller layer is removed;
- selected-Session persistence uses one minimal injected storage capability;
- no DI container or service locator is introduced;
- all issue #11 behavioral invariants remain covered;
- socket protocol behavior is unchanged by structural file splits;
- architecture docs, lint, imports, and source layout agree;
- future feature directories have not been created speculatively; and
- all validation commands pass or their external blockers are recorded.

## 20. Trade-offs and consequences

### 20.1 Larger SessionsModel

Merging catalog and active ownership creates a larger class. This is accepted because it makes the feature state machine explicit and gives one owner atomic aggregate transitions.

Avoid turning it into a mechanism god object by keeping CLI execution, socket framing, protocol mapping, VS Code presentation, status copy, and terminal behavior outside it.

File size alone is not a reason to recreate multiple observable services. Extract a child only when it gains a distinct state owner or lifecycle that consumers need independently.

### 20.2 Key-value persistence leaks a storage mechanism

Giving SessionsModel a key-value storage capability means it knows its persistence key and the storage operation shape. This is a conscious simplicity trade-off.

The model still does not know VS Code types or call a global API. The boundary remains controllable in tests, while a dedicated Store/Storage adapter chain is removed.

### 20.3 Semantic folders weaken path-only host classification

Replacing `vscode/` with semantic `view/` paths requires lint rules to recognize View roles generically. This is accepted because semantic ownership improves human comprehension and the guardrail can still be expressed as `features/**/view/**`.

### 20.4 Distributed command ownership

Commands will no longer be visible in one central class. Their ownership will instead be visible next to the feature or View that presents the interaction.

The manifest remains the global inventory of contributed command IDs. A feature-level registration function remains acceptable for genuinely cross-cutting commands.

### 20.5 One ticket may touch multiple features

Issue #20 includes both connection status and Agent notifications, but those responsibilities need not share a module. This direction prefers stable ownership over ticket-shaped directories.

### 20.6 Cross-feature coordination remains explicit

Agents, Navigation, and terminal surfaces will collaborate through capabilities composed by their nearest common owner. This direction does not introduce a global store or event bus.

## 21. Questions intentionally deferred to the relevant ticket

The following should not block the Sessions migration:

- whether issue #19 layout is a child of terminal surfaces or an independently composed feature;
- the exact owner of Space/Pane creation orchestration in issue #17;
- the exact owner of Pane rename/close orchestration in issue #18;
- whether terminal surface focus restoration requires a dedicated navigation capability;
- when a generic persistent key-value capability gains enough consumers to move to top-level runtime capabilities; and
- whether future non-VS Code hosts ever justify host variants.

Resolve each when its concrete consumers, state, and lifecycle exist.

## 22. Architecture review checklist

When revisiting this decision, verify:

- Does one Sessions model preserve every issue #11 concurrency and lifecycle invariant?
- Is aggregate state publication defined strongly enough to prevent inconsistent slices?
- Does Status have any real mutable state that contradicts the no-store decision?
- Are command ownership and manifest responsibilities clear?
- Can ESLint express semantic View import permissions generically?
- Are cross-feature capabilities for Navigation, terminal surfaces, and Agents placed at their nearest common owner?
- Are historical design documents marked as superseded without erasing their behavioral decisions?
- Does the architecture still prohibit feature-to-concrete-infrastructure imports?
- Does the migration avoid scaffolding issues #12–#20 prematurely?
- Can the full current test suite be mapped to stable observable seams after the merge?

## 23. Final architecture statement

The extension should be organized first by user capability and state ownership, then by technical presentation and external mechanism.

Each feature has one obvious composition owner and one explicit owner for each part of its mutable application state. A feature may have one aggregate model, several independent models or stores, Views, and coherent child features. Related peers may be grouped under semantic directories such as `models/` or `stores/`; this is an extensible vocabulary rather than a fixed layer template. A View is the host-specific rendering/input surface of its containing feature, not an independent feature or state owner. Child features apply the same rules recursively.

Sessions owns Session discovery, selection, connection, projection authority, and connection status. It publishes one aggregate state and one operation surface. Navigation, terminal surfaces, Agents, and notifications are separate feature owners even though their data originates in an active Herdr Session snapshot. They consume narrow capabilities and are composed explicitly without a global store, event bus, service locator, or DI container.

The filesystem should let a reader infer this ownership before reading constructors:

```text
feature/
├── Feature.ts       # composition and lifecycle
├── Model.ts         # one authoritative state owner, when needed
├── models/          # multiple distinct models, when needed
├── stores/          # distinct stores, when that vocabulary fits
├── capabilities/    # contracts between owned parts and other owners
├── view/            # technical presentation of this feature
└── child-feature/   # coherent nested user capability
    ├── ChildFeature.ts
    └── view/
```

These roles are the accepted basis for the later source migration. Additional semantic roles may be introduced when concrete behavior gives them a clear responsibility and owner.
