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

Pending. Follow `README.md` and record:

| Case | Result | Notes |
|---|---|---|
| Single Pane with dirty file | Pending | |
| Right split into empty adjacent column | Pending | |
| Right split into occupied adjacent column | Pending | |
| Down split via `newGroupBelow` | Pending | |
| Mixed tree and non-50/50 ratios | Pending | |
| Repeated action/reuse | Pending | |
| Partial observer failure | Pending | |
| Close surface; Herdr Pane survives | Pending | |

## Provisional boundary

The first human pass showed that a column-only approximation is usable, then correctly challenged the assumption that down-splits cannot be automated because VS Code supports them interactively. The revised experiment recursively invokes `newGroupRight`/`newGroupBelow` from a concrete Pane anchor. It checks whether direction and nesting can be preserved without closing, moving, replacing, or dirtying/cleaning existing file editors.

Even if this pass succeeds, the action remains **best-effort opening of Herdr Tab Panes**, not faithful synchronization: Herdr ratios cannot be applied, workbench commands are imperative and focus-sensitive, group creation can fail, and there is no transaction/rollback API. Exact ratio fidelity remains in Herdr's own UI or would require a custom webview-owned layout surface.
