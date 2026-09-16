# Herdr Tab layout projection evidence

Date: 2026-09-16  
Environment: macOS, VS Code desktop, public extension API, Herdr 0.9.0 boundary

## Source/API evidence

- `ExtensionTerminalOptions.location` supports the terminal Panel, terminal Editor, an editor `viewColumn`, or a split relative to another terminal.
- `ViewColumn` identifies editor-grid columns; it carries no row, orientation, nesting, or ratio.
- `window.tabGroups` exposes current groups/tabs and close operations, but no public create, split, move, resize, snapshot, or restore transaction for editor groups.
- A `Pseudoterminal` is sufficient to render an existing Herdr Pane through the already-validated `herdr terminal session observe|control` boundary.
- Herdr `layout.apply` creates fresh Panes. It is not a way to place existing Herdr-owned PTYs in VS Code and is intentionally absent from this prototype.

## Automated checks

- `npm run check:prototype` — **passed** (`node --check prototype/layout-projection/extension.js`).
- `git diff --check` — **passed**.
- The command captures `window.tabGroups` before and after placement and automatically compares every non-terminal tab's input identity, editor column, dirty state, and pinned state. The human pass will supply the Extension Host result.

## Human Extension Host checks

Pending. Follow `README.md` and record:

| Case | Result | Notes |
|---|---|---|
| Single Pane with dirty file | Pending | |
| Right split into empty adjacent column | Pending | |
| Right split into occupied adjacent column | Pending | |
| Down split fallback | Pending | |
| Mixed tree and non-50/50 ratios | Pending | |
| Repeated action/reuse | Pending | |
| Partial observer failure | Pending | |
| Close surface; Herdr Pane survives | Pending | |

## Provisional boundary

The implementation evidence rules out an exact, public-API-only projection of arbitrary Herdr BSP geometry. The first human pass confirmed that this fidelity loss is not an MVP blocker. The agreed approximation is to preserve Pane leaf order while mapping every Herdr split to another adjacent VS Code editor column; direction, nesting, and ratios are ignored. The remaining pass checks that this revised approximation does not close, move, replace, or dirty/clean existing file editors unexpectedly.

If that pass succeeds, the MVP should describe the action as **best-effort opening of Herdr Tab Panes**, not faithful layout synchronization. Leaves beyond `ViewColumn.Nine` share the ninth column as tabs. Exact layout remains in Herdr's own UI or would require a custom webview-owned layout surface.
