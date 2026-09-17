# Design: connect and bootstrap one Herdr Session (#11)

Status: **revised for accepted architecture; implementation design still under review; no implementation has started**  
Issue: [#11 — Connect and bootstrap one Herdr Session](https://github.com/St0necrusher/vscode-herdr-extension/issues/11)  
Parent: [#9 — Implement the Herdr-native VS Code MVP](https://github.com/St0necrusher/vscode-herdr-extension/issues/9)  
Blocked-by status: #10 and #22 are complete; [#23](https://github.com/St0necrusher/vscode-herdr-extension/issues/23) must migrate feature-owned host presentation and guardrails before #11. Version-specific bootstrap evidence remains an implementation-design gate (§10.1).  
Reference runtime: local Herdr 0.9.0, protocol 22, endpoint generation 1.

This revision preserves the product scope and decisions in #1–#9. The architecture direction is accepted; exact #11 API/selection details and bootstrap guarantees remain subject to the review checklist. Paths below describe the target after #23, not a claim that its source migration has happened.

## 1. Purpose

Issue #11 turns the discovery-only Sessions feature delivered by #10 into a client for one selected local Herdr Session. The change must:

1. discover every known local Herdr Session;
2. choose and persist one active navigation Session per VS Code workspace/window;
3. validate and connect to that Session through the public JSON Socket API;
4. establish an authoritative projection without an event gap;
5. show known Sessions and connection state in a native VS Code View;
6. allow non-destructive Session switching; and
7. release every socket, subscription, View, and callback on replacement or disposal.

This document deliberately stops at design. It does not authorize source implementation.

## 2. Source of truth and constraints

This design follows, in descending order of authority:

1. `docs/architecture/code-architecture.md`;
2. `docs/architecture/object-design.md`;
3. `docs/architecture/sessions.md`;
4. `docs/architecture/verification.md`;
5. issue #11 and the still-applicable product decisions in #9;
6. `CONTEXT.md`; and
7. the Herdr 0.9.0 schema and findings recorded in `docs/research/herdr-capabilities-and-integration.md`.

The design uses the domain terms **Herdr Session**, **Space**, **Herdr Tab**, and **Pane**. Socket paths, NDJSON, request IDs, Node sockets, VS Code `Memento`, and Tree APIs are implementation details.

## 3. Scope boundaries

### 3.1 In scope

- Listing the default and named local Herdr Sessions.
- Distinguishing stopped, running, selected, connecting, connected, incompatible, and unavailable Sessions.
- Resolving the selected Session's endpoint.
- Socket `ping`, version/protocol/capability validation, subscription acknowledgement, snapshot acquisition, ordered buffering, request correlation, structured errors, and socket disposal.
- One active Session selection per extension host window/workspace.
- Selection fallback and persistence.
- A native Sessions View.
- A host-neutral Session snapshot and event representation sufficient to form the authoritative projection used by later tickets.
- Applying events received during bootstrap through the same idempotent reducer that later handles live events.
- Updating the existing status model from actual connection state rather than treating CLI discovery as a connection.
- Tests for all issue #11 acceptance criteria.

### 3.2 Explicitly out of scope

The following belongs to #12 or later tickets:

- reconnect schedules, jitter, retry timers, and stale-view retention;
- automatic reconnect after a socket closes;
- the complete live-recovery behavior described by #12;
- Spaces, Panes, Agents, or layout Views;
- terminal observe/control processes;
- server mutations other than the already-supported explicit `Start Herdr` action;
- starting a Session merely because it was selected;
- multiple simultaneously active Session connections;
- remote Herdr machines, browser extension hosts, and native Windows;
- schema generation or runtime download of a schema;
- changes to Herdr-owned focus or another client's navigation context.

The issue #11 connection continues delivering events after bootstrap because the same subscription stays open. Comprehensive live-update and recovery semantics remain acceptance work for #12. #11 must not add reconnect policy under another name.

## 4. Existing and prerequisite baseline

The implemented #10/#22 source has:

- `SessionsFeature` composing catalog, status policy, and command routing;
- `HerdrSessionsService` discovering the configured Session through the CLI;
- catalog `connected` meaning CLI-running, not a validated socket connection;
- concrete status presentation and command registration in VS Code infrastructure;
- explicit `HerdrExtension` composition, class lifecycle, native aliases, and architecture lint;
- behavioral feature tests, CLI tests, and Extension Host activation coverage;
- no active-session service, socket bootstrap, selection persistence, or Sessions TreeProvider.

#23 moves Session-specific host code under `features/sessions/vscode/`, introduces a separate feature-root host composition entry, and updates aliases/lint while preserving behavior. Its host-neutral entry remains loadable without VS Code. Existing useful status/controller test seams can remain; new Views need not copy them.

This design builds on that target. Confirm exact filenames after #23, without reopening product decisions. #11 then separates catalog availability from actual connection authority and adds only its assigned behavior.

## 5. Design decisions

### D1. Catalog and active connection are separate state owners

`HerdrSessionsService` owns executable availability and the set of known local Sessions. A new `ActiveHerdrSessionService` owns selection, one current navigation connection generation, the observable authoritative projection, and connection disposal. It is itself the state owner; do not add another store around it. Expose current readonly state and disposable typed subscriptions. Views derive data rather than replaying raw events or storing their own domain replicas.

This prevents CLI discovery state from being mistaken for socket connection state and matches `docs/architecture/sessions.md`.

### D2. The selected Session is local navigation context

Changing the selection:

- persists a Session identifier locally;
- disposes only the previous extension-owned connection;
- connects to the newly selected running Session when possible; and
- never invokes a Herdr focus, stop, delete, close, or other destructive operation.

Open server resources and other Herdr clients are unaffected. Already-open terminal editors are not closed by navigation Session switching; their later feature owns a separate lifecycle. Server focus is observed data, not an instruction to change local navigation or editor focus.

### D3. Transport topology is private and version-checked

`JsonSocketHerdrSessionConnection` is one logical bootstrap/lifecycle owner, not a promise of one physical socket. Current public [Herdr Socket API documentation](https://herdr.dev/docs/socket-api/) prescribes `events.subscribe` on another connection while requesting `session.snapshot` on the request connection.

Use that topology only after verifying applicability to the target 0.9.0/protocol 22 runtime (§10.1). The previous design's same-socket choice has no prototype evidence and is withdrawn. A different topology needs affirmative version-specific support, not an assumption that request correlation makes a subscription socket reusable.

### D4. Bootstrap ordering lives behind the connection interface

The logical connection owns this sequence under the verified server contract:

```text
open required transport(s)
→ validate ping/metadata and selected endpoint
→ arm event buffer before subscription can emit
→ send events.subscribe on the supported subscription transport
→ await subscription_started while buffering eligible events
→ request session.snapshot on the supported request transport
→ map and validate snapshot
→ consumer installs snapshot
→ reconcile buffered events in receive order using the verified boundary
→ continue live delivery
```

The feature owns projection transitions, not wire frames, response IDs, JSON fields, or transport count. An observer failure in presentation must not be mistaken for a reducer/protocol failure.

### D5. Reconciliation requires more than idempotence

Duplicate-safe updates remain desirable: upsert complete records, remove absent IDs harmlessly, replace server ordering, normalize focus references, and key layouts by Herdr Tab ID. But idempotence alone cannot prevent an old buffered update from overwriting newer snapshot data.

Before claiming authority, record the target version's guarantee that makes the documented snapshot-and-buffer algorithm coherent (or its supported reconciliation mechanism). Do not invent a global cursor: none has yet been established by the evidence gathered here. If version-specific evidence cannot establish the boundary, report a blocker rather than publishing a possibly inconsistent `connected` state.

“Receive order” is the order of complete events on the subscription stream. It does not establish cross-connection causality. Controlled socket tests exercise the client under the documented contract; they do not prove that the real server implements it.

### D6. Unknown fields are ignored; unknown required semantics fail safely

Every mapper extracts required known fields and ignores additional object properties. This provides forward compatibility for additive Herdr changes.

The connection fails as incompatible rather than manufacturing authority when:

- a requested response has the wrong result discriminator;
- a required field is absent or has the wrong type;
- ping reports an unsupported protocol or endpoint generation/capability;
- snapshot metadata disagrees with validated ping metadata; or
- an event explicitly subscribed to cannot be mapped safely.

An unknown field alone never causes failure. An unknown event cannot silently mutate the projection; it is logged and the projection loses authority until a fresh bootstrap.

### D7. Persistence precedence is deterministic

After the catalog is ready, the initial selection is resolved in this order:

1. a persisted Session ID, if it still exists in the catalog;
2. the effective `herdr.session` value, if present in the catalog;
3. the catalog entry marked as the default Session;
4. the entry named `default`; or
5. no selection if the catalog is empty.

The resolved fallback is persisted, replacing an unavailable saved value. A stopped default remains a valid selection but is not auto-started.

This preserves the existing `herdr.session` setting as an initial preference while meeting the first-use default requirement. Once a user selects a Session in the View, the per-workspace/window persisted choice wins over the setting.

### D8. VS Code `workspaceState` stores the choice

`VsCodeSessionSelectionStore` wraps `ExtensionContext.workspaceState`. VS Code scopes it to the current workspace/window identity, including no-folder windows managed by that extension host.

Only the stable Herdr Session name is stored. Endpoints, versions, snapshots, and connection state are never persisted because they may be stale after a Herdr restart.

Invalid stored values are ignored. A persistence write failure is logged and surfaced diagnostically but does not roll back a successful in-memory selection.

### D9. Sessions presentation is feature-owned, not another state owner

A `VsCodeHerdrSessionsView` TreeProvider/presenter under `features/sessions/vscode/` reads narrow catalog and active-state sources and invokes selection operations. It owns TreeItems, copy, icons, accessibility, registration, and disposal, not the domain projection or socket connection.

The provider derives rows from current state and signals `onDidChangeTreeData` when needed. A private derived row value is fine; a separate controller, view interface, or exported view model is not required. Introduce such a seam only for actual policy/transformation/testing value. Keep substantive selection and authority rules host-neutral.

The existing status controller/model can remain useful without becoming a compulsory template for the Sessions View.

### D10. Status reflects active authority

The existing Status Bar remains, but “connected” means that socket validation and bootstrap completed for the selected Session. A merely running Session is not connected.

For #11, a post-bootstrap socket closure transitions the active Session to disconnected/error and retains no claim of authority. Stale projection retention and reconnect presentation are added by #12.

## 6. Target ownership and dependency graph

```text
HerdrExtension
├── Herdr CLI and socket infrastructure
├── shared VS Code configuration/logging facilities
└── Sessions host composition (feature-root host entry, introduced in #23)
    ├── host-neutral SessionsFeature
    │   ├── HerdrSessionsService
    │   ├── ActiveHerdrSessionService
    │   └── existing useful status/action policy
    └── Sessions vscode/ children
        ├── status presentation and command registration
        ├── Sessions TreeProvider/presenter
        └── Session selection persistence adapter
```

Composition passes host-neutral capabilities between children. Host presentation may receive active operations and state sources directly; siblings never import each other's implementations. Catalog and active state may have distinct narrow interfaces implemented by the same owner where appropriate.

Host-neutral `features/sessions/index.ts` must not load `vscode`. A deliberate feature-root host entry such as `vscode.ts` exports the host composition owner; the extension imports it through its supported native package alias. The root composition owner constructs its host and host-neutral children without directly using the VS Code API. API calls stay in `vscode/` children.

Forbidden edges remain:

```text
active-session -X-> catalog implementation
host presenter -X-> active-session implementation
feature code   -X-> Herdr infrastructure implementation
state/policy   -X-> vscode
pure entry     -X-> host entry
```

External infrastructure remains injected from the extension root. Feature-owned host resources are disposed by the feature owner, not a second time by `HerdrExtension`. This graph does not introduce terminal/notification/layout features in #11.

## 7. Capability design

Names below are design-level names. Implementation may refine exact spelling without changing ownership or semantics.

### 7.1 Top-level Session data

External Session contracts in `src/capabilities/sessions/index.ts` gain readonly domain values. Feature-only contracts belong in `features/sessions/capabilities/`; do not promote presentation types merely because they describe Sessions:

```ts
type HerdrSessionId = string;

type HerdrSessionDescriptor = Readonly<{
  id: HerdrSessionId;
  isDefault: boolean;
  availability: "running" | "stopped";
  endpoint?: string;
}>;

type HerdrSessionMetadata = Readonly<{
  version: string;
  protocol: number;
  endpointProtocolGeneration?: number;
  capabilities: Readonly<{
    surfaceInterest?: boolean;
    healthCheck?: boolean;
    liveHandoff?: boolean;
    detachedServerDaemon?: boolean;
  }>;
}>;
```

The descriptor contains domain identity and availability, not CLI records. The endpoint is optional until resolved for a running Session.

The capability layer also owns host-neutral snapshot records for Spaces, Herdr Tabs, Panes, layouts, and Agents. Protocol snake_case fields are mapped to domain camelCase fields. Only fields needed to preserve the authoritative product model cross the seam; unknown protocol fields stay inside infrastructure.

The snapshot root is conceptually:

```ts
type HerdrSessionSnapshot = Readonly<{
  version: string;
  protocol: number;
  spaces: readonly HerdrSpace[];
  herdrTabs: readonly HerdrTab[];
  panes: readonly HerdrPane[];
  layouts: readonly HerdrTabLayout[];
  agents: readonly HerdrAgent[];
  focusedSpaceId?: string;
  focusedHerdrTabId?: string;
  focusedPaneId?: string;
}>;
```

The initial implementation maps all required 0.9.0 fields used to identify and relate these records. It must not expose raw response envelopes or accept `unknown` as the feature's projection type.

### 7.2 Catalog capability

The current single-Session `HerdrSessionDirectory` is deepened rather than wrapped with another pass-through:

```ts
interface HerdrSessionDirectory {
  discover(configuration: HerdrConfiguration): Promise<HerdrSessionDiscovery>;
  resolve(
    configuration: HerdrConfiguration,
    sessionId: HerdrSessionId,
  ): Promise<HerdrResolvedSession>;
  start(
    configuration: HerdrConfiguration,
    sessionId: HerdrSessionId,
  ): Promise<void>;
}
```

`discover` returns all known Sessions and executable-level failures. `resolve` obtains selected-Session endpoint and CLI compatibility metadata. `start` remains explicit and now accepts the selected ID.

The catalog state no longer has a `connected` variant. Its ready state contains all known descriptors. Selected connection state comes only from the active service.

### 7.3 Connection capability

```ts
interface HerdrSessionProjectionConsumer {
  installSnapshot(snapshot: HerdrSessionSnapshot): void;
  applyEvent(event: HerdrSessionEvent): void;
  connectionClosed(failure: HerdrConnectionFailure): void;
}

interface HerdrSessionConnection {
  bootstrap(consumer: HerdrSessionProjectionConsumer): Promise<HerdrSessionMetadata>;
  dispose(): void;
}

interface HerdrSessionConnectionFactory {
  create(session: HerdrResolvedSession): HerdrSessionConnection;
}
```

Interface contract:

- `bootstrap` may be called once.
- It resolves only after ping, subscription acknowledgement, snapshot installation, and buffered-event drain.
- `installSnapshot` is called exactly once before the first `applyEvent`.
- `applyEvent` calls are serialized in subscription-stream receive order under the verified reconciliation contract.
- Transport count is private; all owned transports share one logical failure/disposal boundary.
- No consumer callback occurs after `dispose` returns.
- `dispose` is idempotent, rejects pending requests, removes listeners, and closes all owned transports.
- An initialization failure disposes every owned transport before rejecting.
- `connectionClosed` is emitted at most once for an unexpected post-open termination and never for intentional disposal.

This is a deep interface: callers learn one bootstrap operation while request correlation, framing, buffering, parsing, metadata checks, and socket lifecycle remain hidden.

### 7.4 Structured failures

```ts
type HerdrConnectionFailure =
  | Readonly<{ kind: "transport"; diagnostic: string }>
  | Readonly<{
      kind: "herdr-error";
      code: string;
      message: string;
      operation: "ping" | "subscribe" | "snapshot";
    }>
  | Readonly<{
      kind: "incompatible";
      diagnostic: string;
      version?: string;
      protocol?: number;
      endpointProtocolGeneration?: number;
    }>
  | Readonly<{ kind: "invalid-response"; diagnostic: string }>;
```

Protocol method names may appear in normalized diagnostics or the bounded operation union, but raw DTOs and Node error codes do not cross the capability seam.

### 7.5 Selection persistence capability

```ts
interface HerdrSessionSelectionStore {
  load(): HerdrSessionId | undefined;
  save(sessionId: HerdrSessionId): Promise<void>;
  clear(): Promise<void>;
}
```

`VsCodeSessionSelectionStore` lives in the feature's `vscode/` child and implements this host-neutral contract directly; do not add a second wrapper interface. Keep the contract feature-local while its provider and consumers are all inside Sessions.

### 7.6 State sources and host presentation

The feature-local capabilities expose current catalog/active state, disposable typed subscriptions, and narrow operations such as `select(id)` and explicit retry. Publish complete readonly transitions; consumers can initialize by subscribing and reading current state without an asynchronous gap. Notify only after committed state and guard reentrant/stale work; presentation listener failures do not invalidate the server projection.

The Sessions provider derives row identity, selected flag, availability, connection state, and bounded diagnostics from these sources. Labels, icons, TreeItems, and formatting remain private to the feature's `vscode/` child. No top-level `HerdrSessionsViewModel`/`HerdrSessionsView` contract or separate `HerdrSessionsViewController` is required by this design.

Existing status view capabilities may remain where useful. A changed public testing seam must be justified rather than replaced for new file placement alone.

## 8. State models

### 8.1 Catalog state

Conceptual states:

```text
checking(previous known Sessions optional)
missing executable
ready(known Sessions)
error(diagnostic, previous known Sessions optional)
```

Each ready entry is running or stopped. Catalog discovery does not claim socket connectivity.

A configuration change invalidates the in-flight revision, rediscovers all Sessions, and causes active selection re-evaluation. A stale discovery result cannot replace newer state.

### 8.2 Active Session state

Conceptual discriminated union:

```text
unselected
selected-stopped(session)
resolving(session)
connecting(session)
connected(session, metadata, authoritative projection)
incompatible(session, metadata?, diagnostic)
disconnected(session, diagnostic)
```

For #11, `disconnected` is terminal until explicit retry, selection change, catalog refresh, or configuration change. #12 extends this model with stale projection and reconnect scheduling.

### 8.3 Generation rule

Every selection attempt owns a monotonically increasing local generation:

1. increment generation;
2. dispose the previous connection;
3. select/persist the new ID;
4. resolve and connect;
5. ignore every resolution, callback, or persistence diagnostic whose captured generation is no longer current.

Disposal increments the generation before closing resources. This prevents late promises and callbacks from reviving old state.

## 9. Selection and startup behavior

### 9.1 Initial selection

```text
catalog ready
→ load saved ID
→ resolve precedence from D7
→ publish selected state
→ if stopped: remain selected-stopped
→ if running: resolve endpoint and bootstrap
```

A missing saved Session is not shown as a ghost row. The default fallback is selected and persisted. The logger records that fallback occurred.

### 9.2 User selection

```text
Sessions View selection
→ provider invokes ActiveHerdrSessionOperations.select(id)
→ reject IDs absent from current catalog
→ rotate generation and dispose old connection
→ save selection
→ connect if running
→ render status and View from active state
```

Selecting the already selected Session is a no-op unless its state is disconnected/incompatible, in which case it acts as an explicit retry.

### 9.3 Explicit startup

The existing `Start Herdr` command targets the current selected Session. It remains user initiated. After startup, catalog discovery runs again; the active service then connects when the selected entry becomes running.

No selection action starts a stopped Session automatically.

## 10. Socket protocol design

### 10.1 Version-specific bootstrap gate and transport

Before implementing the authority claim, record evidence for the targeted 0.9.0/protocol 22 runtime:

1. whether request and subscription use separate connections as current public documentation specifies;
2. when the subscription becomes eligible to receive events and when acknowledgement is sent;
3. the snapshot/event boundary and why buffered replay produces current state;
4. subscribed event coverage sufficient to keep mapped records coherent.

The retained prototypes prove terminal bridging/handoff/layout, not this socket sequence. A schema describes shapes but does not alone prove ordering. Use version-matched documentation/source or a bounded disposable-Session probe; report unproven assumptions explicitly. A finite probe supports observed interleavings, not a universal guarantee. Do not silently substitute current web documentation for version-specific evidence.

`NodeSocketFactory` and its local contract stay under Herdr socket infrastructure. The logical connection owns all required Unix sockets, parser buffers, request maps, and failure cleanup. For the documented two-connection shape, either required transport failing invalidates bootstrap/authority.

Each transport handles arbitrary UTF-8 chunk boundaries, newline-delimited JSON, and bounded line size. Serialize requests as one JSON object plus newline. Choose and document the line bound from measured target-version snapshots with safety margin; exceeding it is an invalid-response failure. Do not log snapshots or arbitrary raw payloads.

Do not allow a separate subscription/request pair to connect to different server generations unnoticed. Verify the supported identity/metadata boundary and selected endpoint stability; equal version numbers alone are not proof of identical server instance. If the protocol cannot establish this, include the limitation in the bootstrap decision instead of inventing an identity field.

### 10.2 Request correlation

Each request-capable transport keeps a private map (or the logical owner includes transport identity in its map):

```text
request ID → expected result discriminator + resolve/reject
```

Request IDs are unique for the connection lifetime, for example `vscode-herdr:<counter>`. Randomness is unnecessary; correlation must include the relevant transport scope.

On a response:

- a known ID settles exactly one pending request;
- `{id,error:{code,message}}` rejects with a structured Herdr error;
- an unknown/duplicate response ID is logged and ignored unless it violates an active bootstrap invariant;
- a mismatched result discriminator fails that request as invalid/incompatible; and
- extra response fields are ignored.

On closure/disposal, every pending request is rejected exactly once and the map is cleared.

### 10.3 Ping validation

The request transport begins with:

```json
{"id":"…","method":"ping","params":{}}
```

The expected result discriminator is `pong`. Validation requires:

- a non-empty version;
- a numeric protocol compatible with the extension's supported protocol policy;
- endpoint generation compatibility when advertised; and
- required capabilities for the operations actually used.

For #11, `events.subscribe` and `session.snapshot` method support are proven by successful responses; optional capabilities are recorded, not guessed. `surface_interest`, `health_check`, `live_handoff`, and `detached_server_daemon` do not become required merely because Herdr 0.9.0 advertises them.

The implementation supports protocol 22 initially. Unsupported protocol/generation is an `incompatible` state, not a generic transport error.

### 10.4 Subscription

After required endpoint/metadata validation, send `events.subscribe` on the supported subscription transport with the lifecycle filters required to keep the snapshot projection coherent: workspace, worktree, Herdr Tab, Pane, Agent-status, and layout changes represented by the public 0.9.0 schema.

Wait for a response whose result is `{type:"subscription_started"}`. Only then request `session.snapshot`.

Output-match and scroll-only subscriptions are excluded from #11 because they are not needed for Session authority and could add high-volume traffic.

### 10.5 Event buffering

The FIFO buffer is armed before the subscribe request is written and remains active until snapshot installation completes. This avoids depending on the server flushing the acknowledgement before an already-eligible event.

Events that arrive:

- after the subscribe request is written but before acknowledgement are appended while acknowledgement is still required;
- while the snapshot request is pending are appended;
- while buffered events are being drained are appended to the same queue; and
- after the queue is empty are delivered directly, still serialized through one dispatch loop.

The dispatcher never calls the consumer concurrently.

### 10.6 Snapshot

Send:

```json
{"id":"…","method":"session.snapshot","params":{}}
```

Require result discriminator `session_snapshot`. Map the nested snapshot to host-neutral domain data and verify snapshot version/protocol against ping metadata.

Then:

1. call `installSnapshot` once;
2. reconcile and drain queued events in FIFO order through `applyEvent` under the verified server boundary from D5/§10.1;
3. switch to live delivery; and
4. resolve `bootstrap` with validated metadata.

If mapping, installation, or reducer event application fails, close all owned transports and reject bootstrap. Presentation-subscriber exceptions must be isolated from these protocol/authority failures. The feature must never publish a partially authoritative `connected` state.

### 10.7 Disposal

Intentional disposal performs, in order:

1. mark disposed and invalidate dispatch;
2. remove or disable all transport callbacks;
3. reject pending requests with a local disposed failure;
4. clear buffered events;
5. close/destroy every owned socket; and
6. clear the consumer reference.

Disposal does not call `server.stop` and does not alter any Herdr-owned resource.

## 11. Projection reducer

The active service owns one readonly projection value and exposes current state plus disposable typed subscriptions. It never exposes mutable maps or protocol objects. Apply complete transitions before notifying; do not emit partially installed bootstrap state as authoritative. A subscriber cannot mutate the projection or make a UI exception look like server incompatibility.

Internally, it may build replacement maps for efficient upsert/removal, then publish a new readonly snapshot. Event handling covers every subscribed lifecycle event. The implementation should group event-to-domain mapping with Herdr protocol infrastructure and event-to-projection reduction with the active-session feature.

The reducer must preserve referential consistency:

- a Pane references existing Space and Herdr Tab IDs after each complete update;
- a Herdr Tab references an existing Space;
- closing a Space removes its child Herdr Tabs, Panes, layouts, and Agents if the event does not include all child closures;
- closing a Herdr Tab removes its Panes/layout;
- moving a Pane replaces old identity/location according to the event's previous and new IDs;
- focus IDs are cleared when their records disappear; and
- snapshot arrays remain deterministically ordered by server number/order where supplied.

If an event cannot preserve these invariants, the projection is no longer authoritative and the connection fails safely. #12 will recover through a fresh bootstrap.

## 12. Sessions View design

### 12.1 Manifest

`package.json` gains:

- a Herdr View container if one does not yet exist;
- a `herdr.sessions` View contribution;
- a native View title; and
- only the activation/view commands required by the chosen Tree interaction.

The extension already activates on startup, so an additional `onView` activation event is optional rather than required for correctness.

### 12.2 Row semantics

The View displays every known Session, default first and then stable lexical order unless Herdr supplies a stronger order. Each row communicates:

- Session name;
- whether it is the default;
- whether it is selected;
- stopped/running/connecting/connected/incompatible/unavailable state; and
- selected Session version/protocol diagnostics when available.

“Running” means Herdr reports a server endpoint but this VS Code window is not connected to it. “Connected” is reserved for the selected, bootstrapped Session.

The feature-owned VS Code provider chooses labels, icons, colors, descriptions, tooltips, and accessibility text. Its state sources contain domain values, not codicon names or prose. Row derivation need not become another public model.

### 12.3 Interaction

Selecting a row invokes the injected local selection operation. It does not issue a Herdr focus command. A stopped row becomes the selected stopped Session; the existing explicit Start action remains available separately.

The provider prevents feedback loops when a render/reveal updates VS Code selection programmatically.

## 13. Status and command integration

`HerdrStatusController` reads both local state sources:

- catalog state determines missing executable, discovery, and stopped availability;
- active state determines resolving, connecting, connected, incompatible, and disconnected status.

The command controller receives narrow operations:

- catalog retry/discovery;
- start selected Session;
- retry selected connection;
- configuration actions; and
- status actions.

No controller or host child imports a sibling implementation. Concrete Session command registration is feature-owned after #23; host-neutral action policy remains independently testable. Current command completion does not imply later server mutations have already appeared in the observable projection.

The status tooltip continues to show Session, executable, version, protocol, endpoint, and diagnostics, but those values come from validated active metadata when connected.

## 14. Initialization and disposal

### 14.1 Construction

`HerdrExtension` receives `ExtensionContext`, constructs external Herdr providers and shared host facilities, and injects capabilities into the feature's separate host composition entry. It passes the necessary host context to that entry without exposing VS Code types to the host-neutral feature surface.

The feature-root host composition owner creates Session-specific persistence, Views, and command registration children and supplies their host-neutral contracts where needed. It constructs or delegates host-neutral catalog/active composition explicitly. Register ownership before asynchronous initialization.

### 14.2 Initialization order

```text
register status, Sessions View, and commands
→ initialize catalog discovery
→ resolve saved/local selection
→ resolve endpoint
→ connect and bootstrap if running
```

Register state subscribers before asynchronous discovery. A stopped/unavailable Session is a successful feature initialization with a non-connected state. A bootstrap failure becomes active state/diagnostics rather than necessarily preventing activation. Registration failure still triggers cleanup.

### 14.3 Disposal order

Stop host inputs and presentation subscriptions before disposing their state sources, then dispose active connection, catalog, and feature-owned host resources. Finally the extension disposes shared injected infrastructure it owns. Every resource has one disposal owner; disposal is idempotent and suppresses late publication.

Navigation Session switching disposes only the previous navigation connection. It does not close independent terminal editors or server resources. Terminal lifecycle implementation remains outside #11.

## 15. Requirement traceability

| #11 acceptance criterion | Design coverage | Verification evidence |
| --- | --- | --- |
| Resolve selected/default endpoint and validate ping/version/capabilities | D7, catalog `resolve`, §§9–10.3 | Feature selection tests; controlled socket integration tests for `pong`, protocol mismatch, capabilities, endpoint selection; version-specific bootstrap evidence |
| Subscribe first, await ack, buffer events, request/install snapshot, apply buffer in order | D3–D5, §§10.4–10.6 | Socket integration test with events injected before/during snapshot and observable consumer call order |
| Sessions View shows default and known local Sessions with connection state | D9, §12 | Feature state/selection tests; focused host provider/Extension Host coverage for row states and registration |
| Selection remembered per workspace/window with safe fallback | D7–D8, §§8–9 | Feature tests with controlled store; persistence adapter/Extension Host test |
| Switching changes local navigation only and is non-destructive | D2, §9.2 | Feature test asserts old connection disposal/new connection creation and no directory/server mutation call |
| Correlate by ID, tolerate unknown fields, surface structured Herdr errors | D6, §§7.4, 10.2 | Controlled Unix-socket tests with out-of-order responses, extra fields, and `{id,error}` |
| Connection, subscription, and View resources explicitly disposed | §§10.7, 14 | Unit/integration disposal tests and Extension Host deactivation coverage |
| Tests prove ordering, buffering, persistence, metadata, disposal through public interfaces | §§16–17 | Fast feature suite, public connection integration suite, focused Extension Host suite |

## 16. Verification strategy

### 16.1 Fast feature tests

Extend `src/features/sessions/SessionsFeature.test.ts` and, only where a child has an independently meaningful interface, add colocated child tests.

Test host-neutral behavior through public feature/capability surfaces, without importing the host entry or globally mocking `vscode`:

- first use selects the default Session;
- valid saved selection wins;
- missing saved selection falls back and heals persistence;
- configured initial preference is honored when no saved selection exists;
- stopped selection does not start automatically;
- user selection disposes the previous connection and creates one new connection;
- stale generations cannot publish after rapid switching;
- snapshot is installed before buffered events;
- buffered event order is preserved;
- repeated/upsert events are idempotent, and reconciliation under the verified server boundary does not regress newer snapshot data;
- connection metadata becomes authoritative observable state and semantic status;
- structured errors and incompatibility map to safe state;
- explicit Start targets the selected Session;
- selection never invokes destructive Herdr operations; and
- feature disposal removes subscriptions and blocks late publication.

Controlled implementations satisfy the same capabilities as production. Tests do not inspect private fields, concrete children, or constructor wiring.

### 16.2 Herdr CLI infrastructure tests

Update `HerdrCliSessionDirectory.test.ts` to cover:

- all Session records are mapped;
- default identity and running/stopped state;
- selected endpoint resolution for default and named Sessions;
- missing/invalid endpoint and incompatible status;
- unknown CLI JSON fields are ignored;
- start receives the explicit selected ID; and
- malformed required fields produce normalized discovery errors.

### 16.3 Controlled socket integration tests

Add `test/integration/herdr-socket/` with a temporary Unix socket server. These tests cross the real Node transport seam without requiring an installed or running Herdr.

Scenarios:

1. exact `ping → subscribe → snapshot` request order;
2. unique request IDs and out-of-order response correlation;
3. extra unknown fields on pong, acknowledgement, snapshot, event, and error;
4. structured Herdr error propagation;
5. event after subscription acknowledgement but before snapshot response;
6. multiple events interleaved with unrelated responses;
7. event arriving while the initial buffer drains;
8. partial and multiple NDJSON lines across arbitrary chunks;
9. malformed JSON, missing required fields, wrong result discriminator, and oversized line;
10. protocol/version/generation mismatch;
11. socket error/close during each bootstrap phase;
12. pending request rejection and no late callbacks after disposal; and
13. intentional disposal does not emit unexpected-disconnect state;
14. all transports are cleaned up when either side of a supported two-connection bootstrap fails; and
15. presentation observer exceptions do not corrupt projection authority.

The fixture must model the validated topology and boundary, not make an unsupported same-socket assumption pass. Separately record version-specific server evidence; controlled fixtures cannot prove real Herdr linearization or event completeness. Any real-Herdr probe is isolated from the normal suite and uses disposable resources only.

The test observes only the public `HerdrSessionConnection` capability and controlled consumer.

### 16.4 VS Code Extension Host tests

Extend `test/extension/activation.test.ts` or add focused files to verify:

- extension activation still succeeds without auto-starting Herdr;
- `herdr.sessions` View and relevant commands are registered;
- workspace-state selection survives extension-host recreation where the harness permits;
- provider reads current state on refresh and selection invokes the injected operation without render/selection loops;
- host-owned View/provider and command resources are disposed on deactivation; and
- absence of a running Herdr does not prevent View registration.

Do not make the normal suite depend on the user's installed Herdr or live Sessions.

### 16.5 Completion commands

Implementation completion must run and record:

```text
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:extension
```

The controlled Unix-socket integration tests should run under `npm test` or a clearly named repository script added in the same change. Any environment-blocked check must be reported explicitly.

## 17. Blast radius

### 17.1 Existing owners expected to change

Paths below are the post-#23 target; confirm exact exports/files after that refactor without redoing its ownership migration in #11.

| Owner/path | Change | Risk |
| --- | --- | --- |
| `src/capabilities/sessions/index.ts` | External catalog, connection, snapshot/event and failure contracts | High: public seam |
| `src/features/sessions/capabilities/` | Local active/catalog state sources and operations | Medium |
| `src/features/sessions/catalog/` | All-Session discovery; remove CLI-derived authority | High |
| `src/features/sessions/status/` and `commands/` where retained | Actual active authority, selected-Session operations | High/medium |
| `src/features/sessions/SessionsFeature.ts` | Host-neutral active/catalog composition | High |
| Feature-root Sessions host entry/composition | Construct persistence/provider, inject capabilities, own lifecycle | High |
| `src/features/sessions/vscode/` | Adapt existing status/commands and add Sessions provider | Medium |
| `src/infrastructure/herdr/cli/` | All Sessions, resolution, explicit selected start | High |
| `src/infrastructure/herdr/index.ts` | Export connection factory | Medium |
| `src/extension/HerdrExtension.ts`, `activate.ts` | Pass host context and external connection providers | High |
| `package.json` | View container/contributions; reuse #23 host alias | Medium |
| Existing feature/CLI tests and `test/extension/` | Verify changed observable semantics and lifecycle | Medium |

Do not reintroduce status/presentation exports in `infrastructure/vscode` after #23 moves them. Shared logging/configuration need no unrelated migration.

### 17.2 New behavior owners

```text
src/features/sessions/active-session/
  ActiveHerdrSessionService.ts
  index.ts

src/features/sessions/vscode/
  # Sessions TreeProvider and Session selection persistence

src/infrastructure/herdr/socket/
  # logical connection, factory, and local Node transport

src/infrastructure/herdr/protocol/
  # semantic envelope/snapshot/event decoding and mapping

test/integration/herdr-socket/
  # controlled protocol fixtures and behavior tests
```

No extra store, mandatory Sessions View controller, global event bus, state library, or generic backend is added. Class/file splits follow real responsibilities; do not create `utils`, `helpers`, or `internal/` directories.

### 17.3 Areas intentionally not touched

- terminal subprocess infrastructure;
- Spaces/Panes/Agents feature modules;
- notification policy;
- layout projection;
- worktree operations;
- Herdr configuration files;
- server lifecycle beyond existing explicit startup; and
- architecture rules unless a real generic-rule gap is found.

### 17.4 Behavioral compatibility risks

- `herdr.session` changes from the only continuously selected target to an initial preference below persisted selection.
- “Connected” in the Status Bar becomes stricter and may temporarily show connecting/error where #10 showed connected based only on CLI status.
- starting Herdr now targets the active persisted selection rather than blindly reading the setting.
- activation may perform a socket bootstrap for a running selected Session, adding local I/O but no process start or server mutation.

These are intended behavior changes and require explicit tests and release notes if the extension is already distributed.

## 18. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Event-gap or unsupported bootstrap boundary | Projection can be silently wrong | Version-specific server evidence plus connection-owned sequence and client interleaving tests |
| Snapshot overlaps buffered changes | Stale replay can regress state even with idempotent operations | Verified reconciliation boundary, duplicate-safe reducer, and overlap/interleaving tests |
| Unknown additive fields break client | Version updates cause avoidable incompatibility | Structural extraction; ignore extras everywhere |
| Unknown required semantics are ignored | Client claims false authority | Fail safe to incompatible/non-authoritative state |
| Rapid Session switching publishes stale results | Wrong Session appears active | Generation token plus immediate old-connection disposal |
| Saved Session no longer exists | Empty/broken first-use state | Deterministic default fallback and healed persistence |
| Session name collides with presentation label | Wrong persistence identity | Persist Herdr Session ID/name only, never row label |
| Socket payload grows without bound | Extension-host memory pressure | Bounded line buffer and diagnostic failure |
| Disposal races with socket callbacks | Leaks or resurrected state | Disposed gate, listener removal, pending rejection, late-callback tests |
| View selection causes render-selection loop | Repeated reconnects | Adapter suppression around programmatic reveal/render |
| CLI and socket metadata disagree | Connection to wrong/incompatible endpoint | Resolve selected endpoint, then trust validated ping; reject inconsistency |
| Scope leaks into #12 reconnect work | Larger change and unclear acceptance | No timers/backoff/stale retention in #11; disconnected state waits for explicit trigger |
| Full projection mapping makes #11 large | Longer implementation and review | Keep one host-neutral model and one reducer; avoid premature child Views or mutation operations |
| Protocol DTOs leak into capability types | Future Herdr changes spread through features | Map at infrastructure seam and test public capability data |
| Logging leaks large/session-sensitive data | Privacy and noisy Output channel | Log identifiers/metadata/diagnostics, never full snapshot or raw event body |

## 19. Implementation sequence

Prerequisites: complete #23 with existing behavior preserved; validate the version-specific topology/reconciliation contract in §10.1 before claiming bootstrap authority.

Then implement reviewable slices:

1. **State/contracts split** — catalog availability versus observable active authority; preserve useful status seams without mandatory view layers.
2. **Catalog deepening** — discover known Sessions, resolve one, explicitly start selected Session.
3. **Transport and correlation** — implement supported transport topology, framing, IDs, failures, and complete resource cleanup.
4. **Bootstrap and projection** — normalize snapshot/events, apply verified reconciliation, publish readonly coherent state.
5. **Selection** — persistence precedence, generation guards, switching and explicit retry.
6. **Feature-owned host UI** — Sessions TreeProvider, status and command integration, contributions, and host composition.
7. **Verification** — controlled client integration tests, isolated version evidence, focused Extension Host checks, and repository validation.

Each mutable state has one owner. Do not expose raw protocol or VS Code types through state capabilities. Under `/impl`, test authoring is a separately approved phase; the complete ticket still requires its acceptance evidence before being declared done.

## 20. Review checklist

Carry forward the accepted product contract; these are implementation checks, not requests to reopen product decisions:

- [ ] A stopped selected Session remains selected without auto-start.
- [ ] Session selection changes only local navigation and does not close server resources or existing terminal editors.
- [ ] #11 establishes continuous event delivery; #12 owns reconnect/stale/backoff behavior.
- [ ] Feature-owned host presentation does not change the agreed UI interactions.

Resolve or verify the remaining implementation-design choices:

- [ ] Confirm the proposed precedence between persisted selection and the existing `herdr.session` setting in D7 against the accepted selection contract.
- [ ] Verify the initial supported protocol policy for the target runtime.
- [ ] Map the records/events needed for a coherent typed projection without speculative future-only fields.
- [ ] #23 has completed the host ownership/alias/lint migration; host-neutral imports still load without VS Code.
- [ ] Target-version evidence establishes transport topology and snapshot/event reconciliation; no unsupported single-socket or idempotence-only guarantee remains.
- [ ] The listed blast radius is acceptable before source implementation begins.

## 21. Exit criteria for the design phase

The design phase is complete when:

1. the owner reviews the decisions and checklist above;
2. unresolved choices are amended in this document;
3. every #11 acceptance criterion still has one implementation path and one verification path;
4. #12 responsibilities remain clearly excluded; and
5. the owner explicitly authorizes implementation.
