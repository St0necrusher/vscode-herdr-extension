# Issue #13 — native Spaces and Panes navigation

Status: **approved; implementation and critical tests reviewed**

Issue: [#13 — Browse Spaces and Panes natively](https://github.com/St0necrusher/vscode-herdr-extension/issues/13)

Parent: #9

Blocked by: #12 (closed)

## Purpose

Let a user understand and browse the contents of the active Herdr Session from native VS Code navigation without creating a competing client-owned hierarchy or changing focus in Herdr, Ghostty, or another client.

## Acceptance criteria

- The Spaces View lists exactly the Herdr Workspaces from the active Session.
- Space rows use server-owned labels and show Pane counts and aggregate Agent state.
- Selecting a Space changes only the local Panes navigation context.
- The Panes View groups Panes by their server-owned Herdr Tab and initially expands those groups.
- Group headings use server naming and Pane counts without requiring the user to understand the Herdr Tab term.
- Pane rows show compact server-owned naming only. The user explicitly removed Pane-level Agent and terminal/exited status from #13; raw identities remain available in tooltips.
- Session and Space switching do not close client surfaces and remain safe while the projection is stale.
- Tests cover observable feature state and View behavior, aggregate status, local selection, server naming, and stale-state action gating through the navigation feature interface.

## Exclusions

Issue #13 does not add terminal surfaces, Pane creation/splitting/closing/renaming, layout projection, Agent navigation or notifications, terminal control, or server-side focus changes.

## Existing foundation

- `SessionsModel` is the authoritative owner of the active Session projection.
- A connected Session carries a current `HerdrSessionSnapshot`; reconnecting and incompatible states may retain one readable stale snapshot.
- The snapshot already contains server Spaces, Herdr Tabs, Panes, labels, counts, hierarchy references, and server-provided aggregate Agent status.
- Only connected Session state is authoritative for mutation; stale state remains readable.
- The extension currently contributes only the Sessions View.

## Proposed ownership and data flow

```text
Herdr snapshot/events
  → SessionsModel authoritative Session projection
  → narrow ActiveSessionProjectionSource capability
  → NavigationContextModel local navigation state
  → SpacesModel / PanesModel
  → Navigation child Views

local Space selection
  → SpaceSelectionOperations
  → NavigationContextModel selected Space
  → PanesModel derives groups and rows for that Space
  → Panes View renders them
```

`Sessions` owns the connection and authoritative Session projection. A separate top-level `Navigation` feature owns the local selected Space and both navigation Views. This follows the canonical architecture's explicit future boundary for issue #13; selected-Space state does not belong in `SessionsModel`.

The extension root is their nearest common owner. It injects a narrow projection capability from Sessions into Navigation. Navigation never imports the Sessions implementation, opens a socket, persists selection, or copies Herdr domain state into a second mutable store. Its Views render derived navigation models and send intent through Navigation operations.

## Agreed product decisions

### Space selection — agreed

- Space selection is not persisted by the extension. This explicitly amends parent issue #9's earlier persistence statement.
- On entering a Session, resolve selection from `session.snapshot.focused_workspace_id`, which reflects Herdr's server App focus, then the first Space in server order, then no selection.
- While the VS Code window remains open, selecting a Space in issue #13 changes only the local Panes navigation context and does not mutate Herdr focus or follow later focus changes from Ghostty.
- If the locally selected Space disappears, reconcile again from the current server-focused Space, then the first server Space, then no selection.
- A later feature may intentionally send Space switches to Herdr. At that point all clients would naturally observe server focus, and opening VS Code would start from the latest server-focused Space. That future behavior is not added by issue #13 because its acceptance criteria explicitly require local-only selection.
- Herdr v0.9.0 source confirms the global focus survives ordinary client disconnect in server memory. It survives a graceful server restart only when Session persistence is enabled and the save completes; it is not guaranteed across crashes or persistence-disabled operation. Per-client shell projection is separate process-memory state and is not durable. Evidence: [`herdr-v0.9.0-navigation-audit.md`](herdr-v0.9.0-navigation-audit.md).

### Panes hierarchy — agreed

- A Herdr Tab containing multiple Panes is rendered as one expanded group. Its heading uses the server `TabInfo.label` and shows the Pane count; it does not say “Tab” or add an extension-owned group name.
- Its child rows are the Panes in that Herdr Tab.
- A Herdr Tab containing exactly one Pane is visually flattened: the Pane appears directly at the Panes View root without a redundant one-child group.
- The singleton row presents only the resolved Pane name as its primary label and the server Herdr Tab label as less-prominent same-line description. Raw IDs and diagnostics stay in its tooltip. Native VS Code Tree items do not support a taller two-line row; a custom Webview is explicitly out of scope.
- Because the singleton row visually represents both the hidden Herdr Tab and its Pane, its context menu must contain the applicable Tab-level and Pane-level actions. Each action still targets its real server identity. Issue #13 establishes this presentation contract but does not pull later layout, rename, split, or close operations into the ticket.
- Newly encountered multi-Pane groups start expanded. A user's later manual collapsed/expanded state is preserved across projection refreshes through stable server identity.
- If a Herdr Tab changes between one and multiple Panes, the same Pane row moves between the root and its group without changing Pane identity.

This intentionally amends issue #4's rule that every Herdr Tab receives a group row and refines issue #13's blanket grouping wording. It keeps singleton navigation Pane-first while retaining the otherwise-hidden server Tab label.

### Compact Pane row text — agreed

- A Pane child under a multi-Pane group shows only its resolved Pane name as row text; the parent already supplies the Tab context.
- A flattened singleton shows the resolved Pane name plus the Tab label as less-prominent same-line description.
- Row-specific diagnostic identities belong in the tooltip rather than the row, preventing long and unstable lines. Pane tooltips include Pane, terminal, and Herdr Tab identity; they do not repeat the active Session or selected Space already visible in their owning Views.
- Pane rows do not show Agent status or terminal/exited state, including in their tooltip. That information is deferred until actual use demonstrates a need; detailed Agent status belongs primarily in the later Agents View.
- Space rows retain the server-provided aggregate Agent state required for quick Session-level scanning.
- When a Pane exits or closes, Herdr removes it from the next snapshot, so its navigation row disappears. Issue #13 creates no client-owned exited tombstone; a future open terminal surface may retain its final screen under that feature's lifecycle contract.

### Pane display name — agreed

“Manual Pane label” means a custom name stored and owned by Herdr, set through Herdr's Pane rename operation. It is not an extension-local alias.

The Panes View follows Herdr v0.9.0's aggregate navigator semantics:

1. server-owned custom `Pane.label`;
2. associated `Agent.name`;
3. associated `Agent.displayAgent`;
4. associated `Agent.title`;
5. generated `Pane <server pane identity>` fallback.

The navigation View does not introduce foreground-process inspection or use volatile terminal titles as another naming policy. A later Rename Pane action writes through Herdr so every client observes the same custom label.

### Stale projection — agreed

- During reconnect or incompatibility, Spaces and Panes continue to render the retained stale snapshot.
- Each affected View shows one compact View-level message: `Reconnecting — showing last known state` or the corresponding incompatible-state copy. Rows are not individually decorated as stale.
- Local Space selection remains available against the readable stale projection because it changes only this VS Code navigation context.
- Server-side mutations and control remain unavailable unless Session authority is `connected`. Issue #13 adds no such server action, but its semantic feature states expose connected-versus-stale authority so later menus cannot mistake readable data for mutable authority.
- A fresh snapshot preserves the local selection if that Space still exists. If not, the model chooses the fresh server-focused Space, then the first server Space, then none.
- Without a connected or retained stale projection, both Views show an appropriate View-level state message and no server rows.

## Detailed architecture

### Feature boundaries and dependency direction

Issue #13 introduces a top-level `Navigation` feature alongside `Sessions`:

```text
HerdrExtension
├── SessionsFeature
│   └── SessionsModel              authoritative connection/projection owner
└── NavigationFeature
    ├── NavigationContextModel     shared local navigation-context owner
    ├── SpacesFeature
    │   ├── SpacesModel            derived Spaces state
    │   └── Spaces View
    └── PanesFeature
        ├── PanesModel             derived Panes state
        └── Panes View
```

The dependency direction is:

```text
SessionsFeature
  exposes ActiveSessionProjectionSource
                    ↓ injected by HerdrExtension
         NavigationContextModel
              ↙             ↘
       SpacesModel       PanesModel
            ↓                ↓
       Spaces View       Panes View
```

Neither top-level feature imports the other's implementation. `HerdrExtension` constructs Sessions first, obtains its narrow projection capability, and injects that capability into Navigation. This is the nearest common composition owner required by the canonical architecture.

### Cross-feature capability

Navigation does not need the Session catalog, configuration, retry operations, persistence, endpoint, or connection object. The shared repository capability therefore exposes only the active navigation projection:

```ts
type ActiveSessionProjectionState =
  | { kind: "unavailable"; sessionId?: string }
  | { kind: "connected"; sessionId: string; snapshot: HerdrSessionSnapshot }
  | {
      kind: "stale";
      sessionId: string;
      reason: "reconnecting" | "incompatible";
      snapshot: HerdrSessionSnapshot;
    };

interface ActiveSessionProjectionSource {
  getActiveSessionProjection(): ActiveSessionProjectionState;
  onDidChangeActiveSessionProjection(
    listener: (state: ActiveSessionProjectionState) => void,
  ): Disposable;
}
```

`SessionsFeature` implements this provider-neutral capability directly over its private `SessionsModel`; it does not create another mutable projection or expose the model. `HerdrExtension` passes the feature under the `ActiveSessionProjectionSource` interface, so Navigation can access only this narrow surface. The capability deliberately describes what Sessions provides rather than naming Navigation as its consumer. It belongs under `src/capabilities/sessions/` because its provider and consumer are sibling top-level features whose common owner is the extension root.

### Navigation state and ownership

`NavigationContextModel` owns one discriminated `NavigationContextState` that combines projection freshness, Session identity, the immutable snapshot reference, and local selected Space:

```ts
type NavigationContextState =
  | { kind: "unavailable"; sessionId?: string }
  | {
      kind: "connected";
      sessionId: string;
      snapshot: HerdrSessionSnapshot;
      selectedSpaceId?: string;
    }
  | {
      kind: "stale";
      sessionId: string;
      reason: "reconnecting" | "incompatible";
      snapshot: HerdrSessionSnapshot;
      selectedSpaceId?: string;
    };
```

The union prevents an unavailable context from carrying a selected Space. For a readable connected or stale context, `selectedSpaceId` is absent only when there are no Spaces or identifies a Space in that snapshot.

A new Session identity resolves selection from server focus, then the first Space in server order, then none. Updates for the same Session retain a valid local selection. If that Space is removed, the same selection-resolution rule chooses a valid replacement. Connected-to-stale and stale-to-fresh transitions preserve a still-valid local choice. Server-focus changes within the same Session never override it.

Navigation exposes feature-local `NavigationContextSource` and synchronous `SpaceSelectionOperations.selectSpace(spaceId)`. Selection accepts only an ID in the current readable snapshot and changes only Navigation context. Every projection/selection reconciliation completes before publication. No persistence capability, socket access, focus request, event bus, or generic navigation service is introduced.

### Navigation feature composition

`NavigationFeature` is the composition and lifecycle owner for the shared context model and its `Spaces` and `Panes` child features. It passes each child only parent-owned capability interfaces and contains no projection, selection, or row-derivation policy itself.

Proposed feature structure:

```text
src/features/navigation/
├── index.ts
├── NavigationFeature.ts
├── NavigationContextModel.ts
├── NavigationContextModel.test.ts
├── capabilities/
│   └── index.ts
├── spaces/
│   ├── index.ts
│   ├── SpacesFeature.ts
│   ├── SpacesModel.ts
│   ├── SpacesModel.test.ts
│   └── view/
│       ├── index.ts
│       └── VsCodeSpacesView.ts
└── panes/
    ├── index.ts
    ├── PanesFeature.ts
    ├── PanesModel.ts
    ├── PanesModel.test.ts
    └── view/
        ├── index.ts
        └── VsCodePanesView.ts
```

`features/navigation/index.ts` exports only the production composition surface required by `HerdrExtension`. The child entries are visible to their parent, not repository-wide. Parent-local context and selection contracts stay under `navigation/capabilities/`; tests may import their implementation under test directly.

### Child models and Views

`SpacesModel` and `PanesModel` independently consume the same `NavigationContextSource`. Each reads the same immutable snapshot reference plus the already reconciled `selectedSpaceId` and computes its own semantic state. Neither child caches, clones, patches, or separately subscribes to the Sessions projection.

The child models do not store independent mutable domain state. Their `getState()` derives current state from the context; context changes invalidate their subscribers. This obeys the rule that derived state is computed rather than copied into another mutable store.

`SpacesModel` exposes `unavailable | connected | stale` state. Readable states contain server-ordered entries that reference the original readonly `HerdrSpace` records and add only a `selected` flag. Pane count, label, and aggregate Agent status remain server data. `SpacesFeature` owns `herdr.selectSpace` registration and invokes the parent-provided `SpaceSelectionOperations`; its View renders only `SpacesModel` state.

`PanesModel` exposes `unavailable | no-space | ready` state with freshness and stale reason where readable. It filters by selected Space, joins Herdr Tabs/Panes/Agents by server IDs, applies grouping, singleton flattening, and naming policy, and retains readonly source `HerdrSpace`, `HerdrTab`, and `HerdrPane` records rather than copying their fields. It adds only feature semantics such as resolved Pane name, singleton identity, and group structure. `PanesFeature` owns its View and current/future Pane navigation command surface; issue #13 registers no Pane-opening or mutation command.

Views own VS Code TreeItem construction, copy placement, icons, tooltips, accessibility, View-level stale messages, event emitters, and host registrations. They do not understand Session state variants or derive hierarchy from raw snapshots.

### Commands and manifest

`package.json` contributes `herdr.spaces` and `herdr.panes` to the existing Herdr Activity Bar container and declares `herdr.selectSpace`. `SpacesFeature` registers and disposes that command because it owns the selection intent. No Pane-opening, rename, split, layout, or close command is added.

### Lifecycle and failure behavior

`HerdrExtension` constructs Sessions before Navigation. Navigation immediately reads the current `unavailable` state and subscribes; the existing asynchronous `SessionsFeature.initialize()` later publishes discovery/connection state through that source. Navigation needs no initialization phase. `HerdrExtension` disposes Navigation before Sessions so no consumer remains after the projection provider is released.

Navigation constructors remain lightweight and synchronous: they create owned objects, attach non-throwing internal listeners, and register their host resources. Navigation has no separate `initialize()` because it owns no asynchronous startup. It adds no local rollback arrays, constructor recovery state, or `try/catch` scaffolding solely for duplicate registration/programming errors; such errors fail activation loudly.

Successfully constructed objects retain their disposables and use idempotent ordinary disposal. `NavigationFeature` disposes Panes, then Spaces, then the context model. Each child disposes host inputs and Views before its derived model subscription. Navigation never mutates Herdr-owned resources.

A stale or late connection callback remains rejected by `SessionsModel` before crossing the capability. Navigation performs only synchronous reconciliation against complete immutable projections, so it cannot publish partial hierarchy state.

## Verification design

Tests cover current observable contracts and realistic lifecycle transitions, not hypothetical resilience to programming errors.

- Narrow Sessions projection-capability tests cover connected, retained-stale, and unavailable derivation.
- `NavigationContextModel` tests cover initial selection resolution, explicit local selection, retention while the same Session and Space remain readable, replacement when the selected Space is removed, reset on Session replacement, stale-context retention, rejection of an ID absent from the current readable snapshot, and unsubscription on disposal.
- `SpacesModel` tests cover server order, selected identity, Pane counts, aggregate Space Agent status, and connected/stale/unavailable state.
- `PanesModel` tests cover selected-Space filtering, server Tab/Pane order, multi-Pane grouping, singleton flattening, stable server identity, agreed naming precedence, and readable/stale/unavailable state.
- Focused View/Extension Host tests cover View registration, Space-selection routing and Panes refresh without Herdr focus mutation, initial group expansion, View-level stale messages, relevant final TreeItem presentation, and registration cleanup.
- Existing Session bootstrap/reconnect tests continue proving snapshot authority and stale-callback rejection; #13 does not duplicate transport tests.

Feature-internal subscriptions are non-throwing contracts. Issue #13 adds neither per-subscriber exception isolation nor tests for one subscriber throwing while later subscribers continue. It also does not test private call order, hypothetical duplicate-registration failures, or structural facts such as the absence of a second mutable snapshot cache; those are enforced by ownership, types, and review.

Repository scripts remain the source of truth for final validation.

## Expected source changes

- `src/capabilities/sessions/`: narrow `ActiveSessionProjectionSource` contract exported through the existing repository capability entry.
- `src/features/sessions/`: expose the derived active-Session projection capability from the feature boundary without adding selected-Space state or Navigation-specific methods to `SessionsModel`.
- `src/features/navigation/`: new parent context model, Spaces/Panes child features and models, local capabilities, Views, and focused tests.
- `src/extension/HerdrExtension.ts`: construct Sessions before Navigation, retain the existing Sessions async initialization, and dispose Navigation before Sessions.
- `package.json`: native Spaces/Panes View and local select-Space command contributions.
- Focused Extension Host tests for observable registration/rendering behavior.

Herdr infrastructure, protocol decoders, connection topology, Session persistence, and terminal features are expected to remain unchanged.

## Implementation shape

After approval, use one bounded implementation slice because the new feature, cross-feature capability, both Views, extension composition, command registration, and manifest form one connected navigation seam. The worker must follow `implement-slice`, may read but not edit this design directory, and must report any contradiction instead of changing the approved architecture. Parent reconciliation and the separate completion/review process follow.

## Approval

The user explicitly approved the product decisions and detailed architecture on 2026-09-21, initially without implementation. On 2026-09-21 the user separately authorized implementation; the approved design remains the implementation boundary.
