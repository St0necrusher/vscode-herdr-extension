# Herdr v0.9.0 navigation source audit

**Target:** Herdr tag `v0.9.0`, commit `b99002ac99b09e00b4ca692436cb15a6b0d676f1` ([GitHub](https://github.com/herdrdev/herdr/tree/b99002ac99b09e00b4ca692436cb15a6b0d676f1)). The repository was cloned to `/tmp/herdr-v0.9.0-audit.vaTWJo/repo`; `git rev-parse HEAD` matched the commit and `git tag --points-at HEAD` returned `v0.9.0`.

**Claim labels:** **Guarantee** = explicit schema/source/test contract; **Observation** = behavior in inspected code; **Inference** = consequence of that behavior; **Missing evidence** = not represented or not directly tested.

## Direct answers

### 1. `session.snapshot` Pane fields and lifecycle state

**Guarantee:** Each snapshot `PaneInfo` contains `pane_id`, `terminal_id`, `workspace_id`, `tab_id`, `focused`, optional `cwd`/`foreground_cwd`, `label`, `agent`, `title`, `terminal_title`, `terminal_title_stripped`, `display_agent`, `agent_status`, `state_labels`, `tokens`, optional `agent_session`/`scroll`, and `revision` ([schema](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/api/schema/panes.rs#L527-L560)). `SessionSnapshot` has `focused_workspace_id`, `focused_tab_id`, `focused_pane_id`, and the `panes` array ([schema](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/api/schema/session.rs#L9-L22)).

**Guarantee:** There is no terminal lifecycle field such as `exited`, `closed`, or an exit reason in `PaneInfo`; `agent_status` is an agent status enum, not pane/PTY lifecycle. The server assembles the pane array from currently present panes ([assembly](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/api/session.rs#L16-L56)).

### 2. `pane.exited`, subsequent snapshots, and closed-vs-exited

**Guarantee:** `pane.exited` is a distinct subscription/event kind ([schema](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/api/schema/events.rs#L51-L64)). Its payload is exactly `{ pane_id, workspace_id }`; it carries no exit reason or final `PaneInfo` ([schema](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/api/schema/events.rs#L493-L529)).

**Observation:** On `AppEvent::PaneDied`, Herdr emits `PaneExited` while the pane is still findable, then dispatches the event to state mutation; `handle_pane_died` removes the pane and its terminal state ([emit/order](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/api.rs#L265-L282), [removal](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/api.rs#L312-L320), [state mutation](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/actions.rs#L2175-L2237)). Therefore an exited pane is absent from later `session.snapshot` results. The test confirms `pane.exited` precedes the reduced `layout.updated` pane set ([test](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/api.rs#L1998-L2034)).

**Guarantee:** Explicit API close removes the pane and emits `pane.closed` with the same two identifiers ([close path](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/api/panes.rs#L1852-L1911)). Thus exited vs closed is distinguished only by the event kind and cause before removal; no later snapshot state distinguishes them.

**Missing evidence:** No v0.9.0 source/test preserves an exited Pane in a snapshot or exposes the internal `ChildExitReason` in the public event.

### 3. Pane display-name/title precedence

**Observation:** The server exposes the fields independently; `pane_info` maps manual `label`, effective `agent`, metadata `title`/`display_agent`, and raw/stripped terminal titles without choosing one combined display name ([mapping](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/creation.rs#L307-L355)).

**Observation (client navigator):** The visible Pane row resolver is `label > agent.name > display_agent > title > "pane N"`; it does **not** use `terminal_title_stripped`, `terminal_title`, or `agent` ([resolver](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/client/shell/aggregate_navigation.rs#L134-L175)).

**Observation (agent sidebar):** Its agent label resolver is `display_agent > agent.name > agent > title`; the separate `pane` token is `title > label`. Raw and stripped terminal titles are only rendered when selected as configured sidebar tokens ([inputs/resolvers](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/client/shell/agent_sidebar.rs#L266-L300), [token rendering](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/ui/sidebar/tokens.rs#L67-L122)).

**Inference:** v0.9.0 has no universal server-authoritative precedence among the requested fields. For issue #13, the navigator-specific observed name is `label`, then managed agent name, then `display_agent`, then `title`, with a generated fallback. **Missing evidence:** no shared resolver or contract says that this precedence applies to every TUI/client surface.

### 4. Pane ID vs terminal ID

**Guarantee:** Internal `PaneId` is a globally allocated `u32` layout identity ([source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/layout.rs#L10-L30)). Public `pane_id` is a workspace-qualified public pane number generated from Herdr's per-workspace pane-number map ([mapping](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/ids.rs#L27-L37)); pane numbers are stable and not reused after close ([test](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/workspace.rs#L1478-L1500)).

**Guarantee:** `TerminalId` is an opaque server-owned terminal identity, allocated independently; source explicitly says callers must not derive it from a pane ID or layout position ([source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/terminal/id.rs#L5-L30)).

**Observation:** A cross-workspace pane move changes the public `pane_id` but keeps the same `terminal_id` ([test](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/api/panes.rs#L3190-L3251)); Herdr also tests that the two exposed IDs differ ([test](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/mod.rs#L2219-L2241)).

**Inference:** Use `pane_id` as the user-visible navigation/routing identity for a Pane. Treat `terminal_id` as the underlying server/PTY identity (useful for direct terminal attachment and correlation), not as the stable hierarchy label. Restored terminals receive fresh `TerminalId`s ([restore](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/persist/restore.rs#L615-L631)); the durable Pane snapshot has no `terminal_id` field ([snapshot](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/persist/snapshot.rs#L84-L110)).

### 5. Tab labels and numbering for a group heading

**Guarantee:** `TabInfo` exposes `tab_id`, `workspace_id`, `number`, `label`, `focused`, `pane_count`, and aggregate `agent_status` ([schema](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/api/schema/tabs.rs#L39-L48)). `label` is the custom tab name when set, otherwise the current one-based tab position ([source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/workspace.rs#L446-L453)). `number` is the stable public number used in `tab_id`, and can differ from the displayed label: after tab 2 is closed, the survivor can have `number == 3` but `label == "2"` ([test](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/mod.rs#L2265-L2285)).

**Observation:** The client tab strip renders `label` (adding `Z` when zoomed), not `number` ([TUI](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/client/shell/tabs.rs#L94-L129), [label helper](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/client/shell/tabs.rs#L380-L385)). Mobile shows the label and, for multiple tabs, current positional `index + 1 / total` ([mobile](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/client/shell/mobile.rs#L215-L233)).

**Inference:** A Panes group heading should use the server `TabInfo.label` plus `pane_count`; if a positional number is shown for orientation, use current group order (the TUI convention), not `TabInfo.number`. Reserve `number`/`tab_id` for stable identity or disambiguation.

### 6. Focused Workspace/Space authority and persistence

**Guarantee:** In the v0.9.0 protocol, the focused Space concept is represented as `focused_workspace_id`; there is no `focused_space_id` ([session schema](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/api/schema/session.rs#L9-L22)). `session.snapshot.focused_workspace_id` is computed directly from the server App state's `active` workspace ([source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/api/session.rs#L16-L28)).

**Guarantee:** Public `workspace.focus` changes `state.active`/`state.selected` through `switch_workspace`, logs focus, and marks the session dirty ([API](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/api/workspaces.rs#L87-L101), [mutation](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/actions.rs#L457-L474)). Therefore the API snapshot reflects the server-global focus immediately after the mutation.

**Observation:** Headless client shells additionally have an in-memory `ClientShellLocation.focused_workspace_id` ([source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/server/clients.rs#L63-L107)). A client-shell snapshot prefers that location over `session.snapshot` ([source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/server/client_shell.rs#L6-L34)); when a shell request is handled, its remembered target is first promoted into global `state.active` ([source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/server/headless/client_views.rs#L875-L891)). Thus multiple connected shell clients can have local projections, while `session.snapshot` remains the server App focus. Tests cover both per-client remembered tabs and public focus replacing shell projections ([tests](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/server/headless/tests/mod.rs#L1888-L1943), [tests](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/server/headless/tests/mod.rs#L1945-L2004)).

**Client disconnect:** **Inference:** Global `state.active` remains process memory after an ordinary client disconnect: removal deletes the `ClientConnection` (and its `shell_location`) but does not assign `state.active` ([source](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/server/headless.rs#L995-L1042)). The disconnected client’s local shell projection does not survive. **Missing evidence:** no focused-workspace-after-disconnect regression test was found.

**Server restart / disk:** **Guarantee:** Session persistence captures `state.active` as the durable `active` field ([capture](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/persist/snapshot.rs#L251-L273)); startup restores `snap.active` when session restoration is enabled ([restore](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/app/mod.rs#L370-L407)). A graceful headless-server shutdown saves the session ([shutdown](https://github.com/herdrdev/herdr/blob/b99002ac99b09e00b4ca692436cb15a6b0d676f1/src/server/headless.rs#L720-L728)). **Inference:** Global focus survives a graceful restart when `persist_session` is enabled and the save completes; it is not guaranteed across a crash, persistence-disabled policy, or a client-local-only shell location. Client locations are process memory only and are never part of the durable session snapshot.

## Evidence matrix

| Checklist | Answer | Classification |
|---|---|---|
| Snapshot Pane fields / exited field | Fields are explicit above; no terminal/exited lifecycle field. | Guarantee; Missing evidence for any hidden lifecycle state |
| `pane.exited` lifecycle | Payload is IDs only; event precedes removal; later snapshots omit the pane. `pane.closed` is a separate explicit-close event. | Guarantee / Observation |
| Name/title precedence | No shared server resolver. Navigator: `label > name > display_agent > title > pane N`; agent sidebar has different resolver; terminal titles are opt-in tokens. | Observation / Inference |
| Pane vs terminal identity | `pane_id` is public hierarchy/routing identity; `terminal_id` is opaque underlying server terminal identity and survives pane moves, not restores. | Guarantee / Inference |
| Tab heading | Use `TabInfo.label` and `pane_count`; `number` is stable identity numbering, not displayed position. | Guarantee / Inference |
| Focus authority/persistence | API snapshot reflects process-memory `AppState.active`; shell locations are per-client memory. Global focus survives disconnect in memory and graceful persisted restart when enabled; local shell focus does not. | Guarantee / Observation / Inference; Missing disconnect test |
