# Herdr Sessions architecture

Read this reference before changing Herdr Session discovery, startup, selection, connection, bootstrap, reconnect, status, commands, or Sessions View behavior. Apply the ownership rules in [`code-architecture.md`](code-architecture.md) and the object rules in [`object-design.md`](object-design.md).

## Scope

Tickets #10–#12 belong to one top-level Sessions feature. The current product scope has one Herdr Session active in navigation Views.

A Herdr Session remains a server-owned runtime namespace with its own socket, Spaces, Herdr Tabs, Panes, processes, and agents. Closing an extension connection does not stop that Herdr Session or its resources.

Keep connection creation and ownership explicit so a later requirement can add concurrent active connections without replacing infrastructure contracts. Do not implement multi-Session connection management before that requirement exists.

## Feature ownership

The Sessions feature owns these children:

```text
features/
  sessions/
    SessionsFeature.ts
    capabilities/
    catalog/
    active-session/
    status/
    sessions-view/
    commands/
    shared/              # created only for proven sibling sharing
    index.ts
```

| Child module | Responsibility |
| --- | --- |
| `catalog/` | Discover known Herdr Sessions, report executable availability, react to configuration, refresh state, and explicitly start a Herdr Session. |
| `active-session/` | Own the selected Herdr Session, connection, bootstrap, local snapshot, ordered events, stale state, reconnect, selection persistence, and connection disposal. |
| `status/` | Combine catalog and active Herdr Session state into the status presentation capability. |
| `sessions-view/` | Combine catalog and active Herdr Session state into the Sessions View presentation and handle selection through an operations capability. |
| `commands/` | Bind command capabilities to catalog and active Herdr Session operations. |

Create a child when its behavior exists. Split a child further only when a distinct responsibility, state owner, lifecycle, or independent consumer appears.

## Local composition

`SessionsFeature` is the local composition owner. It constructs its children and injects only local capability interfaces between siblings:

```text
SessionsFeature
├── HerdrSessionsService
├── ActiveHerdrSessionService
├── HerdrStatusController
├── HerdrSessionsViewController
└── HerdrSessionsCommandsController
```

Sibling implementations remain isolated:

```text
features/sessions/active-session -X-> features/sessions/catalog
features/sessions/status         -X-> features/sessions/active-session
```

They use local state-source and operation capabilities instead:

```text
features/sessions/active-session -> features/sessions/capabilities
features/sessions/status         -> features/sessions/capabilities
features/sessions/sessions-view  -> features/sessions/capabilities
features/sessions/commands       -> features/sessions/capabilities
```

`SessionsFeature` exposes only the lifecycle and operations required outside the feature.

## Top-level Session capabilities

Top-level Session capabilities connect the Sessions feature to infrastructure. They include the required equivalents of:

- Herdr Session descriptors and identifiers;
- Herdr configuration source;
- Herdr Session discovery and explicit startup;
- Herdr Session connection and connection factory;
- selection persistence;
- status presentation;
- Sessions View presentation and selection input;
- command registration;
- controlled clock, randomness, logging, and disposal.

Keep wire messages, CLI responses, Node sockets, and VS Code objects out of these contracts.

## Infrastructure

The intended concrete infrastructure is:

```text
infrastructure/
  herdr/
    cli/
      HerdrCliSessionDirectory.ts
      NodeProcessRunner.ts
    socket/
      JsonSocketHerdrSessionConnection.ts
      JsonSocketHerdrSessionConnectionFactory.ts
      NodeSocketFactory.ts
    protocol/
      # Herdr wire DTOs and protocol errors

  vscode/
    configuration/
    persistence/
    presentation/
    commands/
    logging/

  system/
    time/
    randomness/
```

Representative providers include:

- `HerdrCliSessionDirectory` for Herdr Session discovery and startup;
- `JsonSocketHerdrSessionConnection` for request correlation, errors, subscription, snapshot bootstrap, ordered events, and socket closure;
- `VsCodeSessionSelectionStore` for window/workspace selection persistence;
- `VsCodeHerdrStatusView` and `VsCodeHerdrSessionsView` for host presentation;
- `SystemClock` and `SystemRandomSource` for replaceable reconnect timing.

Protocol DTOs remain inside Herdr infrastructure. VS Code types remain inside VS Code infrastructure.

## Runtime responsibilities

### Herdr Session catalog

The catalog service owns:

- initial discovery;
- known Herdr Sessions;
- missing executable and discovery errors;
- running, stopped, and incompatible metadata;
- configuration-change refresh;
- explicit startup;
- cancellation or invalidation of stale discovery results.

### Active Herdr Session

The active Herdr Session service owns:

- loading and saving the selected Herdr Session;
- choosing the specified fallback when saved selection is unavailable;
- one current connection generation;
- bootstrap state;
- the last local snapshot;
- ordered live events;
- authoritative versus stale state;
- mutation gating;
- reconnect timing and jitter;
- manual retry;
- incompatibility gating;
- cancellation, connection disposal, and late-result rejection.

Keep this state inside the service as readonly observable data until a distinct state owner or independent consumer justifies another object. Do not create a separate projection class only to hold data.

### Herdr Session connection

The Herdr Session connection owns the wire sequence:

1. open the selected Herdr Session socket;
2. validate ping, version, and capabilities;
3. subscribe and wait for acknowledgement;
4. buffer incoming events;
5. request a fresh snapshot;
6. deliver the snapshot;
7. deliver buffered events in server order;
8. deliver subsequent live events;
9. report incompatibility or disconnection;
10. close its socket on disposal.

The feature receives capability data and connection callbacks. It does not know request framing, response IDs, JSON field names, or Node socket behavior.

## Presentation

The status controller reads catalog and active Herdr Session state through local capabilities and produces a status presentation. It does not call Herdr infrastructure directly.

The Sessions View controller reads the same state, produces View presentation, and invokes active Herdr Session operations through a local capability when the user selects a Herdr Session.

The commands controller binds host commands to catalog and active Herdr Session operation capabilities. Concrete VS Code command identifiers and registrations remain in VS Code infrastructure.

## Initialization and disposal

The intended initialization order is:

```text
register presentation and commands
→ initialize Herdr Session catalog
→ load active Herdr Session selection
→ connect and bootstrap the active Herdr Session
```

The intended disposal order is:

```text
controllers
→ active Herdr Session
→ Herdr Session catalog
→ infrastructure resources
```

The active Herdr Session service cancels retry timers, invalidates its current generation, closes its connection, removes subscriptions, and ignores late callbacks during disposal or selection change.

## Completion criteria

A Sessions change is architecturally complete when:

- each state and live resource has one owner;
- sibling children communicate only through local capabilities;
- Herdr and VS Code infrastructure cross the feature boundary only through top-level capabilities;
- bootstrap ordering and event delivery remain owned by the connection implementation;
- reconnect and authoritative/stale state remain owned by the active Herdr Session service;
- initialization and disposal order are explicit;
- extension disposal never stops server-owned Herdr work.
