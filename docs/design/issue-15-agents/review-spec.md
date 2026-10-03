# SPEC review — issue #15

**Scope:** Read-only review of the uncommitted issue #15 worktree against GitHub issue #15, ADR 0004, ADR 0010, `CONTEXT.md` terminology (Agent, Agent Status, Visible Pane Editor), and the accepted design and amendments in `docs/design/issue-15-agents/architecture.md`. Acceptance criterion 5 is interpreted according to the user's narrowing and accepted amendment A1: only Selected Space changes and Visible Pane Editor marks are required; programmatic row reveal/selection and `focusedPaneId` publication are not.

## Findings

### 1. A click during `pane.moved` reconciliation can open a second, stale Pane Editor

- **Axis:** Spec
- **Classification:** Confirmed defect
- **Severity:** Important
- **Location:** `src/infrastructure/herdr/socket/JsonSocketHerdrSessionConnection.ts:302–317`; `src/infrastructure/pane-editors/PaneTerminalSurfaceManager.ts:44–64, 97–109`; `src/features/navigation/NavigationContextModel.ts:73–97`; `src/features/navigation/agents/AgentsFeature.ts:33–40`; `src/features/navigation/panes/PanesFeature.ts:196–204`.
- **Requirement:** Issue #15 acceptance criteria 3, 7, and 9, including Pane Editor reuse and correct Visible Pane Editor marks during snapshot reconciliation; ADR 0004's `pane.moved` reconciliation model.
- **Reachability:** ADR 0004 says `pane.moved` is forwarded directly so Pane Editors can follow a new Pane identity before the next snapshot (`docs/adr/0004-snapshot-reconciliation.md:3`). The event reaches the Pane Terminal Surface Manager, which rekeys the existing Surface from the old Pane ID to the new one (`PaneTerminalSurfaceManager.ts:97–109`). Navigation continues to project the previous snapshot during the reconciliation interval: its presence handler does not replace that snapshot, and a presence-only update does not publish a context change (`NavigationContextModel.ts:73–97`). Agent rows still derive from that snapshot (`AgentsModel.ts:34–45, 74–90`). If the user clicks the still-visible old Agent row, `AgentsFeature` resolves the old Pane from the old snapshot and requests its editor (`AgentsFeature.ts:33–40`); the Panes path also builds its request from the snapshot (`PanesFeature.ts:196–208`). The manager no longer finds a Surface under the old ID and follows its missing-Surface path, creating another terminal Surface (`PaneTerminalSurfaceManager.ts:44–64`). The stale-identity editor is not removed when the snapshot catches up. During this interval, the old row's Visible Pane Editor mark can also disappear.
- **Remedy:** Keep the moved Surface resolvable by its previous Pane ID during the event-to-snapshot reconciliation gap, and route requests using that old identity to the existing Surface. The Surface manager owns this identity/reuse invariant. Do not patch Navigation's snapshot directly from the event payload; that would conflict with ADR 0004's snapshot-reconciliation model.

### 2. `close-small` is unavailable on part of the declared VS Code range

- **Axis:** Spec
- **Classification:** Risk
- **Severity:** Minor
- **Location:** `package.json:13, 112, 118, 145, 151, 256–272`; `docs/design/issue-15-agents/architecture.md:187`.
- **Requirement:** Accepted design amendment A5.
- **Reachability:** The extension declares VS Code `^1.100.0` (`package.json:13`). The Agent and Pane close-action titles use `$(close-small)` and are wired to inline view actions (`package.json:112, 118, 145, 151, 256–272`). The accepted design records that this Codicon is absent at VS Code 1.132 and present at 1.134 (`architecture.md:187`). Thus versions in the declared range before the icon became available may not render the close-action icon, although the command remains available.
- **Remedy:** If those older versions must remain supported, use an icon available throughout the declared range; otherwise, raise the engine minimum. This is the known A5 compatibility risk, not an unanticipated design deviation.

## Acceptance-criteria trace

1. **Agent rows, order, labels, description, status icons, and tooltip:** Implemented by `src/features/navigation/agents/AgentsModel.ts:74–90` and `src/features/navigation/agents/view/VsCodeAgentsView.ts:43–85`. The `cwd` tooltip line is conditional when Herdr omits `cwd`; see the open question below.
2. **Agent Status is absent from the Panes View:** Satisfied. Pane rows render no Agent Status (`src/features/navigation/panes/view/VsCodePanesView.ts:127–146`). Spaces retain their aggregate status as accepted in the design.
3. **Selecting an Agent navigates to its Pane without changing Herdr focus:** Implemented through `src/features/navigation/agents/AgentsFeature.ts:33–40`, subject to the reconciliation defect in finding 1.
4. **Pane-identity navigation command is registered but hidden from the command palette:** Satisfied (`AgentsFeature.ts:19–20`; `VsCodeAgentsView.ts:50`; `package.json:70–72, 288–290`).
5. **Focusing a Pane Editor selects its Space; no programmatic row reveal/selection:** Satisfied under amendment A1. The focused-editor and active-Session checks are in `src/features/navigation/NavigationContextModel.ts:73–86`; no tree-row reveal was introduced. I do not report a Pane-move focus issue: the accepted requirement does not unambiguously define moving a still-focused editor as a new focus transition.
6. **Inactive-Session focus does not switch the Session or Views:** Satisfied by the active-Session guard in `NavigationContextModel.ts:79–83`, consistent with ADR 0010.
7. **Visible Pane Editor marks appear on Pane, Agent, and Space rows:** Implemented through stable row URIs and the decoration provider (`src/features/navigation/shared/view/visiblePaneEditorDecoration.ts:36–67`). The event-to-snapshot interval in finding 1 can temporarily remove the old row's mark.
8. **Stale and unavailable states:** Satisfied. Stale rows use the retained snapshot; unavailable state is empty and shows “Herdr Session is not connected” (`src/features/navigation/agents/AgentsModel.ts:44–54`; `src/features/navigation/agents/view/VsCodeAgentsView.ts:89–95`).
9. **Agent changes are snapshot-driven and Pane Editors are reused:** Snapshot-driven projection and ordinary Pane reuse are implemented. The reachable move race in finding 1 violates the no-duplicate outcome during reconciliation.
10. **`done` remains Herdr-owned:** Satisfied. The extension reads status for display and does not send a “seen” action.
11. **Tests:** No finding. The review brief says tests are a separate later phase and that missing tests are not a defect. The supplied validation results—typecheck, lint, format check, 126 unit tests, and 36 extension tests—were not rerun during this review.

The accepted A1–A4 amendments otherwise match the implementation: no programmatic row reveal, shared pane-name and decoration helpers under `navigation/shared`, and stateful decoration updates without marking model rows. I found no additional terminology mismatch against the Agent, Agent Status, and Visible Pane Editor terms in `CONTEXT.md`.

## Open question

The issue requirement says the Agent tooltip shows `cwd`, but the decoded Agent `cwd` is optional and the view omits the line when it is absent (`src/infrastructure/herdr/socket/protocol/HerdrSessionSnapshotDecoder.ts:169, 193`; `VsCodeAgentsView.ts:85`). Should the tooltip display an explicit unavailable value when Herdr omits `cwd`, or is showing `cwd` only when supplied sufficient? The upstream guarantee for listed Agents was not established in this review, so this remains a clarification rather than a confirmed defect.

## Review status

Read-only review; no files were changed. Findings are limited to those above. Validation results provided in the review brief were not rerun.
