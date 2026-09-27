# Issue #26 — mobile takeover popup

**Status: approved by the owner on 2026-09-27; implementation authorized (orchestrated slices).**

Requirements: [#26](https://github.com/St0necrusher/vscode-herdr-extension/issues/26). Builds on #16 ([`../issue-16-focus-control-handoff/architecture.md`](../issue-16-focus-control-handoff/architecture.md)). Architecture authority: [`code-architecture.md`](../../architecture/code-architecture.md). Evidence: prototype `655c1a9`, spike [`spike-tap-signal.md`](spike-tap-signal.md) (`spike/issue-26-tap-signal` @ `b44966f`). Decisions log: [`progress.md`](progress.md).

## Product boundary

While VS Code directly attaches a Pane that Herdr currently shows (its server-wide focused Pane) and the VS Code window is focused, the extension shows a full-screen Herdr plugin popup to every Herdr TUI client (phone, desktop TUI). The popup mirrors the Pane under a one-line banner, "Hold to continue here · VS Code has this Pane". **Any input into the popup** (key, mouse press, wheel) immediately asks VS Code to Yield and closes the popup. VS Code then releases only its attach and observes. The phone takes input and geometry. The first genuine local VS Code input or focus transition reattaches, and a fresh popup is offered.

## Decisions

| # | Decision |
| --- | --- |
| D1 | Offer iff: Surface client is `attached` ∧ visibility `focused` ∧ target live ∧ `snapshot.focusedPaneId === paneId`. At most one Pane per Session qualifies. |
| D2 | Popup runtime: `node` from the Herdr server's PATH. Nothing is tied to VS Code's Electron. |
| D3 | Surface: full-screen (`100%`) `popup` placement, mirroring the Pane with a visible one-line banner. `overlay` is rejected because it steals server focus. The no-UI signal is infeasible. |
| D4 | Any key, mouse press or wheel in the popup is a confirm. Focus reports and resizes are not. There is no confirmation dialog and no ack wait. The popup sends `confirm` and exits at once. |
| D5 | Only the popup's own process closes the popup: on `retract`, owner socket close, heartbeat loss, or confirm. The extension never calls `popup.close` or `plugin.pane.close`, so it never needs a popup `pane_id` (the CLI does not return one). |
| D6 | Yield reuses #16 `attachIntent = "displaced"`. The attach is released, the Surface observes, and it reattaches only on local input or a new focus transition. No new reacquire logic. |
| D7 | VS Code focus loss, or selecting another editor tab, retracts the popup (follows from D1). |
| D8 | The focus part of D1 (tab selected ∧ window focused) comes from `PaneEditorFocusTracker` through the Surface's existing `visibility`. The tracker alone is not sufficient: after Yield it still reports `focused`, so a tracker-only owner would re-offer immediately. The attach fact and the Yield target belong to the Surface. |
| D9 | Install and remove are explicit commands (`Herdr: Install Mobile Takeover Plugin` / `Herdr: Remove Mobile Takeover Plugin`). There is no setting. A missing plugin degrades silently: no offers, one log line, no user-facing error. |
| D11 | The host *maintains* the popup while an offer is current, rather than fire-and-forget. An offer is "shown" once its popup sends `hello`. If opening fails for any reason (including `ui_busy` and an unreachable server), no `hello` arrives within 5 s, or the popup connection closes without `confirm` or `retract`, the host reopens after 1, 2, 4 and 8 s. After the last attempt it gives up for that offer. The budget is per offer and is **not** reset by `hello` (amended 2026-09-27 during reconciliation: a reset let a popup that connects and then exits at once, for example because it lost its Herdr socket, reopen every second forever). A new attach generation starts a new offer with a fresh budget. This one rule covers `ui_busy`, a popup killed by Herdr, and a Herdr restart or handoff while VS Code stays attached. |
| D12 | Amendment (2026-09-27, owner allowed departing from the documented architecture where it helps). The plugin's install and remove commands live with their state owner, `TakeoverPluginRegistration` in `pane-editors/takeover/`. It registers and disposes them itself. There is no separate feature and no `MobileTakeoverPluginInstallation` capability: they would only forward two calls. This knowingly departs from the `code-architecture.md` rule that only features register commands. The responsibility map records the exception: `pane-editors` already owns VS Code host behavior, so it is a host-facing module rather than pure infrastructure. |
| D13 | Amendment (2026-09-27, owner-chosen during E2E; revised to click only). This extends D6. A non-wheel mouse press inside a displaced Pane editor counts as local intent. The reason: after a Yield the VS Code window and terminal usually stayed focused, so a click into an already-focused xterm produces no VS Code event and no input. While the Surface observes with intent `displaced` (after a Yield or another client's takeover), it enables SGR mouse (1000+1006) on its own xterm. It re-emits the mode after every `SCREEN_RESET` (full observer frame, placeholder) and turns it off when the Surface leaves that state. In `handleInput` while displaced, a non-wheel press sets intent `wanted`, converges, and is not forwarded. Wheel events, releases, focus reports and bare arrows (wheel emulation) are ignored. Keyboard input takes the existing #16 path. Focus reporting (1004) was tried and dropped: xterm.js answers DECSET 1004 with the current focus at once, so re-enabling it after each reset produced a synthetic `\e[I` that reattached immediately and the phone could not keep the Pane. Accepted cost: while displaced, the first click does not start a selection and the wheel does not scroll the observer. |
| D14 | Amendment (2026-09-27, owner decision during E2E). A keyboard confirm in the popup is also delivered to the Pane. The popup writes the raw keystroke bytes through the Herdr socket `pane.send_text {pane_id, text}`, then sends `confirm`. Mouse and wheel confirms are not forwarded. Herdr does not lock input under `--takeover`, so the text reaches the Pane while VS Code still holds geometry. This supersedes the exclusion "Forwarding the confirming input to the Pane". |
| D15 | Known limitation: Herdr 0.9.0 always draws a one-cell border and a title around plugin popups. The owner does not want an upstream request. |
| D10 | The mirror shows the visible screen only (`pane.read source=visible`). There is no mirror scrolling, because any wheel event is a confirm. |

## Modules and responsibilities

```text
HerdrExtension (composition)
  ├─ pane-editors/                                               │
  │    VsCodePaneTerminalSurface ── offer / retract ──► takeover/TakeoverPopupHost
  │         ▲ onConfirm(yield current attach)                    │  owner socket, token, heartbeat,
  │         │                                                    │  `herdr plugin pane open`, ui_busy retry
  │         └──────────────────── confirm ◄──────────────────────┤
  │                                                              ▼
  │                                   takeover/TakeoverPluginRegistration (commands install/remove, copy, link/unlink, registered?)
  └─ (Herdr server) ── spawns ──► herdr-plugin/ popup process
                                    ├─ owner socket client (hello token, alive, retract, confirm)
                                    └─ Herdr socket (HERDR_SOCKET_PATH): pane.read visible/ansi → mirror
```

- **Surface** (existing, changed) owns the offer *decision*, because it is the invariant owner of the attach (the "generation" is its current `AttachedClient` object) and already holds every fact in D1. It revalidates on confirm.
- **`TakeoverPopupHost`** (new, one per extension host) owns the mechanism: the Unix socket server, per-offer tokens, heartbeat, popup launch through the Herdr CLI, and the bounded `ui_busy` retry. It holds at most one current offer. It has no Pane policy.
- **`TakeoverPluginRegistration`** (new, pane-editors/takeover) owns the global Herdr plugin registration and the `registered` fact. At activation it reads `herdr plugin list --json`. When our plugin is registered, it refreshes the copied files if the packaged version differs. It registers the Install and Remove commands and shows their result messages (D12). The host asks it whether offering is possible.
- **`herdr-plugin/`** (new, repo root, outside `src/`) holds the popup program and the manifest. It knows nothing about VS Code beyond the owner-socket protocol.
- Placement: everything VS Code-side stays inside `src/infrastructure/pane-editors/takeover/`, including the two commands (D12). No new capability or feature.

## Domain model

- **Takeover offer** (value, transient): `{ sessionId, paneId, token, onConfirm }`. It exists only while D1 holds for the Surface's current attach. It is not persisted, and a restart cannot resurrect it (new socket path and new token).
- **Offer generation** is identity of the Surface's `AttachedClient`. A confirm is honoured only if `this.client` is still that object and D1 still holds.
- **Popup** is a Herdr-owned UI resource running our process. It is not a Pane: it is not in the snapshot and does not change `focused_pane_id`.
- No change to `CONTEXT.md` terms; "Yield" and "takeover" are already the issue's vocabulary.

## Data flow

**Primary.**
1. The user types in a VS Code Pane editor, so the Surface is attached and focused. Herdr's `focusedPaneId` is that Pane.
2. The Surface's `converge()` sees D1 true and no current offer for this attach. It calls `host.offer({ sessionId, paneId, onConfirm })`.
3. The host creates a token, starts listening (lazily, socket `0600` in the per-user tmpdir), and runs `herdr --session S plugin pane open --plugin <id> --entrypoint takeover --env HERDR_VSCODE_TAKEOVER_SOCKET=… --env …_TOKEN=… --env …_PANE=<paneId>`.
4. Herdr starts the popup in every TUI client. The popup connects to the owner socket and sends `hello <token>`. The host replies `alive` every 1 s. The popup polls `pane.read {pane_id, source: "visible", format: "ansi"}` on `HERDR_SOCKET_PATH` and draws the mirror.
5. The phone user long-presses (or types, or scrolls). The popup writes `confirm`, restores terminal modes and exits. Herdr removes the popup.
6. The host validates the connection's token against the current offer and calls `onConfirm()` synchronously.
7. The Surface checks that the client is the offered one and that D1 still holds. It sets intent `displaced` and runs `converge()`: the attach is released (`SIGTERM`…), an observer starts, and the offer is retracted as no longer eligible. When the attach exits, Herdr hands geometry to the phone.
8. Later the user types in VS Code. The #16 input path sets intent `wanted`, reattaches and writes the input. D1 holds again with a new `AttachedClient`, so there is a new offer and a new popup.

**Retract** (D1 turns false: blur, tab switch, Herdr focus moves, attach exits or is displaced, projection not live, Surface disposed). The Surface calls `offer.retract()`. The host invalidates the token and sends `retract` to a connected popup, then closes it; the popup exits. A popup that connects later with a stale token is told `retract`.

**Failures.**
- `ui_busy`, or any other open failure: D11 bounded reopen while the offer is current.
- **Herdr server crashes, stops or restarts.** Our popup process dies with it: its PTY hangs up and its mirror socket to Herdr fails, and the popup exits on either. On the VS Code side the #16 path already reacts. The projection turns `stale` or `unavailable`, the target is suspended, the attach is released or exits, D1 becomes false, and the Surface retracts. After reconnect, a fresh snapshot, reattach and new `AttachedClient` make a new offer. There is no special Herdr-restart code in the takeover layer.
- **Herdr stays up but drops client connections** (live handoff, reload): if the attach survives, the offer is still current, so D11 reopens a popup that exited. If the attach exits, the Surface retracts as above.
- **Active Session switched in VS Code:** the old Session's Surfaces become suspended, the offer is retracted, and the old popup exits on `retract`.
- Extension host crash: the socket closes and the popup exits. Hung host: no `alive` for 3 s and the popup exits. Restart: new socket path and token, and the old popup cannot connect.
- Popup cannot reach the owner socket within 3 s, or loses its Herdr socket (mirror): it exits. The host decides whether to reopen (D11).
- Stale, duplicate or foreign `confirm` (unknown token, retracted offer, second confirm): ignored, connection closed.
- Plugin not registered at activation: the host does not offer, and there is one info log line. Plugin removed externally later: the open command fails; it is logged as a warning for that offer with no retry and no user-facing message. The next `plugin list` (after the Install command or on the next activation) resets the fact.
- Install fails (for example `node` or `herdr` missing, or a link error): the command shows an error message with the reason; nothing half-registered is left behind (copy first, link last).

## Public seams

```ts
// pane-editors/takeover/TakeoverPopupHost.ts
interface TakeoverOffers {
  offer(request: Readonly<{ sessionId: string; paneId: string; onConfirm(): void }>): TakeoverOffer;
}
interface TakeoverOffer { retract(): void } // idempotent

// pane-editors/takeover/TakeoverPluginRegistration.ts (owns commands, D12)
//   herdr.installMobileTakeoverPlugin: copy dist/herdr-plugin → globalStorage/herdr-plugin, then `herdr plugin link <copy>`
//   herdr.removeMobileTakeoverPlugin:  `herdr plugin unlink <id>` if registered, then delete the copy
//   isRegistered(): boolean — read by TakeoverPopupHost through a narrow local interface
```

Owner-socket protocol (newline-delimited text):

- popup → host: `hello <token>`, then optionally `confirm`;
- host → popup: `alive`, `retract`.

The Surface constructor gets `TakeoverOffers`. `VsCodePaneTerminalSurface` gains private `takeoverOffer: { client: AttachedClient; offer: TakeoverOffer } | undefined`, synced at the end of `converge()` and retracted in `dispose()`.

## Expected file structure

```text
herdr-plugin/                         NEW  separate Herdr plugin package
  herdr-plugin.toml                   NEW  id, one popup pane entrypoint "takeover" (100%×100%), command ["node","takeover-popup.js"]
  takeoverPopup.ts                    NEW  owner-socket client, watchdog, mirror via Herdr socket, input → confirm
esbuild.mjs                           CHANGED  also bundle herdr-plugin → dist/herdr-plugin/{takeover-popup.js, herdr-plugin.toml}
package.json                          CHANGED  two commands
src/infrastructure/pane-editors/
  PaneTerminalSurface.ts              CHANGED  D1 sync, yield on confirm, retract on dispose
  takeover/TakeoverPopupHost.ts       NEW
  takeover/TakeoverPluginRegistration.ts  NEW  registration state + the two commands
  index.ts                            CHANGED  export the two for composition
src/extension/HerdrExtension.ts       CHANGED  compose registration + host, inject host into Surfaces
docs/architecture/code-architecture.md CHANGED  responsibility map line, including the D12 command exception
```

## Exclusions

- Remote hosts, Linux and Windows (as #16).
- The first-input guarantee while an attach is still stopping (#27).
- Mirror scrolling (any wheel confirms).
- Changes to Herdr or RootShell.
- Cleanup of the registration on VS Code extension uninstall: the user runs Remove first; documented in the README.

## Verification plan (preliminary)

**Critical**

1. Surface behavior (vitest, extend `PaneTerminalSurface.test.ts` with a fake `TakeoverOffers`). It offers only under D1. It retracts on blur, hide, Herdr focus moving away, attach exit and dispose. A confirm for the current attach releases it into an observer, and nothing reattaches until local input or a focus transition; then a fresh offer is made. A confirm after a reattach (stale generation) does nothing.
2. `TakeoverPopupHost` adapter integration (real Unix socket, fake `herdr` executable):
   - open arguments and env;
   - a valid token's `confirm` calls `onConfirm` exactly once;
   - foreign or stale token rejected;
   - retract reaches the popup;
   - D11: bounded reopen after `ui_busy`, after a missing `hello`, and after the popup disconnects without `confirm`; at most four reopens per offer, even across `hello`s; no reopen after `retract`;
   - dispose closes and unlinks the socket.
3. Popup program integration (node-pty + fake owner socket):
   - key, mouse press or wheel sends `confirm` and exits;
   - a focus report or resize does not;
   - `retract`, owner socket close, 3 s without `alive`, or Herdr socket loss makes it exit.
4. Manual live E2E checklist on a disposable Pane:
   - VS Code → phone → VS Code input and geometry, and the first-input count;
   - offline phone reconnect;
   - competing popup (`ui_busy`);
   - window close and reload;
   - `kill -STOP` of the extension host (hang) → popup gone within about 3 s;
   - Herdr server stop/start and `herdr server reload-config` while VS Code is attached → no orphan popup; after reconnect and reattach a fresh popup appears;
   - the Pane survives.

**Optional:** registration adapter with fake `herdr` (list, link, unlink, copy on upgrade, missing plugin → no offers).

**Excluded:** mirror rendering fidelity, Herdr popup rendering and slot semantics, banner text, private helpers.

## Known limitations (accepted by the owner after the final review)

- Installing the plugin while an eligible attach already exists shows no popup until the next attach generation (a focus change or editor switch). Removing it while a popup is shown leaves that popup until it is retracted.
- The Install preflight checks `node` on VS Code's PATH, not the Herdr server's; a server-side launch failure only shows up in the log (no `hello`).
- Keystroke forwarding (D14) is best-effort: per stdin chunk, and Yield proceeds even if `pane.send_text` fails.

## Open questions

- Q1. Does re-linking pick up an overwritten manifest in place, or is unlink+link needed on upgrade? Implementer verifies.
- Q2. Is `HERDR_SOCKET_PATH` always present for plugin popup processes? The spike used it; the implementer confirms it.
- Q3. Does `herdr plugin link/unlink/list` need a running server or a `--session`? The registry is per user; the implementer verifies and uses the active Session only if required.
