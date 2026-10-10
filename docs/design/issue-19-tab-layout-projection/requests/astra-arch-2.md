from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/answers/astra-arch-2.md
skills: architect
input: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/research/readiness-gates.md (summary + "Gate 2" section), your previous answer /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/answers/astra-arch-1.md

# Readiness gates result: decide the Gate 2 amendment

Gate 1 (selection isolation) PASSES: revealing the Pane Editor (`Terminal.show` / `surface.reveal` / `focusPane`) resets the group's selection to the Pane alone (`editorGroupModel.ts:418`), so `moveActiveEditor` moves only the Pane. No extra primitive needed. I will record this in `architecture.md`.

Gate 2: identity holds (one surface/Terminal, no pty close, never two clients, binding ends on the right tab, twins never misbind), but **every cross-group change (surplus merge or move) restarts the Pane's Herdr client** and flickers its title. Cause, `PaneTerminalSurfaceManager.reconcileTabBindings` (`src/modules/pane-editors/PaneTerminalSurfaceManager.ts:183-198`): VS Code creates a new `Tab` object when an editor changes group; the manager rebinds only by the synthetic label `session:pane`, but the surface already renamed the tab to the Pane name; so it deselects the Pane (stopping its client), calls `hidePaneName()`, rebinds on the synthetic name, `showPaneName()`, reselects (new client, ADR 0012 resets attach modes). This is pre-existing: a user dragging a Pane Editor to another group hits it today; the projection makes it happen for every moved Pane.

Options I see (code verified in the manager):
- **A. Accept** the restart (no change). Cost: one dropped live Attach + screen reset + title flicker per moved Pane, on every projection and every manual drag.
- **B. Prototype's proposal:** when a bound tab disappears, rebind silently to exactly one `TabInputTerminal` tab that is new since the previous reconcile, unbound, and labelled with the surface's currently published name; otherwise today's synthetic round trip. Needs the surface to expose its published label and the manager to remember the previous tab set. Ambiguity rests on VS Code moving editors one at a time (source-proven, untested for two twins in one merged group).
- **C. Don't deselect on a lost tab while the terminal is alive:** keep today's synthetic-name round trip (hidePaneName → rebind → showPaneName) but drop the `selection.deselect` in the "was bound, now unbound" branch; the following select/deselect pass decides visibility once rebound. Title still flickers briefly; client continues. Open: a terminal moved to the Panel has no editor tab, so it would stay selected with its synthetic name (today it is deselected).

Decide one, marked explanation or amendment, with the invariant owner and the expected observable behaviour, and say whether it is part of this phase (a preparatory slice in the manager) or a separate ticket. Record the decision in `progress.md`. No code changes. No interactive questions.

## Reply
Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first, details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
