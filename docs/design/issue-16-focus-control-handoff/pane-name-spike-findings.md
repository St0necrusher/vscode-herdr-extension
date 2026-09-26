# Pane name spike findings

Branch `spike/pane-name`. VS Code 1.138, macOS.

## Symptom

Pane terminal tabs kept the correlation name `${sessionId}:${paneId}`; names published through `Pseudoterminal.onDidChangeName` flashed for ~1 ms and were then ignored.

## Mechanism (VS Code source)

- A title has a source: `0` Api, `1` Process, `2` Sequence. `_setTitle` drops every Process title once the source is Api.
- `onDidChangeName` arrives as the `title` process property, which is `_setTitle(name, Process)`.
- `createTerminal({ name })` makes the title Api-sourced twice: at construction (`customPtyImplementation && !titleTemplate → _setTitle(name, Api)`) and again at process ready. After that every `onDidChangeName` is ignored.
- `_setTitle(undefined, Api)` returns before it changes the source, but `_setTitle("", Api)` sets it. **`name: ""` breaks renaming just like a real name; the option must be absent.** `ExtensionTerminalOptions.name` is required in the typings, so a cast is needed.
- Without a name, process ready registers the xterm `onTitleChange` listener. OSC 0/2 from the attach output then becomes the Sequence title, but the default `terminal.integrated.tabs.title` is `${process}`, so the tab keeps showing our Process title.
- On macOS a Process title is shortened: a title starting with `/` becomes its basename; otherwise the title is cut at the first ASCII space. `label / title` would show as `label`.
- With `terminal.integrated.tabs.allowAgentCliTitle` (default `true`) VS Code switches the template to `${sequence}` when an OSC title matches `/claude\s*code/i`, `/command\s*code/i`, `/\bcopilot\b/i` or `/\bgemini\b/i` (or the shell type is an agent CLI). Herdr's Claude titles such as `✳ claude-reload` do not match.
- The `titleTemplate` terminal option would avoid all of this, but it is not stable API.

## Spike change

Spike code (branch `spike/pane-name`, removed after the port to `main`):

1. `createTerminal` without `name` (cast to `ExtensionTerminalOptions`).
2. While unbound, `publishPaneName()` fires the correlation name `${sessionId}:${paneId}` once the host is open, so the Manager still finds the tab by label.
3. The published Pane name has every ASCII space replaced by U+00A0, so VS Code does not cut it.

## Verified in the Extension Development Host

- Correlation works: the tab shows `default:w3:pXX`, the Manager binds it about 35 ms later, and the Pane name replaces it.
- The full name with spaces is shown (`π - vscode-herdr-extension`, not `π`).
- The name follows `terminal_title` changes both ways: shell title → pi title (`π - …`) → shell title after pi exits.
- Typing in an attached Claude Pane keeps `claude-reload`; OSC titles from attach output do not replace the name.
- Closing and reopening a Pane tab correlates and binds again.
- Renaming a Herdr tab changes nothing, as designed: the Pane name uses only the Pane label and terminal title, and `pane list` has no label for these Panes.

Not verified: several editor groups and restored editors. Correlation is by label across all groups and the terminal stays transient, so no difference is expected.

## Name format (decided with the user)

The tab name is the raw `pane.terminalTitle`, falling back to `Pane <paneId>`; the Pane label and the stripped title are no longer used. This shows agent status glyphs like other terminals do (`✳ claude-reload` idle, `◑ claude-reload` working). Verified: the glyph follows the agent state; Herdr delivers title changes with snapshots about every one to two seconds, not per spinner frame, so publications stay rare.

## Pitfalls

- A Pane name starting with `/` (for example a title that is an absolute path) would show only its basename. Not handled; no such title was seen.
- An OSC title matching the agent CLI patterns above would switch the label to the program's title unless the user disables `allowAgentCliTitle`.
- For a worktree, do not symlink `node_modules`: the Extension Development Host's extension host crashed at startup (`abort()`, code 6) with a symlink; an APFS clone (`cp -Rc`) works.

## Recommended change for `main`

In `PaneTerminalSurface.ts` only:

```ts
// No `name` (not even ""): VS Code would treat it as an API title and ignore every later onDidChangeName.
this.terminal = vscode.window.createTerminal({
  pty,
  location: { viewColumn },
  isTransient: true,
} as vscode.ExtensionTerminalOptions);
```

```ts
private publishPaneName(): void {
  if (this.host.kind !== "open") return;
  if (!this.paneNameVisible) {
    this.nameEmitter.fire(this.terminalName);
    return;
  }
  // ...existing name computation and dedupe...
  // VS Code cuts a process title at its first space; no-break spaces keep the whole name.
  this.nameEmitter.fire(name.replaceAll(" ", " "));
}
```

In `paneTarget.ts`, `paneName` becomes `return nonEmpty(pane?.terminalTitle) ?? \`Pane ${paneId}\`;`.

Keep `terminalName` as a field. The Manager does not change. Update the architecture doc's "Tab binding" (the correlation name is published through `onDidChangeName` in `open()`, not passed as `name`) and "Name" (raw terminal title, no-break spaces) sections.
