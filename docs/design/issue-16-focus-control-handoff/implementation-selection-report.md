# Slice 1 implementation report: Pane editor selection and Session events

## Result

Implemented the authorized production-only slice: a host-neutral `PaneEditorSelectionModel` owns unique `(Session ID, Pane ID)` selection and consumes the normalized `pane.moved` stream. The Sessions path preserves the move before its existing debounced snapshot invalidation/reconciliation, and `SessionsFeature` directly provides the narrow event-source capability.

## Criteria mapped to implementation

| Criterion | Status | Evidence |
| --- | --- | --- |
| Infrastructure owns the selection model and exact `select`, `deselect`, generic typed `subscribe`, and `dispose` API | Satisfied | `src/infrastructure/pane-editors/PaneEditorSelectionModel.ts` defines the contract and model; `src/infrastructure/pane-editors/index.ts` is its infrastructure-local entry. There is no state getter, public move operation, active-Session filter, VS Code dependency, or terminal behavior. |
| Selection is unique and idempotent; selected/deselected/moved events have the approved payloads; a move replaces only an existing previous identity | Satisfied | `PaneEditorSelectionModel.ts` stores Pane IDs by Session, suppresses duplicate select/deselect, and handles only a selected previous identity before publishing the exact `moved` payload. |
| Normalize and deliver `pane.moved` through connection → SessionsModel → SessionsFeature, with stale/replaced connection events rejected | Satisfied | `src/infrastructure/herdr/socket/protocol/HerdrProtocol.ts` validates the previous ID and new Pane ID with Session identity; malformed move identity becomes the existing invalid-response failure. `JsonSocketHerdrSessionConnection.ts` delivers before snapshot invalidation; `SessionsModel.ts` guards delivery with current attempt/generation and connection identity, and isolates/logs each subscriber failure while continuing delivery; `SessionsFeature.ts` implements and delegates the narrow source capability directly. |
| Preserve snapshot invalidation/reconciliation behavior | Satisfied | `JsonSocketHerdrSessionConnection.handleEvent` still marks accepted events dirty and uses its existing debounce/reconciliation path after move delivery. |
| Keep the implementation within authorized slice and do not add tests or compose later slices | Satisfied | No FocusTracker, manager, terminal creation, PTY, Panes wiring, extension composition, tests, fixtures, snapshots, architecture edits, staging, commit, or push were added. |

## Changed files

- `src/capabilities/sessions/connection.ts` — imports `HerdrPaneMovedEvent` for the optional connection-consumer delivery hook.
- `src/capabilities/sessions/sessionEvents.ts` — semantically owns the normalized event map/name/source capability.
- `src/capabilities/sessions/index.ts` — re-exports the event capability types.
- `src/features/sessions/SessionsModel.ts` — publishes current-connection move events with existing attempt/connection ownership checks.
- `src/features/sessions/SessionsFeature.ts` — directly implements `HerdrSessionEventSource` and delegates subscriptions.
- `src/infrastructure/herdr/socket/JsonSocketHerdrSessionConnection.ts` — decodes and forwards move event before marking snapshot state dirty.
- `src/infrastructure/herdr/socket/protocol/HerdrProtocol.ts` — normalizes the socket event using its Session ID and Pane IDs.
- `src/infrastructure/pane-editors/PaneEditorSelectionModel.ts` — infrastructure selection owner and public typed API.
- `src/infrastructure/pane-editors/index.ts` — infrastructure-local public entry.
- `docs/design/issue-16-focus-control-handoff/implementation-selection-report.md` — this durable implementation report.

## Validation

- After the reconciliation corrections, `npm run typecheck` — passed.
- After the reconciliation corrections, `npm run lint` — passed.
- After the reconciliation corrections, `npm run format:check` — passed.
- After the reconciliation corrections, `git diff --check` — passed; `git diff --cached --quiet` confirmed no staged files.
- The first validation run for the initial implementation found lint and formatting issues; those were corrected before its successful checkpoint. The checks above are a fresh successful rerun after the requested reconciliation.

No tests were added or run; slice instructions explicitly defer test authoring. No staged files were created.

## Limitations, deviations, and questions

- The socket normalizer expects Herdr's documented move shape to contain `data.previous_pane_id` and `data.pane.pane_id`; missing or malformed required identity now raises the existing invalid-response failure. This path has no automated test coverage because tests are outside this slice.
- `paneMoved` is optional on the existing connection consumer so current projection-only consumers remain structurally compatible; the Sessions model supplies it on the active path. `HerdrSessionEventSource` and its event map are owned by `src/capabilities/sessions/sessionEvents.ts`, not the connection lifecycle contract.
- No architecture or scope deviations were made. Reconciliation corrections: subscriber exceptions are logged per listener without interrupting subsequent deliveries; malformed recognized move events fail as invalid responses; event-source types were moved to their own capability file.
