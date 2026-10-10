from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/answers/astra-arch-5.md
skills: architect
input: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/bug-tab-switch-1.md (owner's bug, reproduced, failing regression test), /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/research/hidden-merge-rebinding.md (Opus research + prototypes), your /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/answers/astra-arch-2.md (Gate 2 decision A, option B rejected)

# Blocking bug: a Pane Editor merged while hidden loses its Tab forever

The owner found it in the real extension: Tab 12 (4 Panes) → Tab 13 (2 Panes) → Tab 12 fails with "Could not open Tab: Timed out waiting for editor groups", and that Tab stays broken. Reproduced in the extension suite (test `returns to real Tab 12 after Tab 13 merges its already-open Pane Editors`, failing). Cause traced in VS Code 1.141.0 source: a move's source close removes the terminal from `TerminalEditorService`'s registry and it is re-added only when visible; an editor merged while hidden is orphaned, so the API rename (synthetic-name rebind), `show`, `dispose` are no-ops for it. So your decision A ("accept the restart; rebinding always completes") rests on a false assumption: for hidden merged editors the rebind never completes, identity is lost, and the projection deadlocks. A surplus merge happens on every Tab switch to a Tab with fewer Panes, so this is the common path.

The research recommends (prototyped; patched manager passes the regression and 87/87 extension tests; production reverted):
1. Rebind by pairing each move's target open with its source close (VS Code moves one editor at a time, open then close; source-backed, undocumented), choosing the unbound terminal Tab with the same label that appeared in the same step, else the most recent one. Same Terminal, no synthetic name, no client restart → also covers #73. Twin-name prototype: 10/10 correct.
2. Reveal a bound hidden Pane Editor by its Tab (focus its group + `workbench.action.openEditorAtIndex`) instead of `Terminal.show()`; activation also re-registers the orphan with VS Code.
3. Close orphans by Tab (`dispose()` leaves a zombie); republish the name after a heal.
Open: reliance on undocumented open-then-close order; lazy vs eager heal; revealing an orphan without moving focus; moves to the Panel/another window untested.

Note: you rejected option B earlier because "on target open the original bound tab still exists, so the lost-binding branch does nothing; if previousTabs is updated every reconcile, the target is not new when the source close removes the bound tab". Check whether the research's pairing answers that (it pairs per step / most recent unbound same-label tab).

Decide, standing in for the owner: the mechanism (this, a variant, or another), its owner and invariants, whether it is in this PR (I propose yes: the feature is broken without it) and whether it closes #73, which parts of `architecture.md` ("Accepted limitation", decision log) change, and the readiness questions an implementer would hit (heal timing, focus-preserving reveal, twin names, Panel moves: realistic or excluded). Record decisions in `progress.md`. No code changes, no interactive questions.

## Reply
Write your complete reply as Markdown to the reply-to path: summary ≤ 20 lines first, details below; last line exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
