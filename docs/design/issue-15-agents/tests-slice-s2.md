# Slice S2: focus drives the Selected Space; Visible Pane Editors of the active Session (C2, C3a)

Read `docs/design/issue-15-agents/tests-workers-brief.md` first.

**Owned file:** existing `src/features/navigation/NavigationContextModel.test.ts`. Add to it; keep the two existing tests as they are. You may turn its `noPaneEditors` constant into a small controllable fake presence source if your tests need one, as long as the existing tests keep their meaning.

**Seam:** `NavigationContextModel` (`src/features/navigation/NavigationContextModel.ts`) built on a fake `ActiveSessionProjectionSource` and a fake `PaneEditorPresenceSource` (`src/capabilities/terminalSurfaces/paneEditorPresence.ts`). Observe it only through `getState()`/`onDidChange` (`NavigationContextSource`), `selectSpace` (`SpaceSelectionOperations`), and `getVisiblePaneIds()`/`onDidChangeVisiblePaneIds` (`VisiblePaneEditorsSource`). Level: vitest behavioral. The snapshot needs Panes for these tests; extend the file's `snapshot` fixture minimally.

**Presence contract:** `focused`, when present, is one of `visible`. A focused Pane Editor is the active tab of the active editor group; a file editor in the active group means `focused` is absent while other Pane Editors may stay visible.

## Scenarios

- **C2: focus drives the Selected Space (issue #15 AC 5, AC 6, ADR 0010).**
  - When the focused Pane Editor changes to a Pane of the active Session, the Selected Space becomes that Pane's Space.
  - A focused Pane Editor of another Session does not change the Selected Space (and does not switch anything else in the state).
  - A file editor becoming active (`focused` absent) does not change the Selected Space.
  - After the user selects another Space with `selectSpace` while the same Pane Editor stays focused, the user's choice holds through a presence change that keeps the same focused Pane Editor (for example, another editor becomes visible) and through a new snapshot of the same Session.
- **C3a: Visible Pane Editors of the active Session (AC 7, ADR 0010).**
  - `getVisiblePaneIds()` contains only Panes whose Visible Pane Editors belong to the active Session, even when the presence also lists another Session's editors.
  - When the active Session switches, the visible Pane IDs follow the new Session and `onDidChangeVisiblePaneIds` notifies listeners.

Aim for about two or three new tests in total.

**Focused command:** `npx vitest run src/features/navigation/NavigationContextModel.test.ts`.
