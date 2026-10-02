# Issue #39: VS Code terminals, terminal profiles, and npm scripts

**Research date:** 2026-10-02
**Issue:** [St0necrusher/vscode-herdr-extension#39](https://github.com/St0necrusher/vscode-herdr-extension/issues/39)
**VS Code version checked:** 1.140.0 (tag `1.140.0` = commit [`07f806f`](https://github.com/microsoft/vscode/tree/07f806f999227108933c2e30515b26eecc1fda74), the same commit as the local test build `.vscode-test/vscode-darwin-arm64-1.140.0/`, `product.json` `commit`).
**Confidence boundary:** every claim below comes from the VS Code 1.140.0 source (permalinks pinned to `07f806f`), `vscode.d.ts` at that commit, the built-in `npm` extension shipped in the local 1.140.0 build, or GitHub issue metadata read on 2026-10-02. Statements derived from reading source but not exercised at runtime are marked **Source-only**. Anything not confirmed is marked **Unconfirmed**. Herdr is out of scope.

Abbreviations used in links:
- `B` = `https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74`
- `SHIPPED_NPM` = `.vscode-test/vscode-darwin-arm64-1.140.0/Visual Studio Code.app/Contents/Resources/app/extensions/npm/` (local 1.140.0 build)

## Summary

- **"What to run and where" is fully reproducible.** For a script, the built-in npm extension creates `new ShellExecution(runner, ['run', ('--silent'), script], { cwd: dirname(package.json) })`, where `runner` is `npm.scriptRunner` (`auto` → lockfile detection) and `node` becomes `node --run <script>`. The logic is ~30 lines and depends only on settings plus a lockfile probe.
- **The npm extension exposes two callable commands, `npm.scriptRunner` and `npm.packageManager`.** Both take a `Uri` and return the resolved runner or package manager as a string. Neither is documented API: `npm.packageManager` is declared in `package.json` but hidden from the palette, and `npm.scriptRunner` is registered but not declared. js-debug already calls both.
- **`tasks.fetchTasks({ type: 'npm' })` works but is a full workspace scan.** It runs `findFiles('**/package.json')`, opens and parses each file, and probes lockfiles once per script. The result is cached until any `package.json` or `npm.*` setting changes. It returns nothing when `npm.autoDetect` is `off`, `task.autoDetect` is `off`, or the workspace is untrusted. It drops the provider's result after 5 s. No public API returns "the npm task for script X in Y" without that scan.
- **NPM Scripts view (`npm`) supports third-party menus.** Context values are `folder`, `packageJSON`, `script` and `noscripts`. Any extension can add `view/item/context` or inline commands with `view == npm && viewItem == script`. The command receives the npm extension's own `NpmScript` tree element, which exposes `.task` (with `definition.script` and `definition.path`), `.package.resourceUri` (the package.json `Uri`) and `.label`. These are internal, unversioned shapes.
- **The package.json "Run Script | Debug Script" UI is a hover from the npm extension** (`npm.scriptHover`). The only CodeLens is a single **Debug** lens, also registered by the npm extension but driven by js-debug's `debug.javascript.codelens.npmScripts`. Our own hover or CodeLens on `**/package.json` can coexist with both: VS Code merges providers.
- **Terminal profiles:** `contributes.terminal.profiles` auto-generates the `onTerminalProfile:<id>` activation event. A provider can return `ExtensionTerminalOptions` with a `pty`. The provider is not told the requested cwd. A plain `TerminalLocation` enum returned by the provider overrides the panel/editor location, but an object `{ viewColumn }` is ignored (**Source-only**). Profile pty terminals are always transient, so they are not restored on reload.
- **Startup race:** #123188 was closed in May 2021 (fix for non-extension default profiles). #263504 is **open** but is about *restored* sessions ignoring a workspace profile, not specifically extension profiles. No open upstream issue specific to "extension default profile loses the startup race" was found.
- **Tasks cannot reach an extension profile.** `automationProfile.<os>` must be an object with a string `path`. If it is unset, tasks fall back to the default profile, but only to non-extension profiles. Tasks run with an explicit executable, which also skips contributed-profile lookup. The only pty route for tasks is `CustomExecution` in our own `TaskProvider`.

## 1. Built-in npm extension: tasks returned by `fetchTasks({ type: 'npm' })`

### 1.1 Task shape

Source: `extensions/npm/src/tasks.ts` at 1.140.0.

- **Definition.** `INpmTaskDefinition { type: 'npm'; script: string; path?: string }` ([B/extensions/npm/src/tasks.ts#L20-L23](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L20-L23)). The shipped `taskDefinitions` entry has `required: ["script"]`, properties `script` and `path`, and `when: "shellExecutionSupported"` (`SHIPPED_NPM/package.json`, `contributes.taskDefinitions`).
- **`path`.** Set only when the package.json is not at the workspace-folder root. It is the folder path relative to the workspace folder, with no trailing slash and no `package.json` ([tasks.ts#L337-L340](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L337-L340), [getRelativePath L314-L317](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L314-L317)). The inverse mapping is `getPackageJsonUriFromTask` = `scope.uri.fsPath / definition.path / package.json` ([L390-L399](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L390-L399)).
- **Name.** `script`, or `"<script> - <relative path>"` for nested packages ([L297-L302](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L297-L302)).
- **Scope.** The `WorkspaceFolder` that contains the package.json ([L275](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L275), [L345](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L345)). `source` is `'npm'`.
- **Execution.** `new ShellExecution(scriptRunner, escapeCommandLine(args), { cwd })`, where `cwd = path.dirname(packageJsonUri.fsPath)` is an **absolute** filesystem path ([L342-L345](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L342-L345)). No `env` is set.
- **Command and args** ([getRunScriptCommand L319-L332](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L319-L332)):
  - runner `node` → `node --run <script>`;
  - otherwise `<runner> run [--silent] <script>`, with `--silent` added when `npm.runSilent` is true.
  - The first element becomes `ShellExecution.command`, and the rest become `args`.
- **Quoting.** An arg that contains whitespace becomes a `ShellQuotedString`: `Weak` if it contains `--`, otherwise `Strong` ([escapeCommandLine L304-L312](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L304-L312)). VS Code's task system then quotes for the automation shell.
- **Extra fields.**
  - `task.detail` = the script's command text from package.json ([L346](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L346)).
  - `group` is a heuristic ([L348-L358](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L348-L358)): names containing build/compile/watch → `Build`, `test` → `Test`; `Clean` and `Rebuild` are reused as internal markers for pre/post scripts and debug scripts.
- **Install entry.** Each package.json also gets an `install` task (`<packageManager> install [--silent]`) unless `npm.scriptExplorerExclude` mentions `install` ([L291-L293](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L291-L293), [L362-L387](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L362-L387)).
- **Script parsing.** `readScripts` walks the document with `jsonc-parser` and returns every top-level `scripts` property whose value is a string, with name and value ranges ([B/extensions/npm/src/readScripts.ts#L21-L73](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/readScripts.ts#L21-L73)).
- **`resolveTask` (tasks.json `type: npm` entries).** Rebuilds the package.json Uri from `scope.uri` + `path`, calls the same `createScriptRunnerTask`, and restores the original definition. It returns `undefined` unless the scope is a `WorkspaceFolder` ([L60-L86](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L60-L86)).
- **Extension-host conversion.** `tasks.fetchTasks` converts the main-thread DTOs back into `vscode.Task` objects ([B/src/vs/workbench/api/common/extHostTask.ts#L469-L480](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/api/common/extHostTask.ts#L469-L480)). `vscode.d.ts` documents that it includes both `tasks.json` tasks and provider tasks ([B/src/vscode-dts/vscode.d.ts#L9361-L9369](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L9361-L9369)). Whether `tasks.json` npm customizations replace the provider's entry in the result was not traced (**Unconfirmed**).

### 1.2 `npm.packageManager` and `npm.scriptRunner` resolution

- **`getScriptRunner(folderUri)`.** Reads `npm.scriptRunner` with resource scope `folderUri`; `auto` → `detectPackageManager(folderUri)` ([tasks.ts#L130-L138](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L130-L138)). `getPackageManager` is identical but reads `npm.packageManager`, which is used only for `install` ([L140-L148](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L140-L148)).
- **Allowed values (shipped 1.140.0).**
  - `npm.packageManager`: `auto|npm|yarn|pnpm|bun`, default `auto`.
  - `npm.scriptRunner`: `auto|npm|yarn|pnpm|bun|node|vp`, default `auto`. `vp` is "Vite+" per `SHIPPED_NPM/package.nls.json`.
  - Source: `SHIPPED_NPM/package.json`, `contributes.configuration`. Note that the README at the tag still lists `scriptRunner` without `vp` ([B/extensions/npm/README.md#L37-L38](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/README.md#L37-L38)).
- **`auto` detection.** `findPreferredPM(dir)` ([B/extensions/npm/src/preferred-pm.ts#L71-L113](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/preferred-pm.ts#L71-L113)) collects candidates in this order:
  1. `package-lock.json` in `dir`;
  2. `pnpm-lock.yaml` or `shrinkwrap.yaml` in `dir`, or `pnpm-lock.yaml` found upward (`find-up`);
  3. `yarn.lock` in `dir`, or a yarn workspace root (`find-yarn-workspace-root`);
  4. `bun.lockb` or `bun.lock` in `dir`;
  5. `which-pm(dir)`, which inspects `node_modules`.

  The first candidate wins; if there is none, the result is `npm`. When more than one lockfile is found, an information message can appear, suppressible via global state `npm.multiplePMWarning.neverShow` ([tasks.ts#L150-L166](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L150-L166)).
- **Which directory is probed is inconsistent inside the npm extension itself:**
  - **Tasks, hover, Run Selected Script.** `createScriptRunnerTask` calls `getRunScriptCommand(script, folder.uri)` with the **workspace-folder** Uri, not the package.json directory ([tasks.ts#L343](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L343)). In a monorepo whose nested package has its own `package-lock.json` or `bun.lock`, detection therefore does not see it (pnpm and yarn still work via the upward search).
  - **Debug CodeLens ("all" mode).** Passes the **package.json directory** instead ([B/extensions/npm/src/npmScriptLens.ts#L90-L93](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmScriptLens.ts#L90-L93)).
  - **Consequence.** To match **Run Script** exactly, use the workspace-folder Uri.

### 1.3 `npm.autoDetect`, `npm.exclude`, and discovery cost

- **`npm.autoDetect: off`.** The folder is skipped in `findNpmPackages` ([tasks.ts#L185-L205](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L185-L205), [isAutoDetectionEnabled L241-L243](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L241-L243)), so `fetchTasks({ type: 'npm' })` returns no provider tasks for it. The NPM Scripts view then shows "The setting "npm.autoDetect" is "off"." ([npmView.ts#L235-L240](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmView.ts#L235-L240)). The hover, **Run Selected Script**, and **Run NPM Script in Folder...** paths do **not** check `autoDetect` ([commands.ts](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/commands.ts#L16-L67), [scriptHover.ts#L112-L120](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/scriptHover.ts#L112-L120)).
- **`npm.exclude`.** A glob, or array of globs, matched with `minimatch(..., { dot: true })` against the **absolute folder path of the package.json** ([isExcluded L245-L265](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L245-L265)). It applies only to `findNpmPackages`, which feeds `fetchTasks` and the view, not to the hover, Run Selected Script, or Run in Folder.
- **Other gates in core:**
  - `fetchTasks` returns `[]` when the workspace is untrusted ([B/src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts#L1054-L1062](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts#L1054-L1062));
  - no provider is asked when `task.autoDetect` is not `on` ([L1472-L1475](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts#L1472-L1475), [L2342](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts#L2342));
  - the npm provider is skipped unless `shellExecutionSupported` holds ([L2298-L2301](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts#L2298-L2301)).
- **Type filter.** With `filter.type = 'npm'`, only providers registered for `npm` are queried ([L2346](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts#L2346)).
- **Timeouts.**
  - Each provider call races a **5000 ms timeout**; on timeout the provider's tasks are silently omitted ([L2352-L2366](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts#L2352-L2366)).
  - Activating the provider's extension (`onTaskType:npm`) also races 5000 ms ([L756-L768](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts#L756-L768)).
- **Discovery:**
  - For each workspace folder, `workspace.findFiles(RelativePattern(folder, '**/package.json'), '**/{node_modules,.vscode-test}/**')` ([tasks.ts#L195-L196](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L195-L196)). Because an explicit exclude is passed, `files.exclude` applies, but `search.exclude` does not. `.gitignore` is not honored unless the user opts into `search.experimental.useIgnoreFilesInFindFiles` ([B/src/vs/workbench/api/common/extHostWorkspace.ts#L498-L527](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/api/common/extHostWorkspace.ts#L498-L527)). Build outputs that contain a `package.json` (e.g. `dist/`) are therefore included.
  - Then, per package.json: an `fs.exists` check, `workspace.openTextDocument`, and a full parse ([L476-L493](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L476-L493)).
  - Then, **per script**, `createScriptRunnerTask` → `getRunScriptCommand`. With `scriptRunner: auto` this re-runs `findPreferredPM` (several `stat` calls, `find-up`, `find-yarn-workspace-root`, `which-pm`) once per script, with no memoization ([L286-L289](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L286-L289)).
- **Caching:**
  - The whole result lives in a module-level `cachedTasks` ([L32](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L32), [L229-L239](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/tasks.ts#L229-L239)).
  - It is invalidated by any `**/package.json` create, change or delete; by a workspace-folder change; by `npm.refresh`; and by changes to `npm.exclude`, `npm.autoDetect`, `npm.scriptExplorerExclude`, `npm.runSilent`, `npm.packageManager` or `npm.scriptRunner` ([B/extensions/npm/src/npmMain.ts#L40-L52](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmMain.ts#L40-L52), [L123-L141](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmMain.ts#L123-L141)).
  - The first call after an invalidation pays the full cost again. A lockfile change alone does **not** invalidate the cache.
  - No measured timings for large monorepos were found (**Unconfirmed**).

## 2. Is `npm.packageManager` callable by other extensions?

- **Registration.** `npmMain.ts` registers both `npm.scriptRunner` and `npm.packageManager` ([B/extensions/npm/src/npmMain.ts#L66-L77](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmMain.ts#L66-L77)). The shipped bundle confirms both registrations (`SHIPPED_NPM/dist/npmMain.js`, `registerCommand("npm.scriptRunner"` and `registerCommand("npm.packageManager"`).
- **Argument.** A single `vscode.Uri`, used both as the configuration resource scope and as the directory to probe. Any other argument returns `''` (no throw).
- **Return value.** `Promise<string>`: the configured value, or the detected one for `auto`. It is called with `showWarning = true`, so it can show the "multiple lockfiles" information message.
- **Status.** Internal, not documented API.
  - `npm.packageManager` is declared in `contributes.commands` ("Get Configured Package Manager") but hidden with `commandPalette` `when: false`.
  - `npm.scriptRunner` is **not** declared in `contributes.commands` at all (`SHIPPED_NPM/package.json`).
  - Neither appears in `vscode.d.ts` or the npm README.
- **Prior art.** Microsoft's js-debug relies on these commands: `executeCommand('npm.scriptRunner', folder?.uri)`, falling back to `npm.packageManager` and then to `'npm'` ([microsoft/vscode-js-debug src/ui/getRunScriptCommand.ts](https://github.com/microsoft/vscode-js-debug/blob/main/src/ui/getRunScriptCommand.ts), `main` branch, read 2026-10-02). It then builds `"<runner> run <name>"` or `"node --run <name>"` itself.
- **Activation.** Calling the command activates the npm extension only if it is not active yet and its activation events allow it. Its events are `onTaskType:npm`, `onLanguage:json` and `workspaceContains:package.json` (`SHIPPED_NPM/package.json`). If the npm extension is disabled, `executeCommand` rejects with "command not found". Explicit activation by command id was not verified (**Unconfirmed**).

## 3. NPM Scripts view, hover, and CodeLens

### 3.1 View id and context values

- **View id:** `npm`. It sits in the `explorer` container with `when: npm:showScriptExplorer` and `visibility: hidden`, so it is collapsed by default (`SHIPPED_NPM/package.json`, `contributes.views.explorer`). It is created with `createTreeView('npm', …)` ([npmMain.ts#L143-L151](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmMain.ts#L143-L151)).
- **`contextValue` per node** ([B/extensions/npm/src/npmView.ts](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmView.ts)):

  | Node | `viewItem` | Useful fields on the element |
  |---|---|---|
  | Workspace folder (only shown when >1 folder) | `folder` ([L31](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmView.ts#L25-L40)) | `workspaceFolder`, `resourceUri` |
  | package.json | `packageJSON` ([L60](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmView.ts#L44-L72)) | `resourceUri` (package.json Uri), `path` (relative folder), `folder.workspaceFolder` |
  | Script | `script` ([L108](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmView.ts#L76-L127)) | `task` (`vscode.Task`; `task.definition.script`, `task.definition.path`, `task.scope`, `task.execution`), `package.resourceUri`, `taskLocation` (Location of the script name), `label` |
  | Placeholder | `noscripts` ([L132](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmView.ts#L129-L134)) | none |

  - The `install` task appears in the tree only through the `npm.runInstall` command on `packageJSON`; install tasks are filtered out of the script nodes ([L310](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmView.ts#L310)).
  - `npm.scriptExplorerExclude` regexes hide scripts from the view only ([L301-L308](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmView.ts#L296-L308)).
- **Built-in menus.** `npm.runScript` and `npm.debugScript` are contributed `inline` and in the context menu for `view == npm && viewItem == script`. `npm.openScript` and `npm.runInstall` are contributed for `packageJSON` (`SHIPPED_NPM/package.json`, `contributes.menus`).

### 3.2 Third-party menu contributions and the argument object

- **Third-party menus are allowed.** `view/item/context` is a generic menu (`MenuId.ViewItemContext`) with no restriction on which extension owns the view ([B/src/vs/workbench/services/actions/common/menusExtensionPoint.ts#L256-L260](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/services/actions/common/menusExtensionPoint.ts#L256-L260)). An extension can contribute `{ "command": "herdr.runNpmScript", "when": "view == npm && viewItem == script", "group": "inline" }`.
- **How the argument is built:**
  1. The workbench invokes the command with `{ $treeViewId, $treeItemHandle }` ([B/src/vs/workbench/browser/parts/views/treeView.ts#L884](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/browser/parts/views/treeView.ts#L884), [L1493](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/browser/parts/views/treeView.ts#L1493)).
  2. An extension-host argument processor replaces that with `treeView.getExtensionElement(handle)`, the **original element object returned by the npm extension's `TreeDataProvider`** ([B/src/vs/workbench/api/common/extHostTreeViews.ts#L62-L80](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/api/common/extHostTreeViews.ts#L62-L80), [L293-L304](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/api/common/extHostTreeViews.ts#L293-L304)).
  3. Multi-selection is also converted ([L70-L76](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/api/common/extHostTreeViews.ts#L70-L76)).
- **What our command receives.** The npm extension's `NpmScript` instance. It exposes the script name (`task.definition.script`), the package.json Uri (`package.resourceUri`), the workspace folder (`task.scope`), and even the resolved `ShellExecution`.
- **Caveats:**
  - These are private class fields of a bundled extension, not API, and can change in any release.
  - `instanceof` checks are impossible across extensions; only duck typing works.
  - The handle is resolved in the extension host where the *view* lives. If our extension runs in a different extension host from the npm extension (e.g. remote vs local), the processor cannot find the view, and the result is a raw handle or `null` (**Source-only**; not tested).

### 3.3 Hover and CodeLens on package.json

- **Hover.** The "Run Script | Debug Script" links that appear when hovering a script name come from `NpmScriptHoverProvider`. It is registered for `{ language: 'json', scheme: 'file', pattern: '**/package.json' }`, gated by `npm.scriptHover` (default `true`), and builds `command:npm.runScriptFromHover?{documentUri, script}` links ([B/extensions/npm/src/scriptHover.ts#L33-L129](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/scriptHover.ts#L33-L129), [npmMain.ts#L153-L165](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmMain.ts#L153-L165)). `runScriptFromHover` → `createScriptRunnerTask` → `tasks.executeTask`.
- **CodeLens.** `NpmScriptLensProvider` lives in the **npm** extension but reads js-debug's setting `debug.javascript.codelens.npmScripts` ([B/extensions/npm/src/npmScriptLens.ts#L22-L106](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/npmScriptLens.ts#L22-L106)). The setting has values `top|all|never`, default `top`, and is contributed by the bundled `ms-vscode.js-debug` `package.json` in the local 1.140.0 build.
  - `top`: one **Debug** lens over the `scripts` block → `extension.js-debug.npmScript`.
  - `all`: a **Debug** lens per script → `extension.js-debug.createDebuggerTerminal`.
  - No "Run" CodeLens exists.
- **Coexistence.** Hover and CodeLens providers are additive. A third-party `registerHoverProvider` or `registerCodeLensProvider` for the same selector contributes alongside the npm extension's providers; nothing in the npm extension claims exclusivity. Exact ordering and merging within the hover widget was not checked (**Unconfirmed**).
- **Editor context menu.** **Run Script** (`npm.runSelectedScript`) appears in `editor/context` when `resourceFilename == 'package.json' && resourceScheme == file`. It uses the script at the cursor ([commands.ts#L16-L30](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/extensions/npm/src/commands.ts#L16-L30)).

### 3.4 A cheap API for "npm task for script X in package.json Y"?

- **None in 1.140.0.**
  - `vscode.tasks` exposes only `registerTaskProvider`, `fetchTasks(filter?: { version?, type? })`, `executeTask`, and execution events ([B/src/vscode-dts/vscode.d.ts#L9334-L9369](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L9334-L9369)).
  - There is no public "resolve this definition" call for a provider owned by another extension.
- **Options:**
  1. `fetchTasks({ type: 'npm' })` and filter on `definition.script` + `definition.path` + `scope`. This pays the full scan (§1.3), but the npm extension caches the result.
  2. `new vscode.Task({ type: 'npm', script, path }, folder, …)` then `executeTask`. That *runs* it in VS Code's own terminal, which is not what #39 wants.
  3. Recompute locally:
     - `cwd = dirname(packageJsonUri.fsPath)`;
     - `runner = await executeCommand('npm.scriptRunner', workspaceFolder.uri)`;
     - args per §1.1 plus `npm.runSilent`.

     This is cheap (one detection) and matches the task the npm extension would build, as long as the internal command keeps existing.

## 4. Terminal profile route

- **Contribution and activation.**
  - Profiles are declared in `contributes.terminal.profiles` (`id`, `title`, `icon`).
  - The extension point generates the implicit activation event `onTerminalProfile:<id>` for each profile ([B/src/vs/workbench/contrib/terminal/common/terminal.ts#L666-L675](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/common/terminal.ts#L666-L675)).
  - Before calling the provider, core activates that event ([B/src/vs/workbench/contrib/terminal/browser/terminalService.ts#L413-L425](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalService.ts#L413-L425)).
  - The provider is registered with `window.registerTerminalProfileProvider(id, provider)` and returns `TerminalProfile { options: TerminalOptions | ExtensionTerminalOptions }` ([vscode.d.ts#L8223-L8246](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L8223-L8246), [L11820-L11828](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L11820-L11828)).
- **Being the default.** When `terminal.integrated.defaultProfile.<os>` equals the contributed profile's `title`, a new terminal is routed to the provider:
  - `getContributedDefaultProfile` matches `p.title === defaultProfileName` ([B/src/vs/workbench/contrib/terminal/browser/terminalProfileService.ts#L285-L305](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalProfileService.ts#L285-L305)).
  - `createTerminal` launches it ([terminalService.ts#L1005-L1041](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalService.ts#L1005-L1041)).
  - This covers **+**, Ctrl+\`, and **Create New Terminal**.
  - A launch with an explicit `executable` skips the lookup ([terminalProfileService.ts#L288](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalProfileService.ts#L285-L289)).
  - `overrideDefaultProfile` exists internally ([L276](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalProfileService.ts#L276-L283)) but is not exposed in `vscode.d.ts`.
- **pty path.** If the returned options contain `pty`, the extension host calls `createExtensionTerminal(profileOptions, coreOptions)` ([B/src/vs/workbench/api/common/extHostTerminalService.ts#L866-L904](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/api/common/extHostTerminalService.ts#L866-L904)).
  - **cwd is not passed to the provider.** `provideTerminalProfile(token)` receives only a token. The core options do carry `cwd` ([B/src/vs/platform/terminal/common/terminal.ts#L705-L711](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/platform/terminal/common/terminal.ts#L705-L711)), but they are used only for the location and title template, never surfaced to the pty. An "Open in Integrated Terminal" folder cwd is therefore unknown to the provider (**Source-only**).
  - **Always transient.** The terminal is created with `isTransient: true` ([extHostTerminalService.ts#L205-L224](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/api/common/extHostTerminalService.ts#L205-L224)), so VS Code does not persist or restore it across reloads.
- **Location (panel vs editor)** (**Source-only**):
  - Core computes the location: the caller's location, or `resolveLocation()` from `terminal.integrated.defaultLocation`. It passes that location as `options.location` ([terminalService.ts#L1019-L1033](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalService.ts#L1019-L1033)).
  - In the extension host, `_serializeParentTerminal` overwrites the core location **only when the profile's `location` is a plain `TerminalLocation` enum** ([extHostTerminalService.ts#L534-L549](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/api/common/extHostTerminalService.ts#L534-L549)).
  - Otherwise `internalOptions?.location || profileLocation` keeps the core value ([L214](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/api/common/extHostTerminalService.ts#L205-L224)).
  - So `location: TerminalLocation.Editor` from the provider should open the terminal in the editor area, while `{ viewColumn: … }` from the provider is ignored. Core's post-create focus logic then looks for the new instance in the host it expected (panel or editor) ([terminalService.ts#L1034-L1040](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalService.ts#L1034-L1040)), so overriding may leave the wrong instance focused.
  - The runtime result is **Unconfirmed**; a prototype is needed.
- **Startup race:**
  - **[microsoft/vscode#123188](https://github.com/microsoft/vscode/issues/123188)** "terminal.integrated.defaultProfile.windows not working on startup": **closed (completed) 2021-05-13**, milestone May 2021, labels `verified`, `insiders-released`. It concerned built-in or user profiles, not extension-contributed ones.
  - **[microsoft/vscode#263504](https://github.com/microsoft/vscode/issues/263504)** "Restored integrated terminal sessions not using workspace profile": **open**, labels `bug`, `confirmation-pending`, `terminal-persistence`, `terminal-process`; reported on 1.103.0. It is about persisted sessions being revived with the global profile; new terminals work, per the reporter's comment of 2025-09-14.
  - No open upstream issue specifically about an extension-contributed default profile losing a startup race was found (`gh search issues` on 2026-10-02, label `terminal-profiles`).
  - In source, `createTerminal` waits for `profilesReady` (shell detection) ([terminalService.ts#L975-L992](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalService.ts#L975-L992)). It does not explicitly wait for extension-point registration before reading `contributedProfiles`.
  - Restored persistent terminals reconnect to their old pty-host process rather than consulting the default profile.
  - [tmux-integrated](https://github.com/pcassidy75/tmux-integrated) (third-party, README read 2026-10-02) reports that a stray OS shell still appears and disposes it at activation. Whether that still reproduces in 1.140.0 is **Unconfirmed**.
- **Related, fixed:**
  - [#195107](https://github.com/microsoft/vscode/issues/195107) ("Open in Integrated Terminal" ignored an extension default profile; closed 2023-12-18).
  - [#200558](https://github.com/microsoft/vscode/issues/200558) (`CustomExecution` tasks failed when the default profile was contributed by the same extension; closed 2025-04-06).

## 5. `automationProfile` and other routes for tasks

- **Schema.** `terminal.integrated.automationProfile.<linux|osx|windows>` is `anyOf: [null, { type: 'object', required: ['path'], properties: { path: string, …base } }]` ([B/src/vs/platform/terminal/common/terminalPlatformConfiguration.ts#L81-L94](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/platform/terminal/common/terminalPlatformConfiguration.ts#L81-L94), [L117-L170](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/platform/terminal/common/terminalPlatformConfiguration.ts#L117-L170)). Unlike the newer `agentHostProfile.<os>` setting, it does not accept a profile *name*.
- **Validation.** At runtime it is used only if it is an object with a string `path` ([B/src/vs/workbench/contrib/terminal/browser/terminalProfileResolverService.ts#L276-L284](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalProfileResolverService.ts#L276-L284), [L384-L392](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalProfileResolverService.ts#L384-L392)).
- **Fallback when unset.** Shell tasks call `getDefaultProfile({ allowAutomationShell: true })` ([B/src/vs/workbench/contrib/tasks/browser/terminalTaskSystem.ts#L1219-L1232](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/tasks/browser/terminalTaskSystem.ts#L1219-L1232)). That falls back to `terminalProfileService.getDefaultProfile`, which searches **`availableProfiles` only** (path-based, non-auto-detected profiles) ([terminalProfileService.ts#L117-L134](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalProfileService.ts#L117-L134)), and otherwise to the system shell ([terminalProfileResolverService.ts#L191-L272](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/terminal/browser/terminalProfileResolverService.ts#L191-L272)). An extension-contributed default profile is therefore **never** used for tasks.
- **Remaining routes to a pty for tasks:**
  1. `CustomExecution` (a `Pseudoterminal`) in a `TaskProvider` we own, which covers only our own task type. The task-system path for these is `customPtyImplementation` ([terminalTaskSystem.ts#L1535](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/tasks/browser/terminalTaskSystem.ts#L1535)).
  2. A wrapper executable as `automationProfile.path` or per-task `options.shell.executable`. VS Code still owns and renders the task terminal.
  3. No API intercepts or redirects another provider's task (e.g. built-in npm) before it spawns. Only post-hoc events (`tasks.onDidStartTask`) and `TaskExecution.terminate()` exist (`vscode.d.ts` `namespace tasks`).

## Implications for #39

Feasible:
- **A Herdr "Run Script" entry point can reproduce VS Code's command and cwd exactly.**
  - cwd = package.json folder; command = `<runner> run [--silent] <script>` or `node --run <script>`.
  - `runner` comes from `executeCommand('npm.scriptRunner', workspaceFolder.uri)`, with the fallback chain js-debug uses.
  - No full workspace scan is needed.
- **Possible entry points**, all of which can run alongside the built-in UI:
  - inline or context menu items on the existing NPM Scripts view (`view == npm && viewItem == script`, element gives script name and package.json Uri);
  - our own hover or CodeLens on `**/package.json`;
  - an `editor/context` item.
- **`fetchTasks({ type: 'npm' })`** suits a "pick a script" quick pick that should mirror VS Code's list, including `npm.exclude` and `npm.autoDetect`.
- **Terminal profile** for New Terminal / + / Ctrl+\` with a Pane-backed `pty`. A provider-returned `TerminalLocation.Editor` probably forces the editor area (needs a prototype).

Risks:
- **Internal npm surface.** `npm.scriptRunner`, `npm.packageManager`, the `NpmScript` element shape, and context values are internal and unversioned. `npm.scriptRunner` is not even declared in `contributes.commands`, and the set of runner values grows (`vp` was added).
- **Detection directory mismatch.** The npm extension probes lockfiles at the workspace-folder root for tasks but at the package dir for the Debug CodeLens. "Exactly like VS Code" means picking the task behaviour (workspace folder).
- **`fetchTasks` costs and silent failures.** It costs O(package.json files × scripts) lockfile probes on a cold cache. It silently returns nothing under: the 5 s provider timeout, an untrusted workspace, `task.autoDetect: off`, or `npm.autoDetect: off`.
- **Profile route gaps.** The provider gets no cwd and cannot honour `{ viewColumn }`. Its terminals are transient. The stray-startup-shell behaviour in 1.140.0 is unverified.
- **No task interception.** Built-in **Run Script** / tasks.json runs cannot be redirected to a Pane; only our own `CustomExecution` tasks or a wrapper executable can be.
