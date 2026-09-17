# Herdr Sessions architecture

Read this reference before changing Herdr Session discovery, startup, selection, connection, bootstrap, reconnect, status, commands, or Sessions View behavior. Apply [`code-architecture.md`](code-architecture.md) and [`object-design.md`](object-design.md).

Session-specific presentation and command registration are feature-owned. Do not create future modules before their behavior exists.

## Scope and invariants

Tickets #10–#12 belong to the Sessions feature. One Herdr Session is active in navigation Views. Herdr remains the sole owner of Sessions, Spaces, Herdr Tabs, Panes, processes, and Agents.

Selecting a Session changes local navigation and the navigation connection. It does not stop server resources or close already-open terminal editors. Those surfaces have an independent lifecycle and retain their Session/terminal identity. Do not implement their later-ticket behavior in Sessions bootstrap.

Local navigation selection is not server focus. Server focus events update observed data; they do not automatically select a different Space or rearrange/focus VS Code editors. Explicit Agent/terminal navigation follows the accepted product policy. Opening a Herdr Tab applies its current layout once, best-effort; live updates do not continuously rearrange editors.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `catalog/` | Discover known Sessions, report executable/availability state, refresh configuration, and explicitly start a Session. |
| `active-session/` | Selected Session, persistence, connection generation, bootstrap, one observable projection, authority/freshness, and connection disposal; reconnect policy in #12. |
| `status/`, `commands/` when useful | Host-neutral status/action policy and operation routing where these have substantive behavior or a useful controlled seam. |
| `vscode/` | Sessions-specific Status Bar, TreeProvider, concrete command registration, copy, icons, accessibility, and VS Code resources. |

A separate `sessions-view/` controller/model is not mandatory. A provider may read narrow state sources and invoke operations directly. Do not add a wrapper store around the active-session service or copy domain records into each View.

Catalog, active projection, local navigation, and terminal surface state are distinct responsibilities, not a requirement for four new classes. Selected Session remains in the active service; extract further navigation ownership only when actual behavior warrants it.

## Composition and public entries

The feature root is the common composition owner of its children. Its ordinary public entry exports the host composition used by the extension. Host-neutral implementation remains directly importable by tests without loading VS Code:

```text
features/sessions/
  index.ts                    # exports VsCodeSessionsFeature
  SessionsFeature.ts          # host-neutral implementation; tests import directly
  VsCodeSessionsFeature.ts    # root-level owner of host composition
  capabilities/
  catalog/
  active-session/             # introduced in #11
  status/                    # retain while it carries useful policy
  commands/                  # retain while it carries useful policy
  vscode/
    index.ts
    # Session-specific status, tree, command implementations
```

These are target responsibilities; exact class/file names may be refined without changing the graph. The host composition owner can construct host children and supply their capabilities to host-neutral composition. It does not import the VS Code API itself; concrete API calls stay in the host child. Sibling children communicate through parent-local capabilities, not sibling implementations.

`HerdrExtension` creates shared infrastructure, imports `VsCodeSessionsFeature` from `#features/sessions`, injects external capabilities, and disposes the feature owner. Do not export `SessionsFeature` or add `vscode.ts` solely for tests. The feature owner disposes its children. Do not also retain top-level disposal of a resource whose ownership moved into the feature.

## Capabilities and infrastructure

Keep each contract at the nearest owner of all consumers/providers. Top-level Session capabilities describe external seams such as discovery, connection/factory, normalized snapshot/events, configuration, and persistence. Status/view/command contracts consumed only inside Sessions can be local. Move them only after checking actual consumers; do not add a matching interface for every concrete class.

Herdr infrastructure owns CLI/process/socket mechanisms, request correlation, protocol mapping, and normalized failures. Node sockets, JSON envelopes, CLI flags, and protocol DTOs do not enter features.

Shared VS Code logging/configuration facilities may remain under `infrastructure/vscode/`. Feature-specific presentation and command registration belong under `features/sessions/vscode/`. A Session-specific persistence adapter may also live in that host child when introduced; the active service receives only its host-neutral persistence capability.

The feature host child may use VS Code directly but may not import Herdr infrastructure implementations. Extension composition provides those through capabilities.

## Observable state and operations

The catalog owns discovery/availability, not socket authority. The current #10/#22 baseline still reports CLI-derived `connected`; #23 preserves that behavior. #11 separates catalog availability from validated active connection authority.

The active-session service owns:

- selected Session, saved choice and specified fallback;
- one current navigation connection generation;
- bootstrap state, local snapshot and ordered live events;
- authoritative versus non-authoritative state;
- mutation gating and manual retry;
- incompatibility, cancellation and late-result rejection;
- in #12, stale retention and reconnect timing/jitter.

Expose current readonly state and disposable typed subscriptions. Apply complete transitions before notifying observers. Bootstrap cannot publish a partially authoritative `connected` state. Isolate presentation subscriber failures from state processing; observers handle asynchronous effects and stale completions explicitly.

```text
normalized snapshot/events → active state transition → subscribers
user intent → operation → Herdr request → event/fresh snapshot → state
```

Do not promise command completion means the projection already reflects the change. Keep necessary operation pending/error state with its actual owner. Derive display values instead of storing domain replicas. No global event bus or state-management library is required.

## Connection bootstrap

The connection owns transport topology, ping/metadata validation, subscription acknowledgement, buffering, snapshot acquisition, ordered delivery, and cleanup. A logical connection may own multiple physical sockets. The feature must not depend on their number.

The current public Socket API recommends subscribing on a separate connection, awaiting acknowledgement, buffering events during snapshot acquisition, installing the snapshot, and replaying the buffered stream in order. Verify that contract against the targeted Herdr version before relying on it. Do not substitute a single-socket topology without version-specific support/evidence.

Buffering must be ready before subscription can deliver events. Snapshot installation precedes event delivery to the consumer; all consumer callbacks are serialized. A real server guarantee must justify the snapshot/event boundary: idempotence alone does not make an older update safe to replay over a newer snapshot. A controlled server test proves client sequencing, not the real server's guarantee.

Dispose all owned transports, reject pending work, clear buffers/subscriptions, and prevent late callbacks. Intentional client disposal never stops a Herdr Session.

## Presentation and effects

Status and the Sessions TreeProvider consume catalog/active state and operations. Host code owns copy, icons, TreeItems, command IDs, and concrete registrations; manifest titles remain in `package.json`.

Retain the existing host-neutral status controller/model where it protects useful behavior/tests. Do not require every future View to reproduce it. Keep substantive policy independent of VS Code and avoid injecting a mirror of the complete VS Code API.

State rendering, one-time notifications, focus/handoff, and layout opening are separate kinds of behavior. Bootstrap must not manufacture historical notifications or focus actions. Terminal output frames and screen history do not belong to the Session domain projection.

## Initialization and disposal

Initialize dependent resources in order:

```text
register presentation and commands
→ discover catalog
→ resolve local selection
→ connect and bootstrap if running
```

Dispose subscribers and host input handlers before their state sources; dispose active connection before catalog and injected infrastructure. Register ownership before asynchronous initialization so partial failure can clean up. Every disposal is idempotent and invalidates in-flight work.

Selection rotation disposes only the previous navigation connection. Extension shutdown also disposes independent terminal surfaces through their own owner, without stopping server resources.

## Completion criteria

- Each mutable state and live resource has one owner.
- Sibling implementations communicate through parent-local capabilities.
- Host-neutral state/policy implementation modules do not load VS Code transitively; tests can import them directly without a production export.
- Feature host children do not import external infrastructure implementations.
- The connection owns wire sequencing; the active service owns projection/authority and later reconnect policy.
- Host-specific effects obey accepted product policy, not arbitrary server event reactions.
- Initialization, disposal, and stale-result rejection are explicit.
- Code, import aliases, and generic architecture lint agree with the accepted architecture.
