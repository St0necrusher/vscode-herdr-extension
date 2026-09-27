# Pane row naming in the Panes view

Status: **approved and implemented** (2026-09-27). Requirements come from the user request (2026-09-27), not from the #13 ticket text.
Follow-up to issue #13 (Browse Spaces and Panes natively); see [`../issue-13-spaces-panes-navigation/`](../issue-13-spaces-panes-navigation/).

## Requirements

Terms: *Tab name* = `HerdrTab.label`; *Pane label* = `HerdrPane.label`; *terminal name* = `HerdrPane.terminalTitle`;
*trimmed terminal name* = `HerdrPane.terminalTitleStripped`.

1. Tab with several Panes (group):
   - group row primary = Tab name (unchanged);
   - each Pane row primary = Pane label, else terminal name.
2. Tab with one Pane (singleton row):
   - Pane label set and equal to Tab name → primary = label, no secondary;
   - Pane label set and different → primary = Tab name, secondary = label;
   - no label, Tab name equals trimmed terminal name → primary = terminal name, no secondary;
   - no label, otherwise → primary = Tab name, secondary = terminal name.

## Design

- Owner: `PanesModel` (navigation/panes) keeps owning the derived naming; the View keeps rendering.
- `PaneNavigationRow.name` = the Pane's own name: `label ?? terminalTitle ?? "Pane <id>"`. Agent-name fallbacks are dropped (open question 1).
  It remains the name passed to `PaneTerminalOpening.openPane`.
- `PaneNavigationSingleton` gains `title: string` and `description?: string`, derived by rule 2.
- `VsCodePanesView`: singleton uses `title` / `description`; group Pane rows use `name`; tooltip/accessibility follow.
- Equality is exact string comparison.

Files: `PanesModel.ts` (changed), `view/VsCodePanesView.ts` (changed), `PanesModel.test.ts` (changed). No new files.

## Verification plan

Critical: PanesModel unit cases for each rule-2 branch and group Pane naming (label, terminal name, fallback).
Excluded: View rendering tests (no existing View test harness).

## Decisions

1. Agent name / displayAgent / agent title fallbacks are dropped.
2. Singleton with no label and no terminal name → primary = Tab name, no secondary.
3. Comparisons are exact (case- and whitespace-sensitive).
