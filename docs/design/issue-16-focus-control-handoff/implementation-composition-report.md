# Issue #16 production composition report

## Result

Replaced the extension's production `TerminalSurfacesFeature` (#14) composition with the existing infrastructure-owned Pane editor path. The existing `PaneTerminalOpening` capability remains the Navigation-to-composition seam; `PaneTerminalSurfaceManager` now implements it by selecting a missing Pane identity or revealing its already-managed surface. The Extension constructs exactly one opening provider, so one production Pane action cannot invoke both implementations.

## Ownership, construction, and disposal evidence

`HerdrExtension` remains the nearest common composition and lifecycle owner:

1. It constructs `SessionsFeature`, which remains the provider of the active-Session projection and normalized `pane.moved` events, plus the existing configuration and logger.
2. It constructs `PaneEditorSelectionModel` over `SessionsFeature` and immediately constructs `PaneEditorFocusTracker` over that Selection. No Selection producer or restoration runs between them.
3. It constructs `HerdrPaneClientFactory` with the existing configuration, logger, and `context.asAbsolutePath("resources/herdr-direct-attach.toml")`. The Surface factory receives no configuration path in its requests.
4. It constructs `PaneTerminalSurfaceManager` over the same Selection and Session event source. Its factory creates `VsCodePaneTerminalSurface` with the same `SessionsFeature` as projection and event source, plus the shared FocusTracker, Pane client factory, and logger.
5. It constructs `NavigationFeature` last and injects the manager through the existing `PaneTerminalOpening` capability. Panes is therefore unable to call the old implementation from production composition.

Normal disposal and constructor-failure cleanup follow reverse ownership order: Navigation; manager and all its Surfaces; FocusTracker; Selection; Sessions; logger. This keeps the Session event/projection provider alive until its Surface and Selection consumers are disposed. The static TOML file is under `resources/`, is not excluded by `.vscodeignore`, and is resolved relative to the installed extension root; the build bundles only the extension entry, so the packaged resource remains a normal VSIX file rather than a generated `dist` artifact.

## Criteria mapping

| Criterion | Status | Evidence |
| --- | --- | --- |
| Replace, rather than compose beside, the #14 user opening path | Satisfied | `HerdrExtension` no longer imports or constructs `TerminalSurfacesFeature` or `HerdrCliTerminalObserverFactory`; Navigation receives only `PaneTerminalSurfaceManager`. The manager implements the existing opening capability and routes requests into Selection/its single registry. |
| Preserve construction ordering | Satisfied | In `HerdrExtension`, `PaneEditorSelectionModel` is constructed immediately before `PaneEditorFocusTracker`; factory and manager follow, and `NavigationFeature` is constructed last. No restoration or Selection producer precedes the tracker. |
| Compose all existing issue #16 collaborators through existing owners | Satisfied | `HerdrExtension` uses `SessionsFeature`, `VsCodeHerdrConfiguration`, and `VsCodeHerdrLogger`; its manager factory creates `VsCodePaneTerminalSurface` with those Session capabilities and the shared FocusTracker/`HerdrPaneClientFactory`. |
| Inject the packaged config path through the factory | Satisfied | `context.asAbsolutePath("resources/herdr-direct-attach.toml")` is passed to `HerdrPaneClientFactory`; `VsCodePaneTerminalSurface` receives the factory, not the path. |
| Dispose each resource through its owner in safe order | Satisfied | `HerdrExtension.dispose()` and construction rollback dispose Navigation → manager/Surfaces → FocusTracker → Selection → Sessions → logger. Manager owns Surface disposal; each Surface owns its clients and VS Code terminal. |
| Keep the diff bounded and public capability direction intact | Satisfied | The existing capability remains at the common owner and is implemented directly by the manager; only the extension composition and the two required infrastructure barrel surfaces change. The obsolete CLI observer factory is removed from the production Herdr barrel but its implementation remains available to unchanged direct-import tests. |

## Changed files

- `src/extension/HerdrExtension.ts` — swaps the #14 composition for Selection, FocusTracker, Pane clients, Surface manager, and concrete Surface construction; records and disposes them in reverse ownership order.
- `src/infrastructure/pane-editors/PaneTerminalSurfaceManager.ts` — implements the existing `PaneTerminalOpening` capability, restores Selection for every explicit open intent, routes requests through its registry, and rolls back partially acquired constructor subscriptions.
- `src/infrastructure/pane-editors/PaneEditorFocusTracker.ts` — rolls back partially acquired Selection subscriptions if constructor setup fails.
- `src/infrastructure/pane-editors/PaneTerminalSurface.ts` — rolls back a partially constructed terminal and its subscriptions if Surface construction fails.
- `src/infrastructure/pane-editors/index.ts` — exports `HerdrPaneClientFactory` and `VsCodePaneTerminalSurface` for the extension composition owner.
- `src/infrastructure/herdr/index.ts` — removes the obsolete #14 observer factory from the production infrastructure entry; its implementation remains for unchanged test imports.

No tests, fixtures, snapshots, manifests, resource files, or architecture/progress records were edited. The old #14 source files remain because unchanged tests import them directly; they are no longer imported from the production extension composition. No files were staged.

## Independent-review corrections

The independent review found two actionable lifecycle gaps, both corrected before commit:

1. An explicit open of an already-managed active Surface now always calls idempotent `Selection.select(...)` before the active-tab no-op. This restores Selection and FocusTracker consistency even if the retained Surface was deselected before the open intent.
2. Constructors that acquire several live subscriptions/resources now release already-acquired resources if a later constructor step throws. Manager and FocusTracker roll back partial subscriptions; Surface additionally disposes a partially created VS Code terminal and its emitters. `HerdrExtension` can therefore rely on each child constructor either completing ownership transfer or cleaning up its own partial acquisition.

The review's Navigation teardown note was non-actionable: no evidence showed that `NavigationFeature.dispose()` invokes `PaneTerminalOpening`, and manager disposal remains guarded and ordered after Navigation.

## Parent documentation reconciliation

After reviewing this implementation, the parent updated `architecture.md` and `progress.md` to record the production composition owner, construction and disposal order, packaged configuration injection, removal of the #14 path from production reachability, review corrections, and the remaining `/build` human-review and separately authorized verification gates.

## Validation and residual risks

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed; Prettier reported all matched files conforming.
- `npm run build` — passed, including its TypeScript check and esbuild bundle.
- `git diff --check` — passed.
- Staging was not modified. Parent inspection confirmed the worktree contains only unstaged changes; `git diff --cached --quiet` was not run by the implementation worker.

No tests or live VS Code/Herdr verification were run, as explicitly excluded. The retained #14 source is still typechecked because unchanged tests import it, so any future deletion requires a separately authorized test migration. The packed-VSIX inclusion assertion is source/config based (`resources/` is not ignored); an actual package/runtime check was not part of this task.
