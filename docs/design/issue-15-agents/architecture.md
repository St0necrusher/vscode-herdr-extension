# Issue #15 — Track and navigate detected Agents

Status: **approved 2026-10-02** (decisions 1–6 accepted by the user). Requirements: [#15](https://github.com/St0necrusher/vscode-herdr-extension/issues/15) (parent spec #9, user stories 9, 16, 17, 41). Architecture authority: [`code-architecture.md`](../../architecture/code-architecture.md). Domain: `CONTEXT.md` terms **Agent**, **Agent Status**, **Visible Pane Editor**; ADR 0004 (snapshot reconciliation), ADR 0010 (Pane Editor focus never switches the active Session).

## Scope

In: Agents View for the active Session; one hidden navigation command; focus-driven Selected Space and row selection; Visible Pane Editor marks on Pane, Agent, and Space rows; stale/unavailable parity with the Panes View.

Out: multi-line Agent blocks (#52); clearing `done` (#25); notifications and the "Open Agent" notification action (#20, which reuses the command).

Existing worktree changes on `main` that belong to this issue: `CONTEXT.md` (Agent, Agent Status, Visible Pane Editor) and `docs/adr/0010-…`. They are committed on the #15 branch.

## Facts relied on

- The snapshot already carries `agents: HerdrAgent[]` in Herdr order, each with `paneId`, `spaceId`, `herdrTabId`, `agentStatus`, `name`, `displayAgent`, `agent`, `cwd`. The decoder validates their Space/Tab/Pane references. Agent detection and status events already invalidate the snapshot (ADR 0004). No socket or Sessions change is needed.
- `TreeView.reveal` always opens its view first (`MainThreadTreeViews.$reveal` → `viewsService.openView(treeViewId, options.focus)`, VS Code 1.100.0, `src/vs/workbench/api/browser/mainThreadTreeViews.ts:71-82`). Revealing a row while the Herdr container is hidden would switch the sidebar away from, for example, the Explorer.
- `PaneTerminalSurfaceManager` already owns the VS Code Tab binding of every Pane Editor and decides which ones are the active tab of their group (it writes `PaneEditorSelectionModel`).
- `PaneTerminalSurfaceManager.openPane` is a no-op when the editor is already the active tab of *any* group, so it does not focus a Visible Pane Editor that sits in an inactive group.

## Modules and responsibilities

```text
extension/HerdrExtension ── passes surfaceManager as PaneEditorPresenceSource ──► NavigationFeature
                                                                                     
capabilities/terminalSurfaces
  PaneTerminalOpening, PaneTerminalClosing          (unchanged)
  PaneEditorPresenceSource                          NEW: Visible + focused Pane Editors
        ▲ implements
infrastructure/pane-editors/PaneTerminalSurfaceManager  (derives presence from its Tab bindings)

features/navigation
  NavigationContextModel   + consumes PaneEditorPresenceSource; focus → Selected Space;
                             publishes active-Session Pane Editor facts in the context
  paneName.ts              MOVED from panes/PanesModel (two consumers: Panes, Agents)
  view/visiblePaneEditorDecoration.ts  NEW stateless FileDecorationProvider + row URI helper
  spaces/   SpacesModel   + `visible` per Space;  View: decoration
  panes/    PanesModel    + `visible` per row, `focusedPaneId`;  View: decoration, reveal, getParent
  agents/   NEW child: AgentsModel, AgentsFeature (`herdr.openAgentPane`), view/VsCodeAgentsView
```

- **Pane editors** own the truth of which Pane Editors exist, which are visible, and which one is focused. They know nothing about Navigation.
- **Navigation context** owns the Selected Space and the focus-follows rule (ADR 0010: only the active Session). It publishes the active Session's Pane Editor facts together with the snapshot and selection, so every child derives marks from one consistent state.
- **Spaces / Panes / Agents** derive their rows and marks; their Views render, decorate, and reveal.
- **Agents** is a Navigation child, not a top-level feature: it needs the Selected Space and Pane opening, both Navigation-owned (same reason as Scripts in #47).

## Domain model

No new domain entity. Existing: **Agent** (occupant of a Pane, identified for navigation by its Pane), **Agent Status**, **Visible Pane Editor**. The "focused Pane Editor" is the Visible Pane Editor that is the active tab of the active editor group; CONTEXT.md already distinguishes it in the Visible Pane Editor entry.

Derived, feature-local values:

```ts
// capability data (terminalSurfaces)
type PaneEditorReference = Readonly<{ sessionId: string; paneId: string }>;
type PaneEditorPresence = Readonly<{ visible: readonly PaneEditorReference[]; focused?: PaneEditorReference }>;

// navigation context, connected and stale variants gain (active Session only):
paneEditors: Readonly<{ visiblePaneIds: ReadonlySet<string>; focusedPaneId?: string }>;

// agents/AgentsModel
type AgentNavigationRow = Readonly<{
  agent: HerdrAgent; pane: HerdrPane; space: HerdrSpace; tab: HerdrTab;
  label: string;      // name ?? displayAgent ?? agent (Herdr lists an Agent only with name or agent)
  paneName: string;   // Pane row naming
  visible: boolean;
}>;
type AgentsState = Unavailable | Connected{ sessionId, rows, focusedPaneId? } | Stale{ sessionId, reason, rows, focusedPaneId? };
```

Invariant: `focused` is always one of `visible` (both derived from the same Tab bindings).

## Data flow

### Selecting an Agent

1. User clicks the Agent row for Pane `p7` in Space `s2`. Row command: `herdr.openAgentPane("p7")`.
2. `AgentsFeature` reads the Navigation context (connected or stale; unavailable → nothing). Pane missing from the snapshot → nothing.
3. `SpaceSelectionOperations.selectSpace("s2")` → context publishes → Spaces/Panes Views re-render for `s2`.
4. `NavigationPaneOpening.openPane("p7")` → `PaneTerminalSurfaceManager.openPane` creates or reveals the Pane Editor (reuse by `(sessionId, paneId)`); visible + window focus → the Surface takes the Attach (existing #16 policy). Herdr focus is never set.
5. Tabs change → manager recomputes presence → publishes `focused = {session, p7}`.
6. Context: focused changed, same Session, Pane in snapshot → `selectedSpaceId = s2` (already) and `paneEditors.focusedPaneId = p7` → publish.
7. Panes View and Agents View (if visible) `reveal(row, { select: true, focus: false })`; decorations show the new Visible marks.

### Focusing a Pane Editor directly

Steps 5–7 alone. A Pane Editor of another Session: presence changes, context ignores it (no Space change, no marks). A file editor becomes active: `focused` becomes undefined; the context keeps the Selected Space and Views keep their selection.

### Lifecycle and failure paths

- Snapshot reconciliation adds/removes Agents, changes status, or moves Panes: the context republishes, rows re-derive. Pane Editors are only ever opened through `openPane`, keyed by `(sessionId, paneId)`, and re-keyed on `pane.moved` — no duplicates.
- Stale: Agents keep the last rows; `herdr.openAgentPane` works as `herdr.openPane` does in stale. Unavailable: empty View, message "Herdr Session is not connected".
- Session switch: context resets `paneEditors` from the current presence filtered to the new Session.
- The Herdr view container hidden: no reveal (it would open the view). When the Panes or Agents View becomes visible, it reveals the current focused row once.
- User clicks another Space while a Pane Editor stays focused: nothing snaps back; only a *change* of the focused Pane Editor moves the Selected Space.

## Public seams

```ts
// capabilities/terminalSurfaces/paneEditorPresence.ts — NEW
export interface PaneEditorPresenceSource {
  getPaneEditorPresence(): PaneEditorPresence;
  onDidChangePaneEditorPresence(listener: (presence: PaneEditorPresence) => void): { dispose(): void };
}
```

- `PaneTerminalSurfaceManager implements PaneEditorPresenceSource`: computed from its bindings and `tabGroups` (`visible`: bound tab is `activeTab` of its group; `focused`: bound tab is `activeTabGroup.activeTab`). Published once per reconciliation when the value changes; also subscribes to `tabGroups.onDidChangeTabGroups` (active group changes do not fire `onDidChangeTabs`).
- `NavigationContextModel(projection, presence)`; `NavigationContextState` connected/stale gain `paneEditors`.
- Command `herdr.openAgentPane(paneId: string)` — registered by `AgentsFeature`, hidden from the palette, row command of Agent rows. #20 calls it with the Agent's Pane ID.
- View id `herdr.agents` ("Agents"), after Panes.
- Decoration: rows that are Visible set `resourceUri` to a `herdr-visible-pane-editor:` URI; one stateless `FileDecorationProvider` decorates every URI of that scheme (badge `●`, tooltip "Visible in an editor"). Non-visible rows have no `resourceUri`. Re-rendering a row is the only update; no decoration change events. Accessibility labels also say "visible".
- Agent row: Agent Status `ThemeIcon` (distinct glyph per status, color optional), label, description `Space · Pane`, `MarkdownString` tooltip (status as text, Space, Herdr Tab, Pane, cwd), accessibility label includes status text.

## Expected file structure

```text
package.json                                          CHANGED view herdr.agents; command herdr.openAgentPane (hidden)
src/capabilities/terminalSurfaces/paneEditorPresence.ts   NEW capability
src/capabilities/terminalSurfaces/index.ts            CHANGED export
src/infrastructure/pane-editors/PaneTerminalSurfaceManager.ts  CHANGED implements presence; openPane focus fix (decision 1)
src/extension/HerdrExtension.ts                       CHANGED pass presence to NavigationFeature
src/features/navigation/NavigationFeature.ts          CHANGED deps + compose AgentsFeature, register decoration provider
src/features/navigation/NavigationContextModel.ts     CHANGED presence, focus rule, paneEditors
src/features/navigation/capabilities/index.ts         CHANGED context state type
src/features/navigation/paneName.ts                   NEW (moved from PanesModel)
src/features/navigation/view/visiblePaneEditorDecoration.ts  NEW provider + URI helper
src/features/navigation/spaces/SpacesModel.ts         CHANGED visible
src/features/navigation/spaces/view/VsCodeSpacesView.ts  CHANGED decoration
src/features/navigation/panes/PanesModel.ts           CHANGED visible, focusedPaneId; import paneName
src/features/navigation/panes/view/VsCodePanesView.ts CHANGED decoration, getParent, reveal
src/features/navigation/agents/                       NEW child feature
  index.ts
  AgentsFeature.ts                                    herdr.openAgentPane
  AgentsModel.ts                                      rows, ordering, labels, marks
  view/index.ts
  view/VsCodeAgentsView.ts                            tree, icons, tooltip, message, reveal
```

## Decisions

Answers from the user (2026-10-02): 1 accepted; 3 accepted; 4 accepted; 6 renamed to `herdr.openAgentPane` (the command only selects a Space and opens a Pane Editor; it sends nothing to Herdr about the Agent). 2 accepted in the Explorer style: VS Code's Explorer itself skips auto-reveal while hidden (`explorerView.ts:803`, `isBodyVisible()` guard) and catches up on `onDidChangeBodyVisibility` (`:318-325`); we do the same with `treeView.visible` and `onDidChangeVisibility`. 5 changed: no Pane-name fallback; the label is `name ?? displayAgent ?? agent` (Herdr guarantees `name` or `agent`), ending in an empty string only to satisfy the type.

1. **`openPane` focuses a Visible Pane Editor in an inactive group.** Today it is a no-op when the editor is the active tab of any group. Proposal: no-op only when it is the active tab of the *active* group; otherwise `reveal()`. Needed for "opens or focuses its Pane Editor". Affects `herdr.openPane` too.
2. **Reveal only while the view is visible**, plus one catch-up reveal when it becomes visible (fact above).
3. **Visible mark = FileDecoration badge** via a stateless provider and visibility-encoded `resourceUri`.
4. **Space rows keep Herdr's aggregate `agentStatus`** in description/tooltip (user story 12). The ticket's "only in the Agents View" is read as Agent Status of an Agent; the Panes View already does not show it.
5. **Label** is `name ?? displayAgent ?? agent`, no Pane-name fallback. Herdr fact (b99002a, `src/app/agents.rs:366`, `src/terminal/state.rs:2094`): an Agent is listed only when its terminal has a managed `name` or an effective agent label (`agent`); the schema types them as nullable.
6. **Command id** `herdr.openAgentPane(paneId)`.

## Verification plan (preliminary)

### Critical now

| # | Observable behaviour | Protects | Seam / level |
| --- | --- | --- | --- |
| C1 | Agents rows in Herdr order; label fallback chain; description `Space · Pane`; one row per Agent across Spaces | AC 1, ordering | `AgentsModel` behavioral (fake `NavigationContextSource`) |
| C2 | Focused Pane Editor of the active Session sets the Selected Space; another Session's editor or a file editor changes nothing; a user Space choice is not overridden while focus is unchanged | AC 5, AC 6, ADR 0010 | `NavigationContextModel` behavioral (fake projection + fake presence) |
| C3 | Visible marks: Pane rows, Agent rows, Space rows reflect the active Session's Visible Pane Editors | AC 7 | models' behavioral tests via the context |
| C4 | Stale keeps Agents rows; unavailable is empty | AC 8 | `AgentsModel` behavioral |
| C5 | `herdr.openAgentPane` selects the Agent's Space and opens the Pane Editor; a second call reuses it | AC 3, AC 4, reuse | extension test (`pane-command` style) |
| C6 | Manager presence: `visible`/`focused` follow tab activation across two editor groups and closing | provider contract | extension test (`pane-editors` style) |

### Optional

- `openPane` focuses a Visible Pane Editor in an inactive group (decision 1).
- Pane move keeps the Agent row and the single Pane Editor.

### Deliberately excluded

- Icons, colors, tooltip copy, decoration badge rendering; snapshot decoding of Agents (covered); Herdr status semantics.

## Open questions

None.

## Amendments

- **A1 (2026-10-02, user, during implementation): reveal dropped entirely.** Supersedes decision 2. A live check showed that VS Code shows inline row actions for hovered, selected, *and* list-focused rows (`views.css:237-241`, VS Code 1.100.0), and `reveal(..., { focus: false })` leaves the old list focus in place (`treeView.ts:1072-1080`). Programmatic selection therefore left close buttons on two extra rows; `focus: true` would steal keyboard focus from the terminal. Result: no `reveal`, no `getParent`, no visibility tracking, and no `focusedPaneId` in the Panes/Agents states. Focus still sets the Selected Space; Visible marks stay. Ticket #15 acceptance criterion 5 narrowed accordingly. Consequences: `NavigationPaneEditors` carries only `visiblePaneIds` (the context keeps the previous focused reference privately for change detection); `PaneEditorPresence.focused` stays because the focus rule needs it; decision 1 is unaffected (it serves "opens or focuses its Pane Editor"); data-flow step 7 reduces to decorations; the optional reveal scenario is removed from the verification plan.
- **A1 follow-up (implementation):** `focusedPaneId` is not published by the context at all; `NavigationContextModel` reads `presence.focused` privately for the focus rule.
- **A2 (user-approved in the coordinator tab): `navigation/shared/` child.** The boundaries lint forbids child→child and child→root imports, so the planned `navigation/paneName.ts` and `navigation/view/` were unreachable from Spaces, Panes, and Agents. `shared/index.ts` (host-neutral `paneName`, used by models) and `shared/view/index.ts` (decoration provider and row URIs) are separate entries so models stay loadable without `vscode`. `eslint.config.mjs` gains two narrow policies: a feature child may import its own feature's `shared/index.ts` and `shared/view/index.ts`; the feature root may import `shared/view/index.ts`.
- **A3 (user-approved; supersedes decision 3): Visible mark is a decoration color, published through a separate source.** VS Code wraps every extension `getChildren` in a progress indicator, so re-rendering three trees on every editor switch flashed progress bars under the view headers. Now:
  - `NavigationContextState` is unchanged; `NavigationContextModel` also implements a Navigation capability `VisiblePaneEditorsSource { getVisiblePaneIds(); onDidChangeVisiblePaneIds() }` (active Session only), applying state and visible IDs together before publishing either.
  - Every Pane, Agent, and Space row always carries `resourceUri` `herdr-navigation:/{pane|agent|space}/<id>`.
  - `shared/view/VisiblePaneEditorDecorationProvider` is stateful: it subscribes to the context and the visible source, keeps the marked URI set, and fires `onDidChangeFileDecorations` for the difference. Mark: `ThemeColor("gitDecoration.addedResourceForeground")`, tooltip "Visible in an editor"; no badge.
  - Models carry no `visible` field. Trees refresh only on snapshot or Selected Space changes.
  - Trade-off: accessibility labels no longer say "visible".
- **A4 (observation):** VS Code drops decoration colors on the selected row while the list has focus (`.monaco-list:focus .selected` forces `color: inherit`). Expected host behavior.
- **A5 (user request): close inline actions use `$(close-small)`.** Resolved 2026-10-03 by raising `engines.vscode` to `^1.134.0`. Original risk: the codicon exists only from VS Code ~1.133/1.134 (absent in `codiconsLibrary.ts` at 1.132.0, present at 1.134.0), while `engines.vscode` is `^1.100.0`.

Actual file structure differs from "Expected file structure" by A2: `src/features/navigation/shared/{index.ts, paneName.ts, view/index.ts, view/visiblePaneEditorDecoration.ts}` replace `navigation/paneName.ts` and `navigation/view/visiblePaneEditorDecoration.ts`; `eslint.config.mjs` changed; `SpacesModel.ts` and `PanesModel.ts` carry no marks.

Verification plan update: C2 targets `NavigationContextModel` through `NavigationContextSource` + `VisiblePaneEditorsSource`; C3 targets the marked URIs of `VisiblePaneEditorDecorationProvider` instead of model `visible` fields.
