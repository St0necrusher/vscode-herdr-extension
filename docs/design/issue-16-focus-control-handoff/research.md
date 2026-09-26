# Issue #16 grounding research

Status: evidence gathered; production design conclusions remain subject to user discussion.

## Prototype audit

Audited `/private/tmp/vscode-herdr-direct-attach-prototype` at committed prototype revision `655c1a9` plus its current dirty multi-group probe.

### Demonstrated behavior

- One VS Code `Pseudoterminal` can switch between the supported read-only observer CLI and official interactive `herdr terminal attach <terminal_id> --takeover` running under extension-owned `node-pty`, without replacing the server-owned Pane.
- Manual validation covered ordinary input, Pi Shift+Enter, selection/copy, fullscreen wheel behavior, VS Code↔Ghostty handoff, Pane/process survival, and a first-input reacquisition example with exactly one character delivered.
- The newer dirty probe manually validated two simultaneously selected Pane tabs in separate editor groups. Both remained independently attached even though only one group had `isActive=true`; selecting a neighboring tab released only that group's Pane; window blur released all.

Primary local evidence:

- `prototype/direct-attach-handoff/EVIDENCE.md`
- `prototype/direct-attach-handoff/README.md`
- `prototype/direct-attach-handoff/extension.js`

### Prototype evidence to evaluate, not production code

- Per-surface serialized observe/attach/release transitions.
- Generation checks that reject late events from replaced processes.
- Per-surface dimensions.
- Fail-closed eligibility derived from window focus and the bound runtime `Tab` being its group's `activeTab`.
- The prototype buffered input until first PTY output. Production deliberately rejects that mechanism: once `node-pty` exists, input is written immediately and the native PTY queue provides buffering.
- Bounded `SIGTERM` then emergency `SIGKILL` cleanup, while explicitly treating child exit as something other than a Herdr ownership-release acknowledgment.

### Prototype shortcuts that are not production design

- A visible unique terminal-title token bootstraps `TabInputTerminal` correlation. The public API does not directly expose `TabInputTerminal -> Terminal`.
- Subsequent design resolved the production bootstrap: use the exact temporary terminal name `${sessionId}:${paneId}`, bind the enclosing `vscode.Tab` whose `input` is `TabInputTerminal` and whose label matches, then retain Tab object identity. A future concrete Pseudoterminal publishes the normal user-facing Pane name through `onDidChangeName` after binding, so the technical name is temporary.
- Official VS Code typings confirm that `Terminal.show()` returns `void`, terminal editor placement is selected through `TerminalEditorLocationOptions.viewColumn` at `createTerminal`, `TabInputTerminal` exposes no terminal reference, and `Pseudoterminal.onDidChangeName` is the supported extension-controlled rename signal.
- First PTY output was only a prototype heuristic, not a positive attach-ready or input-delivery acknowledgment. Production does not wait for it; follow-up #27 owns stronger guarantees.
- Popup/plugin/mobile Yield code belongs to #26 and is disabled in the current visibility probe.
- Three groups, Tab-object replacement on move, maximize/occlusion, duplicate-target close ordering, and automated coverage were not established.

## Current production baseline

The clean main branch contains the completed #14 observer-only implementation:

- `TerminalSurfacesFeature` owns the open-surface registry and provides `PaneTerminalOpening`.
- `TerminalSurface` owns one editor's observer lifecycle, retry policy, relevance, generation, and terminal-local status.
- `VsCodeTerminalSurfaceView` owns native terminal presentation and host events.
- `HerdrCliTerminalObserverFactory` owns one supported observer process and NDJSON/base64/UTF-8 parsing.
- `PanesFeature` resolves current Pane facts before invoking the opening capability.

Reusable baseline behavior includes observer rendering, observer subprocess parsing/cleanup, retry/reset behavior, native editor creation, and non-destructive detach. Existing coverage does not prove direct attach, input forwarding, multi-group eligibility, Tab correlation, or handoff.

The principal mismatch is identity: #14 keys surfaces by `(Session ID, terminal ID)`, while #16 requires one logical surface per `(Session ID, current public Pane ID)` and treats `terminal_id` as mutable routing data.

## Primary-source findings

### Herdr 0.9.0

- The pinned CLI reference documents one writable direct-attach client; `--takeover` replaces the existing owner. Multiple observer clients are read-only.
- The public documentation does not define a positive attach-readiness acknowledgment, displaced-client process behavior, or an ownership-release acknowledgment.
- Pinned source confirms byte-oriented terminal input inside Herdr's semantic session-control protocol, but does not prove application consumption or provide a public success ACK for the interactive CLI path.
- `HERDR_CONFIG_PATH` is a documented config override. Exact `ui.mouse_capture=false` behavior was located only in older official documentation and remains a version-specific uncertainty for 0.9.0.
- A v0.9.0 `pane.moved` event carries `previous_pane_id`, `previous_workspace_id`, `previous_tab_id`, and a full new `PaneInfo`. A cross-Workspace move keeps the running Pane and terminal alive but assigns a new public Pane ID, so the event provides an exact old-to-new identity mapping without synthesizing `pane.closed`/`pane.created`.
- Herdr documents applying subscribed events to a client cache and using snapshots for bootstrap/recovery. The current extension instead treats accepted events as invalidation, debounces, and obtains a fresh snapshot; it presently discards the `pane.moved` payload. Preserving the exact mapping therefore requires extending the existing connection-to-Sessions event path.

Sources:

- [Pinned Herdr 0.9.0 CLI reference](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/docs/next/website/src/content/docs/cli-reference.mdx)
- [Pinned persistence/remote documentation](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/docs/next/website/src/content/docs/persistence-remote.mdx)
- [Pinned terminal session client source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/client/terminal_sessions.rs)
- [Pinned CLI source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/cli.rs)
- [Pinned configuration documentation](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/docs/next/website/src/content/docs/configuration.mdx)
- [Pinned Socket API (`pane.move` and event handling)](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/docs/next/website/src/content/docs/socket-api.mdx)
- [Pinned event schema source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/api/schema/events.rs)
- [Pinned Pane schema source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/api/schema/panes.rs)

### node-pty

The public API documents string `write`, resize, exit events, signal-based kill on Unix, and disposable event subscriptions. It exposes no readiness event and no acknowledgment that written input was consumed. The typings do not promise arbitrary `Buffer` input to `write`.

Sources:

- [node-pty README](https://github.com/microsoft/node-pty/blob/main/README.md)
- [node-pty public typings](https://github.com/microsoft/node-pty/blob/main/typings/node-pty.d.ts)

## Evidence limits

- Prototype outcomes are manual observations on disposable Panes, not stable API guarantees or production architecture.
- Process exit proves only local child termination, not confirmed Herdr lease release.
- First PTY output is not readiness acknowledgment.
- Exact-byte handling must be designed against the locked `node-pty` version actually selected for production.
- Automated test scope is explicitly a later separately approved phase under #16.
