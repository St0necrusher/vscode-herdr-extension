# Issue #16 placement and Tab-binding implementation report

## Result

Implemented and parent-reviewed the authorized Slice 4 in the infrastructure-owned Pane editor manager. Following parent review, removed unnecessary pending-creation maps, queue, serialization flags, and pending-move handling. The final implementation relies on Selection's idempotent event behavior and the approved unique temporary terminal name: an unmanaged selected identity is handled synchronously with one factory call, then registered, revealed, and reconciled.

The manager owns VS Code Tab-object bindings, all-group active-tab normalization, and the single-Pane create/reveal/no-op policy. No concrete Surface, extension composition, observe/attach path, PTY/CLI behavior, #14 integration, persistence, or tests were added.

## Criteria mapping

| Criterion | Status | Implementation evidence |
| --- | --- | --- |
| Extend the manager as owner of placement and runtime Pane-surface-to-Tab bindings; keep Surface independent and only `reveal()`/`dispose()` | Satisfied | `PaneTerminalSurfaceManager` stores each managed handle with manager-owned identity and an optional `vscode.Tab`. `PaneTerminalSurface` still exposes only `reveal()` and `dispose()`. |
| Apply the approved create/reveal/no-op policy and pass captured active `viewColumn` | Satisfied | `handleSelected` returns when a bound Tab is active in any group; otherwise reveals the existing Surface. For an unmanaged identity it captures `activeTabGroup.viewColumn`, derives the exact temporary name, calls the synchronous factory once, registers the result, reveals it, and reconciles bindings. |
| Correlate through exact temporary terminal name and retain enclosing Tab identity | Satisfied | Factory receives `${sessionId}:${paneId}` and captured `ViewColumn`; reconciliation uses `instanceof vscode.TabInputTerminal` plus exact label equality, then stores the enclosing `vscode.Tab`. Bound object identity is retained while that Tab remains in editor groups. |
| Normalize manual active-tab changes through Selection | Satisfied | `onDidChangeTabs` triggers reconciliation for opened and changed tabs. Selection derives from `group.activeTab === binding.tab` over every group, preserving independently selected tabs and avoiding `group.isActive` and `window.activeTerminal`. Changes to the active group alone are irrelevant. |
| Release a Surface when its VS Code terminal editor tab closes | Satisfied | When `event.closed` contains a managed bound Tab, the manager removes its registry entry, deselects its Pane identity, and disposes only the extension-owned Surface. The server-owned Herdr Pane remains outside this cleanup. |
| Keep direct `pane.moved` registry update | Satisfied | The manager independently subscribes to normalized `pane.moved` and updates only an already-managed surface's registry identity, retaining its Tab binding. |
| Stay within exclusions | Satisfied | Only the manager and factory seam changed; no tests, concrete Surface, composition, #14 changes, or broader implementation were added. |

## Changed files and seams

- `src/infrastructure/pane-editors/PaneTerminalSurfaceManager.ts`
  - Stores each managed handle with its current selection identity, initial temporary name, and optional runtime `vscode.Tab` binding.
  - On an unmanaged `selected` identity, synchronously captures the active group's `viewColumn`, derives `${sessionId}:${paneId}`, calls the factory once, registers, reveals, and reconciles. Existing managed identities use active-tab no-op or reveal behavior.
  - Listens to tab changes, matches unbound surfaces by exact temporary label, preserves Tab object identity while present, and normalizes active state across all groups.
  - Removes and disposes a managed Surface when its bound VS Code terminal editor tab appears in `event.closed`, while leaving the server-owned Herdr Pane alive.
  - Preserves the direct normalized `pane.moved` subscription and updates managed registry identity only.
- `src/infrastructure/pane-editors/PaneTerminalSurface.ts`
  - Extends the factory seam to receive captured `vscode.ViewColumn` and the exact temporary terminal name. The Surface handle API remains unchanged.

No pending registry, creation queue, creation-in-flight flag, or pending-move state is present.

## Validation evidence

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run format:check` | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |

No tests were added or run; test authoring remains outside this slice.

## Limitations

- No concrete Surface/factory implementation exists in this slice, so actual terminal creation with the passed name/location and post-bind display-name change are not runtime-integrated yet.
- Automated coverage is intentionally absent under the current authorization.
