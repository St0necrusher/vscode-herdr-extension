# Herdr Tab layout projection evidence

Date: 2026-09-16  
Environment: macOS, VS Code desktop, public extension API, Herdr 0.9.0 boundary

## Source/API evidence

- `ExtensionTerminalOptions.location` supports the terminal Panel, terminal Editor, an editor `viewColumn`, or a split relative to another terminal.
- `ViewColumn` identifies editor-grid columns; it carries no row, orientation, nesting, or ratio.
- `window.tabGroups` exposes current groups/tabs and close operations, but no typed create, split, move, resize, snapshot, or restore transaction for editor groups.
- VS Code's own bundled merge-conflict extension invokes `workbench.action.newGroupBelow`; the workbench also provides `workbench.action.newGroupRight`. These built-in command IDs offer a direction-aware experiment despite the missing structural API. The prototype feature-detects them with `commands.getCommands(true)` before invocation.
- A `Pseudoterminal` is sufficient to render an existing Herdr Pane through the already-validated `herdr terminal session observe|control` boundary.
- Herdr `layout.apply` creates fresh Panes. It is not a way to place existing Herdr-owned PTYs in VS Code and is intentionally absent from this prototype.

## Automated checks

- `npm run check:prototype` — **passed** (`node --check prototype/layout-projection/extension.js`).
- `git diff --check` — **passed**.
- The command captures `window.tabGroups` before and after placement and automatically compares every non-terminal tab's input identity, editor column, dirty state, and pinned state. The human pass will supply the Extension Host result.

## Human Extension Host checks

Validated by the user in a VS Code Extension Development Host:

| Case | Result | Notes |
|---|---|---|
| Single Pane with dirty untitled file | Passed | Unsaved contents and dirty tab remained intact. |
| Right split | Passed | Direction was reproduced by `newGroupRight`. |
| Down split via `newGroupBelow` | Passed | Second terminal appeared below as expected. |
| Mixed right/down tree | Passed | One terminal appeared left with two stacked on the right. |
| Non-50/50 ratios | Expected limitation | Direction/nesting worked; Herdr ratios were not applied. |
| Close surfaces between fixtures | Passed | Prototype surfaces could be cleared without losing the unsaved file. |
| Partial observer failure | Not run | Implementation hardening case; not needed for the layout feasibility decision. |
| Real Pane survival | Covered by #2/#3 | The earlier bridge/handoff prototypes already proved non-destructive observer/controller detach. |

## Decision boundary

The first human pass showed that a column-only approximation was usable, then correctly challenged the assumption that down-splits could not be automated because VS Code supports them interactively. The revised prototype recursively invoked feature-detected `newGroupRight`/`newGroupBelow` commands from concrete Pane anchors. Direction and nesting worked, including the mixed tree, without closing, moving, replacing, or cleaning the user's unsaved editor.

The MVP may therefore project Herdr's BSP direction and nesting through these built-in commands, with a bounded adapter and explicit verification after each split. The action remains **best-effort opening of Herdr Tab Panes**, not faithful synchronization: Herdr ratios cannot be applied, commands are imperative and focus-sensitive, group creation can fail, and there is no transaction/rollback API. On failure, keep the successfully opened observers, report the partial result, and never rearrange or close user editors to force fidelity.

This direction-aware projection is deliberately replaceable. If implementation or later asynchronous/live layout changes expose focus races, instability, or unacceptable editor disruption, fall back to the simpler deterministic policy: preserve Pane leaf order and open every Pane in adjacent VS Code columns while ignoring direction, nesting, and ratios. That fallback is an accepted product trade-off, not a blocker. Exact ratios remain in Herdr's own UI or would require a custom webview-owned layout surface.
