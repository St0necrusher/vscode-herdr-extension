# A Pane Editor reveals itself again when its terminal opens

VS Code creates the xterm of a window's first terminal only after the terminal's editor has opened. `TerminalEditor.focus()` calls `TerminalInstance.focus()`, which does nothing while there is no xterm. `Terminal.show()` called during creation waits for that same open request and does not focus either. So the first Pane Editor after a window reload left keyboard focus in the Panes View (#53, VS Code 1.140). When `reveal()` runs before the Pseudoterminal has opened, the Surface calls `show()` once more from `open()`, when the xterm exists. Reveals of an open Pane Editor are unchanged.

## Consequences

The workaround depends on this VS Code behavior. Remove it once VS Code focuses a terminal editor when its xterm is ready (for example via `focusWhenReady`). `test/extension-fresh-window/first-pane-editor-focus.test.ts` shows whether VS Code still needs it. That test runs in a window of its own, because only a window's first terminal is affected.
