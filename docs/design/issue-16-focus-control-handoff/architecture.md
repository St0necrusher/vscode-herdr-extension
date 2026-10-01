# Issue #16 — focus-driven direct-attach handoff

**Status: implemented. This document describes the final design after the 2026-09-26 simplification refactoring ([`simplification-audit.md`](simplification-audit.md), slices S1–S8).** Implementation history and commits are in [`progress.md`](progress.md). Alternatives that were considered and rejected (webview terminal, custom renderer, Herdr changes, dropping Selection/FocusTracker) are in [`alternatives-discussion.md`](alternatives-discussion.md).

Requirements: [#16](https://github.com/St0necrusher/vscode-herdr-extension/issues/16), parent [#9](https://github.com/St0necrusher/vscode-herdr-extension/issues/9), completed prerequisite [#14](https://github.com/St0necrusher/vscode-herdr-extension/issues/14). Follow-ups #26, #27, #28 and #29 remain excluded. Architecture authority: [`code-architecture.md`](../../architecture/code-architecture.md). Evidence: [`research.md`](research.md), the direct-attach prototype at `655c1a9:prototype/direct-attach-handoff/`, and [`s7-arrow-spike-findings.md`](s7-arrow-spike-findings.md).

## Product boundary

A native VS Code terminal editor shows one Herdr Pane. A visible editor in the focused window uses official interactive Herdr direct attach under an extension-owned real PTY. A visible editor that cannot own input uses a semantic read-only observer. An editor hidden behind another VS Code tab runs neither client. Handoff releases only extension-owned processes and resources; it never recreates, stops, or closes the server-owned Pane, PTY, process, or Agent.

## Acceptance boundary

The full acceptance criteria remain in #16. The requirements that shape the design:

- one logical surface per `(Herdr Session, current public Pane ID)`;
- mutable `terminal_id` routing reconciled from the authoritative Session projection;
- correlation of each extension-created native terminal to its runtime VS Code `Tab` through a temporary `(Session ID):(Pane ID)` terminal name, followed by object identity;
- independent eligibility for every selected Pane tab in every rendered editor group of the focused VS Code window;
- official `herdr terminal attach <terminal_id> --takeover` under extension-owned `node-pty`;
- input written directly to the created PTY, whose native queue provides buffering; no Surface-owned input buffer, first-output gate, or Herdr attach acknowledgment;
- bounded `SIGTERM` then `SIGKILL` cleanup; a stopping observer may overlap an attach and a stopping attach may overlap an observer, but two extension-owned attaches never coexist;
- no automatic fight-back after displacement by another client's `--takeover`;
- cleanup limited to extension-owned observers, PTYs, subscriptions, and VS Code resources.

## Exclusions

- Same-focus mobile popup/plugin/IPC Yield (#26). Selection and FocusTracker are kept as the signal it will consume.
- Strong positive readiness or delivery protocol, including first-input guarantees (#27).
- Durable editor restoration (#28).
- Kitty keyboard flags leaking across attach handoff (#29, investigation).
- Installed-VSIX/native distribution matrix, remote hosts, Linux, and Windows.
- Inactivity release, grace periods, forced terminal modes, custom renderer/webview, upstream Herdr changes, and routine Retry/Take Control UI.

## Owners and data flow

All owners live in `src/infrastructure/pane-editors/` and are composed only by `HerdrExtension`.

```text
src/infrastructure/pane-editors/
  PaneEditorSelectionModel.ts     actual activeTab Pane editors; written only by the Manager
  PaneEditorFocusTracker.ts       Selection × window focus → per-Pane visibility events
  PaneTerminalSurfaceManager.ts   VS Code tabs, registry, placement, pane.moved, context key
  PaneTerminalSurface.ts          Pseudoterminal adapter, facts, client state, converge(), input translation
  paneClientPolicy.ts             pure desiredClient()
  paneTarget.ts                   pure paneTarget(), paneName(), placeholder texts
  HerdrPaneObserver.ts            one read-only observer process
  HerdrPaneAttach.ts              one node-pty direct-attach process
  stopWithEscalation.ts           shared SIGTERM → SIGKILL escalation
  HerdrPaneClientFactory.ts       executable and static attach config for process creation
  PaneOutputSink.ts               process-to-Surface output contract
  index.ts                        exports needed by HerdrExtension
```

```text
Navigation ── openPane ──► PaneTerminalSurfaceManager ◄── pane.moved ── SessionsFeature
VS Code onDidChangeTabs ──►        │
                                   ├─ select / deselect / move ──► PaneEditorSelectionModel
                                   │                                       │
                                   │                     PaneEditorFocusTracker ◄── window focus
                                   │                                       │ visibility
                                   └─ create / reveal / move / showPaneName / dispose
                                                                           ▼
SessionsFeature ── active-Session projection ─────────────────► VsCodePaneTerminalSurface
                                                                 ├─ HerdrPaneObserver
                                                                 └─ HerdrPaneAttach
```

The flow has one direction. The Manager is the only `pane.moved` handler in `pane-editors/` and the only Selection writer. Selection does not drive creation; it reflects which bound Pane tabs are currently `activeTab` in some editor group. FocusTracker combines that with window focus. The Surface consumes FocusTracker and the projection and never looks at editor groups.

## Selection

`PaneEditorSelectionModel` holds the set of `SelectedPaneEditor = { sessionId, paneId }` identities whose VS Code editor is `activeTab` in some group. It has no Herdr or VS Code dependency.

- `select` adds and publishes `selected`; `deselect` removes and publishes `deselected`; both are idempotent.
- `move(previous, current)` replaces a selected identity and publishes `moved`; an unselected `previous` is ignored.
- Selections from several Sessions may coexist; the active Session does not filter Selection.
- `dispose` releases listeners without publishing synthetic events.

Selection exposes events only, no state getter. `HerdrExtension` therefore constructs FocusTracker immediately after Selection, before anything can write to it.

## Focus tracker

`PaneEditorFocusTracker` publishes, per subscribed identity, `Pane is in Selection × VS Code window is focused` as a discriminated union:

```ts
type FocusChangeEvent =
  | Readonly<{ focused: true; reason: "window-focused" }>
  | Readonly<{ focused: false; reason: "editor-hidden" }>
  | Readonly<{ focused: false; reason: "window-blurred" }>;
```

A subscription synchronously receives the current event, then deduplicated transitions. On Selection `moved` the tracker updates membership only; existing subscriptions stay bound to their old identity. Each consumer re-subscribes for the new identity and receives the current state. The tracker owns no terminal or popup policy, so #26 can consume the same signal.

## Manager

`PaneTerminalSurfaceManager` implements the `PaneTerminalOpening` capability and owns the registry of Surfaces keyed by `(Session, Pane)`, their runtime `vscode.Tab` bindings, and placement.

**Open.** `openPane(request)`:

- an existing Surface whose bound tab is `activeTab` in any group: no-op;
- an existing Surface otherwise: `reveal()` in its current group, without moving it;
- no Surface: create it in the captured `activeTabGroup.viewColumn` and reveal it.

The last two paths end with tab reconciliation, which updates Selection. Multi-Pane Herdr Tab intents and open-to-side are not supported. Moving an existing Pane tab between editor groups preserves its Surface and is reconciled as described below.

**Tab binding.** VS Code exposes no `Terminal`-to-`Tab` reference. The Surface creates its terminal without the `name` option and publishes the exact temporary name `${sessionId}:${paneId}` through `onDidChangeName` when the Pseudoterminal opens; omitting `name` avoids VS Code's API title lock, which would ignore later process-name updates. Reconciliation finds the `vscode.Tab` whose input is `TabInputTerminal` and whose label equals that name, stores that `Tab` object as the binding, and calls `surface.showPaneName()` to replace it with the Pane title. The name is bootstrap evidence; after binding, object identity is authoritative until that tab disappears. If VS Code replaces the tab while moving it between groups, the Surface publishes the temporary name again; reconciliation binds the replacement tab and calls `showPaneName()` again. No checks exist for pre-existing labels, multiple matches, or collisions: one Surface per identity with one creation makes them impossible. An unmatched Surface stays unbound until a later tab change.

**Reconciliation** runs on `openPane` and `onDidChangeTabs`. A bound Surface is selected when `group.activeTab === binding` in any group; `group.isActive` and `activeTerminal` are not selection filters. When a bound tab disappears, the Manager attempts to find a replacement by the temporary name. If none is found, it deselects the Surface and asks it to publish that temporary name again. This allows the subsequent tab-change event to bind a replacement created with the Pane title. The Surface is disposed when its terminal closes, not when its tab closes; the Herdr Pane stays alive, and a later open after terminal closure creates a fresh Surface. The close signal is `Pseudoterminal.close()`, not `onDidCloseTerminal`: when a tab closes after a group move, VS Code closes the terminal and calls `close()` but never fires `onDidCloseTerminal`, and it keeps listing the closed terminal in `window.terminals`.

**Move.** On normalized `pane.moved` for a managed identity, the Manager in one method re-keys the registry, calls `selection.move(previous, current)`, then `surface.move(currentPane)`. It relies on Herdr's invariant that the destination identity is unoccupied.

**Arrow-key context.** The Manager sets the context key `herdr.activeTerminalIsPane` through `setContext` at construction, on `onDidChangeActiveTerminal`, and after tab changes. It is true when `window.activeTerminal` is the terminal of a managed Surface (see [Input](#input)).

## Surface

`VsCodePaneTerminalSurface` adapts one Pane to a VS Code `Pseudoterminal`. Its state is a small set of facts plus one client state:

```text
host resources: terminal, writeEmitter, nameEmitter, projectionSubscription, focusSubscription
facts:          selection {sessionId, paneId}, projection, movedPane, visibility, host, attachIntent
client:         PaneClientState, stoppingAttach: Promise<void> | undefined
presentation:   visiblePlaceholder, publishedName, paneNameVisible, applicationCursor
lifecycle:      disposed
```

```ts
type PaneEditorVisibility = "hidden" | "blurred" | "focused";      // from FocusChangeEvent.reason
type AttachIntent = "wanted" | "displaced" | "failed";
type PseudoterminalHost = { kind: "closed" } | { kind: "open"; dimensions: TerminalDimensions | undefined };
type PaneClientState =
  | { kind: "idle" }
  | { kind: "observing"; observer; request; resizeTimer }
  | { kind: "observer-failed" }
  | { kind: "attached"; attach; request };
```

`stoppingAttach` is the only Promise field.

### Target

The pure `paneTarget(projection, selection, movedPane)` returns either `live` with the current `HerdrPane` or `suspended` with a placeholder text. A Pane is live only when the projection is `connected`, its Session ID equals the Surface Session, and the Pane ID is in the snapshot, or equals `movedPane`. The Surface opens no other Session connection and runs no `pane get`. Editors from other Sessions stay suspended until their Session becomes active; a restored Session supplies fresh `terminal_id`s through the same projection.

Placeholders (`SCREEN_RESET` plus text) cover: another Session active (“Herdr Pane is not connected”), `stale` reconnecting (“Herdr Pane is reconnecting”), `stale` incompatible (“Herdr Pane cannot connect”), connected without the Pane (“Herdr Pane is unavailable”), and observer failure. Live output clears a visible placeholder.

A live `pane.moved` keeps the server terminal and `terminal_id`. `move(pane)` stores the complete current Pane as `movedPane` so the Surface stays live before the next snapshot arrives; the next projection update clears it. If an older snapshot arrives first, a brief placeholder and client restart are accepted.

### Policy and `converge()`

The pure `desiredClient(facts)` in `paneClientPolicy.ts`:

| Condition | Desired client |
| --- | --- |
| target not live, `hidden`, or no dimensions | none |
| `focused` and intent `wanted` | attach |
| otherwise (`blurred`, or `focused` with intent `displaced`/`failed`) | observe |

Every event handler only updates facts and calls `converge()`:

| Event | Fact update |
| --- | --- |
| focus event | `visibility`; entering `focused` sets intent `wanted` |
| `move(pane)` (Manager) | `selection.paneId`, `movedPane`, re-subscribe FocusTracker, publish name |
| projection change | `projection`, clear `movedPane`, publish name |
| `open(dimensions)` | `host = open`, publish name |
| `setDimensions` | `host.dimensions`; an observing client restarts its 120 ms resize timer |
| observer resize timer | release the observer |
| attach completion (current) | `client = idle`, intent `displaced` |
| observer completion (current) | `client = observer-failed` |
| stopping attach settles | `stoppingAttach = undefined` |

Focus, move, projection, open, and dimension events also clear `observer-failed`, which is the only observer retry path; there is no retry timer.

`converge()` is synchronous. It computes the desired client and, if the current client does not satisfy it, releases the current client and starts the desired one. Then it renders the placeholder.

- `none` is satisfied by `idle`; `observe` by `observing` on the same Session and terminal, or by `observer-failed`; `attach` by `attached` on the same Session and terminal, which resizes the PTY immediately when dimensions differ.
- Releasing an observer clears its timer and calls `stop()` without awaiting it. Releasing an attach stores `stoppingAttach = attach.stop().then(converge)`.
- A new attach is not started while `stoppingAttach` exists; the settle callback converges again. A new observer may start at once.
- Attach creation failure logs, sets intent `failed`, and converges again, which selects the observer.
- Completions, sinks, and the resize timer act only when their client is still `this.client` and the Surface is not disposed. This is the only staleness check.

### Displacement and intent

An unexpected attach exit may be another desktop client's `--takeover`; Herdr and `node-pty` cannot distinguish it from a local failure. The Surface sets intent `displaced` and observes while visible. It reattaches only after fresh local intent: a new focus transition or local input. Future #26 Yield will use the same intent.

### Input

`handleInput` first translates arrow keys (see below), then:

- with an attached client, writes to the PTY at once;
- otherwise, when `focused` and intent is not `failed`, sets intent `wanted`, converges, and writes to the new attach;
- if that attempt failed, shows one warning: “Could not attach to this Herdr Pane. See the Herdr output for details.” Further input does not retry until a new focus transition.

Input that arrives while an earlier attach is still stopping is dropped; stronger first-input guarantees belong to #27.

**Arrow keys and the mouse wheel.** The attach client enables the alternate screen. Without mouse reporting, xterm.js turns wheel scrolling in the alternate screen into bare `↑`/`↓` sequences, so the wheel would scroll shell history. To tell them apart:

- `package.json` binds `up`/`down` with `when: terminalFocus && herdr.activeTerminalIsPane && !terminalFindFocused` to `workbench.action.terminal.sendSequence` with the markers `\e]herdr;arrow-up\a` / `\e]herdr;arrow-down\a`. An extension-owned command does not work: xterm.js only lets a key reach the keybinding service for commands in `commandsToSkipShell`.
- An input chunk equal to a whole marker becomes `\e[A`/`\e[B`, or `\eOA`/`\eOB` when DECCKM is on. The Surface tracks DECCKM from attach output (`\e[?1h` / `\e[?1l`, last one in a chunk wins).
- An input chunk made only of bare arrows can then only be wheel emulation and becomes SGR wheel events `\e[<64;1;1M` / `\e[<65;1;1M`. Herdr's attach client handles them: it scrolls Herdr scrollback or forwards the event to a program that requested the mouse.
- Everything else passes through unchanged. Programs that request mouse reporting (Pi, Claude Code, Codex) get real wheel events from xterm.js and are unaffected.

### Resize

The Surface waits for real dimensions from `open` or the first `setDimensions`; there is no fallback size. A live attach resizes immediately through `converge()`. An observer cannot resize in place: each dimension change restarts a 120 ms debounce, after which the observer is released and a new one starts with the latest dimensions. Hidden or suspended Surfaces only store dimensions.

### Name

The tab name is the raw `pane.terminalTitle`, falling back to `Pane <paneId>`. Spaces become no-break spaces because VS Code cuts a process title at the first space. A title starting with `/` would show only its basename; this is known and not handled. After `showPaneName()` the Surface publishes the name through `Pseudoterminal.onDidChangeName`; while suspended it keeps the last published name.

### Dispose

`dispose()` is idempotent: it sets `disposed`, releases the client (a pending `stoppingAttach` settle then does nothing), and disposes subscriptions, the terminal, and emitters. It is called when the terminal closes; `terminal.dispose()` is safe after VS Code has already closed it.

## Processes

The Surface creates processes through `HerdrPaneClientFactory` and passes a `PaneOutputSink` (`append`, `replace`). Creation starts the process synchronously and may throw. Each process object exposes one `completion` Promise that always resolves and an idempotent `stop()` that returns the same cleanup Promise. There is no output subscription, `dispose`, or shared base class.

- `HerdrPaneObserver`: `herdr [--session <id>] terminal session observe <terminal_id> --cols <n> --rows <n>` under `child_process`, decoded into `replace`/`append`. Stop waits 500 ms after `SIGTERM` and at most 250 ms after `SIGKILL`.
- `HerdrPaneAttach`: `herdr [--session <id>] terminal attach <terminal_id> --takeover` under `node-pty` (`xterm-256color`), with `sendInput` and `resize`. Stop waits 1,000 ms after `SIGTERM` and at most 350 ms after `SIGKILL`.
- `stopWithEscalation` implements both escalations. No `Ctrl+B q`, stdin command, or protocol acknowledgment is used.

Direct attach uses exactly `node-pty@1.2.0-beta.13`, kept external to the bundle; the published `1.1.0` macOS arm64 spawn-helper is non-executable after an ordinary install. The attach process receives `HERDR_CONFIG_PATH` pointing to the packaged `resources/herdr-direct-attach.toml` (`[ui]\nmouse_capture = false\n`). `HerdrExtension` resolves the path from `ExtensionContext` and injects it into the factory; Surface requests do not know it.

## Composition

`HerdrExtension` constructs `SessionsFeature`, Selection, FocusTracker immediately after Selection, `HerdrPaneClientFactory`, the Manager with a factory for `VsCodePaneTerminalSurface`, and finally Navigation, which receives the Manager as `PaneTerminalOpening`. Disposal runs in reverse: Navigation, Manager (which disposes every Surface), FocusTracker, Selection, Sessions, logger. The #16 constructors have no rollback scaffolding, per `code-architecture.md` Lifecycle.

## Verification

Automated coverage (testing phase, [`testing-handoff.md`](testing-handoff.md)):

- `src/infrastructure/pane-editors/PaneTerminalSurface.test.ts` (vitest, minimal local `vscode` mock, real Selection and FocusTracker, fake `PaneClientFactory`): client choice by visibility, focus and dimensions; no overlapping attaches; displacement without fight-back; attach failure with one warning; arrow markers, DECCKM and wheel translation; projection routing and placeholders; observer resize debounce and failure; dispose.
- `test/integration/pane-editors/HerdrPaneAdapters.test.ts` (fake `herdr` executable, real `node-pty`): observer and attach arguments, output decoding, input, resize, exit, and `SIGTERM` → `SIGKILL` escalation.
- `test/extension/pane-editors.test.ts` (VS Code extension host): open, tab binding and title, hide and reveal, cross-group move, close and reopen. It assumes the test window is focused.

Deliberately not tested: the pure helpers in isolation (they run inside the Surface and extension tests), exact placeholder texts, the `herdr.activeTerminalIsPane` context key and keybindings, multiple windows, and end-to-end runs against a real Herdr. The manual Extension Development Host check in [`simplification-audit.md`](simplification-audit.md) §7 covers real Herdr behavior.
