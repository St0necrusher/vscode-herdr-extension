# Slice D: wiring and manifest

Read `common.md` in this folder first. Slices A (socket + Sessions), B (Panes) and C (Spaces) are already in the working tree and accepted; run `git diff` to see them. Nobody else is editing now, so the whole typecheck must end clean.

## You own

- `src/features/navigation/NavigationFeature.ts`
- `src/extension/HerdrExtension.ts`
- `package.json`
- `test/extension/pane-command.test.ts` and `test/extension/creation-commands.test.ts`, only for the edits listed in task 3.

## Tasks

### 1. Wiring

- `NavigationFeature` dependencies gain `management: ActiveSessionManagement` and `paneClosing: PaneTerminalClosing`. Pass them to the new `PanesFeature` and `SpacesFeature` constructors (see their signatures in the source). Keep construction and disposal order as today.
- `HerdrExtension`: pass `sessionOwner` as `management` and `surfaceManager` as `paneClosing`.

### 2. Manifest (`package.json`)

Commands (all `enablement` on the view's context key; icons `$(edit)` for rename, `$(close)` for close):

| Command | Title | Enablement |
| --- | --- | --- |
| `herdr.renamePane` | Herdr: Rename Pane… | `herdr.paneActionsEnabled` |
| `herdr.renameTab` | Herdr: Rename Tab… | `herdr.paneActionsEnabled` |
| `herdr.closePane` | Herdr: Close Pane | `herdr.paneActionsEnabled` |
| `herdr.closeTab` | Herdr: Close Tab | `herdr.paneActionsEnabled` |
| `herdr.renameSpace` | Herdr: Rename Space… | `herdr.spaceActionsEnabled` |
| `herdr.closeSpace` | Herdr: Close Space | `herdr.spaceActionsEnabled` |
| `herdr.closeGroup` | Herdr: Close Group | `herdr.spaceActionsEnabled` |

- Rename the existing enablement keys: `herdr.paneCreationEnabled` → `herdr.paneActionsEnabled`, `herdr.spaceCreationEnabled` → `herdr.spaceActionsEnabled`.

`view/item/context` entries. Row `contextValue`s are `herdr.panes.(pane|singleton|group)` with an optional `.closable` suffix, and `herdr.space` / `herdr.space.selected` with an optional `.group` suffix:

- `herdr.renamePane`: Panes view, pane or singleton rows (closable or not); group `edit@1`.
- `herdr.renameTab`: Panes view, group or singleton rows; group `edit@2`.
- `herdr.closePane`: Panes view, pane or singleton rows with `.closable`; group `close@1`.
- `herdr.closeTab`: Panes view, group rows with `.closable`; group `close@2`.
- `herdr.renameSpace`: Spaces view, every Space row; group `edit@1`.
- `herdr.closeSpace`: Spaces view, Space rows without `.group`; group `close@1`.
- `herdr.closeGroup`: Spaces view, Space rows with `.group`; group `close@1`.
- The existing split entries must still match pane and singleton rows now that they may carry `.closable`: widen their regex accordingly.

Inline `×`: add a second `view/item/context` entry with group `inline` for each of the four close commands, with the same `when` plus `&& config.herdr.views.showInlineClose`.

`commandPalette`: hide all seven new commands with `"when": "false"`.

Configuration: add `herdr.views.showInlineClose`, boolean, default `true`, description: "Show an inline close button on Pane, Tab, and Space rows in the Herdr views. Close actions stay available in the context menu."

### 3. Existing tests (compile and renamed keys only)

- `test/extension/pane-command.test.ts`: add the two new `PanesFeature` constructor arguments as fakes whose methods reject with `new Error("not used")` (`closePanes` may be a no-op throwing `new Error("not used")`). Change nothing else.
- `test/extension/creation-commands.test.ts`: pass `management` and `paneClosing` fakes of the same kind to `NavigationFeature`, and rename the two context keys in the context-key test. Change nothing else; do not weaken any assertion.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm run format:check`. All must pass. Do not run the test suites.
