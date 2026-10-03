# Slice S1: AgentsModel behavior (C1, C4)

Read `docs/design/issue-15-agents/tests-workers-brief.md` first.

**Owned file:** new `src/features/navigation/agents/AgentsModel.test.ts`.

**Seam:** `AgentsModel` (`src/features/navigation/agents/AgentsModel.ts`) built on a fake `NavigationContextSource` (`src/features/navigation/capabilities/index.ts`): `getState()` and `onDidChange`. Level: vitest behavioral.

**Conventions:** `src/features/navigation/panes/PanesModel.test.ts`, `src/features/navigation/spaces/SpacesModel.test.ts`. Snapshot types in `src/capabilities/sessions/snapshot.ts`.

## Scenarios

- **C1: Agent rows (issue #15 AC 1, AC 9).**
  - Rows follow the snapshot's Agent order (Herdr order) across Spaces, not grouped by Space or by Pane order. For example, the snapshot lists an Agent in Space B before one in Space A, and the Panes are listed in another order.
  - The label is `name`, then `displayAgent`, then `agent` (each fallback present once).
  - Each row exposes its Space, Herdr Tab, and the Pane row name (`paneName`: Pane `label`, then `terminalTitle`, then `Pane <id>`; one case is enough, the helper has its own owner).
  - When the context publishes a new snapshot where an Agent's Agent Status changed, the model notifies listeners with a row that carries the new status.
- **C4: stale and unavailable (AC 8).**
  - A stale context keeps the Agent rows of its snapshot and its reason.
  - An unavailable context gives an unavailable state with no rows.

Aim for about two or three tests in total.

**Focused command:** `npx vitest run src/features/navigation/agents`.
