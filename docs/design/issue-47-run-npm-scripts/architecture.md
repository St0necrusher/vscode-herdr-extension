# Issue #47 — Run package.json scripts in Herdr

Status: **approved 2026-10-02; implemented and tested** (decisions 1–6 and amendments below accepted by the user). Requirements: [#47](https://github.com/St0necrusher/vscode-herdr-extension/issues/47) (parent spec [#39](https://github.com/St0necrusher/vscode-herdr-extension/issues/39)). Architecture authority: [`code-architecture.md`](../../architecture/code-architecture.md). Research: [`issue-39-vscode-terminals-and-npm-scripts.md`](../../research/issue-39-vscode-terminals-and-npm-scripts.md). ADR 0008.

## Scope

In: "Run Script in Herdr" in the NPM Scripts view (inline + context menu), "Run in Herdr" hover link in `package.json`, runner resolution like VS Code's Run Script, a new Herdr Tab per run (cwd, label, no focus), running the command in its root Pane, opening the Pane Editor, enablement, error notifications.

Out: everything in #39's Out of Scope; the terminal profile and Use as Default Terminal (other #39 tickets).

## Herdr facts (protocol 22, `herdr api schema --json`, Herdr 0.9.0)

| Request | Params we send | Result |
| --- | --- | --- |
| `tab.create` | `workspace_id`, `focus: false`, + optional `cwd`, `label` | `tab_created {tab, root_pane}` |
| `pane.send_input` | `pane_id`, `text: <command line>`, `keys: ["Enter"]` | `ok` |

**Correction to the ticket:** the socket API has no `pane.run` method, in 0.9.0 or in the latest 0.9.3 (protocol 22 in both). The CLI `herdr pane run` sends exactly one `pane.send_input {pane_id, text, keys: ["Enter"]}`, and we send the same. The server writes the input to the PTY at once and returns `ok`; the Pane stays a live shell. See [research-herdr-pane-run.md](research-herdr-pane-run.md).

## Modules and responsibilities

```text
extension/HerdrExtension (unchanged wiring: creation = SessionsFeature)
        │
features/sessions ── implements ──► capabilities/sessions: ActiveSessionCreation
        │                              createPane(+cwd, +label), + runCommand
        ▼
infrastructure/herdr/socket: tab.create params, pane.send_input
        ▲
features/navigation (NavigationFeature composes)
   ├─ panes/PanesFeature         implements NavigationPaneOpening (unchanged)
   ├─ spaces/SpacesFeature       (unchanged)
   └─ scripts/ScriptsFeature     NEW child: Run Script in Herdr
        consumes NavigationContextSource, ActiveSessionCreation, NavigationPaneOpening
        └─ view/VsCodeScriptsView  hover provider, npm element parsing, error copy
```

- **Sessions / socket** own whether a mutation may be sent, the requests, and decoding. `runCommand` changes no structure, so it does not wait for a new snapshot.
- **Navigation/scripts** owns the user workflow: target from either entry point, command resolution, reading the Selected Space, create → run → open, error copy, hover visibility.
- Why a Navigation child, not a top-level feature: it needs the Selected Space and Pane opening, both Navigation-owned. A top-level feature would need new repository-level capabilities for them. Same pattern as Spaces consuming `NavigationPaneOpening`.

## Domain model

No new domain terms (as #39 states). Local, feature-private values only:

- `NpmScriptTarget = { script: string; packageJsonUri: Uri }`, produced by both entry points.
- The command line string (`<runner> run <quoted script>` or `node --run <quoted script>`).

Nothing tracks which Pane runs which script.

## Data flow (primary: NPM Scripts view)

1. User clicks the inline button on script `dev` in `/repo/packages/web/package.json`. VS Code calls `herdr.runNpmScript(element)`.
2. View parses `element.task.definition.script` and `element.package.resourceUri` into a target; wrong shape → error notification, stop.
3. Feature resolves the runner: `npm.scriptRunner(workspaceFolder.uri)` → on failure/non-string `npm.packageManager(workspaceFolder.uri)` → `"npm"`. Builds `pnpm run dev`.
4. Feature reads Navigation context: not `connected` → return silently (like New Pane); no `selectedSpaceId` → error "no Selected Space".
5. `creation.createPane({ sessionId, spaceId, cwd: "/repo/packages/web", label: "dev" })` → `tab.create` → resolves after the snapshot containing the Pane is published. Failure → error, stop.
6. `creation.runCommand({ sessionId, paneId, command: "pnpm run dev" })` → `pane.send_input {text, keys: ["Enter"]}`. Failure → error "Tab was created but the script could not be started", Tab kept, stop.
7. `panes.openPane(paneId)` → Pane Editor opens and takes focus. Failure → error "created but could not be opened", Tab kept.

Hover flow: provider on `{ language: "json", scheme: "file", pattern: "**/package.json" }` finds a key inside the top-level `scripts` object under the cursor (via `jsonc-parser`). It returns a trusted markdown link `command:herdr.runNpmScriptFromHover?[{script, documentUri}]` only while the Navigation context is `connected`. The command maps its args to the same target and runs steps 3–7.

## Public seams

```ts
// capabilities/sessions/creation.ts — changed
export type CreatePaneRequest = Readonly<{ sessionId: string; spaceId: string; cwd?: string; label?: string }>;
export type RunCommandRequest = Readonly<{ sessionId: string; paneId: string; command: string }>;
export interface ActiveSessionCreation {
  createSpace(...); splitPane(...);            // unchanged
  createPane(request: CreatePaneRequest): Promise<CreatedPane>;
  runCommand(request: RunCommandRequest): Promise<void>;   // new
}

// capabilities/sessions/connection.ts — changed
interface HerdrSessionConnection {
  createPane(spaceId: string, options?: Readonly<{ cwd?: string; label?: string }>): Promise<CreatedPane>;
  runCommand(paneId: string, command: string): Promise<void>;
}
```

- `runCommand` follows the same active-Session guard as other creation operations (rejects without sending when not the active connected Session).
- `tab.create` sends `cwd`/`label` only when given; New Pane's request is unchanged.
- Commands: `herdr.runNpmScript` (view element arg), `herdr.runNpmScriptFromHover` (hover args). Both hidden from the Command Palette. View menus use `enablement: herdr.paneActionsEnabled`, as New Pane does.

## Expected file structure

```text
package.json                                   CHANGED commands, view/item/context (view == npm && viewItem == script, inline + context), palette hiding; dependency jsonc-parser
src/capabilities/sessions/creation.ts          CHANGED CreatePaneRequest cwd/label, RunCommandRequest, runCommand
src/capabilities/sessions/connection.ts        CHANGED createPane options, runCommand
src/capabilities/sessions/index.ts             CHANGED export RunCommandRequest
src/features/sessions/SessionsModel.ts         CHANGED pass options, runCommand guard
src/features/sessions/SessionsFeature.ts       CHANGED forward runCommand
src/infrastructure/herdr/socket/JsonSocketHerdrSessionConnection.ts  CHANGED tab.create params, pane.send_input
src/features/navigation/NavigationFeature.ts   CHANGED compose ScriptsFeature(context, creation, panes)
src/features/navigation/scripts/               NEW child feature
  index.ts
  ScriptsFeature.ts                            commands + run workflow
  npmScriptCommand.ts                          runner resolution + command line + POSIX shell quoting
  view/index.ts
  view/VsCodeScriptsView.ts                    hover provider, npm element parsing, notifications
```

## Decisions to confirm

1. ~~`pane.send_input` instead of `pane.run`~~ — confirmed by research: it is what `herdr pane run` sends.
2. `npm.runSilent` is ignored (ticket's literal `<runner> run <script>`; js-debug does the same).
3. Shell quoting: POSIX single quotes, applied only when the name has characters outside `[A-Za-z0-9_./:@%+=,-]` (so `build:prod` stays readable). Herdr runs on macOS/Linux; `'\''` also works in fish.
4. If `runCommand` fails, the Pane Editor is not opened (error points to the Panes View, user story 17).
5. `jsonc-parser` as a runtime dependency for the hover (already in the lockfile transitively; the npm extension uses it).
6. Two commands (view, hover) rather than one command parsing two argument shapes.

## Verification plan (preliminary)

### Critical now

| # | Observable behaviour | Protects | Seam / level |
| --- | --- | --- | --- |
| C1 | View command with an NpmScript-shaped element: `createPane` gets Selected Space, cwd = package.json folder, label = script; `runCommand` gets the runner-resolved command (fixture lockfile → real npm extension); Pane Editor opened for the created Pane | primary path, runner contract | extension test (`creation-commands` style: fake projection + recording creation + recording opening) |
| C2 | Hover on a script key in a fixture `package.json` contains a "Run in Herdr" link while connected and none while stale | hover entry + visibility | extension test via `vscode.executeHoverProvider` |
| C3 | Hover link command runs the same flow (create request with cwd/label) | second entry point | extension test |
| C4 | `runCommand` fails after creation: no Pane Editor opened, no close request (Tab kept) | #17 keep-server-state rule | extension test |
| C5 | No Selected Space / malformed element: no creation request | failure paths | extension test |
| C6 | `tab.create` carries `cwd`, `label`, `focus: false`; New Pane's params unchanged; `runCommand` sends `pane.send_input {pane_id, text, keys:["Enter"]}` and resolves on `ok` | adapter contract | socket integration test |

### Optional

- Pure tests of command-line building: `node` runner, names with spaces/quotes.
- Runner fallback when `npm.scriptRunner` is unavailable.

### Deliberately excluded

- VS Code npm extension's own resolution logic, menu `when`/`enablement` evaluation, Herdr executing the command, notification text.

## Open questions

None. Remaining details are settled with the user in the implementation session.

## Amendments after implementation (2026-10-02)

Reported by the implementation delegate `opus-impl-47` and agreed with the user in its tab. Reconciled against the diff by the parent.

- **A1 — third entry point (scope addition).** An editor context menu item in `package.json` runs `herdr.runNpmScriptAtCursor`.
  - Menu: `editor/context`, `when: resourceFilename == 'package.json' && resourceScheme == file`, `navigation@1`, which places it right after VS Code's "Run Script".
  - Enablement: `herdr.paneActionsEnabled`.
  - Like `npm.runSelectedScript`, it takes the script whose name or value is under the cursor. If there is none, it shows the error "No npm script at the cursor."
  - The hover stays name-only.
- **A2 — `package.json` outside any workspace folder** still runs. The runner is then resolved for the `package.json` folder instead of the workspace folder.
- **D1 — `esbuild.mjs`** sets `mainFields: ["module", "main"]`. jsonc-parser's UMD entry leaves an unbundled runtime `require("./impl/format")` that would break activation.
- **Hover args.** `documentUri` is passed as `Uri.toString()` and read back with `Uri.parse`.
- **Ordering.** The runner is resolved before the connected / Selected Space check, as the data flow above lists.
- **Error copy (accepted):**
  - "Select a Herdr Space to run the script in."
  - "Could not create a Herdr Tab for the script: …"
  - "Herdr Tab was created but the script could not be started: …"
  - "Script was started but its Pane could not be opened: …"
  - "Could not run the script in Herdr: the NPM Scripts item has an unexpected shape."
- **Domain and ADRs.** No new `CONTEXT.md` terms. No ADR: the `pane.send_input` decision lives in this design.
- **Live check.** The user verified the view button, the hover link, and the editor-menu runs against a live Herdr from a VSIX.
