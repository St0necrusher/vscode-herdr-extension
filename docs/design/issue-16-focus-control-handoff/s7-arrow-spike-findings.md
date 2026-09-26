# S7 spike: intercepting ↑/↓ in Pane terminal editors

Date: 2026-09-26. Branch `spike/s7-arrows`, worktree `../vscode-herdr-extension-s7-spike`. VS Code 1.138.0 (Extension Development Host), macOS.

## Mechanism

**An extension-owned command does not work.** VS Code's xterm `attachCustomKeyEventHandler` lets a key reach the keybinding service only if Meta is pressed or the resolved command is in the skip-shell set (`terminal.integrated.commandsToSkipShell` plus the built-in default list). Otherwise xterm.js consumes the key. An extension can add to the list only by writing user settings. Verified in `workbench.desktop.main.js` of 1.138.0.

**`workbench.action.terminal.sendSequence` + marker works.** `sendSequence` is in the default skip-shell list. Its handler calls `activeInstance.sendText(text, false)`, which reaches the Pseudoterminal `handleInput`. VS Code itself uses this pattern with marker text for pwsh (`\x1b[24~a`).

```json
"keybindings": [
  {
    "key": "up",
    "command": "workbench.action.terminal.sendSequence",
    "args": { "text": "\u001b]herdr;arrow-up\u0007" },
    "when": "terminalFocus && herdr.activeTerminalIsPane && !terminalFindFocused"
  },
  {
    "key": "down",
    "command": "workbench.action.terminal.sendSequence",
    "args": { "text": "\u001b]herdr;arrow-down\u0007" },
    "when": "terminalFocus && herdr.activeTerminalIsPane && !terminalFindFocused"
  }
]
```

Surface (`handleInput`):

- The whole chunk equal to a marker becomes `\e[A`/`\e[B`, or `\eOA`/`\eOB` when DECCKM is on. DECCKM is tracked from attach output (`\e[?1h` / `\e[?1l`). The marker is safe: it is an OSC string that neither xterm.js nor a user produces, and it is matched only as a whole chunk.
- A chunk made only of bare arrows is a wheel step and becomes SGR wheel `\e[<64;1;1M` / `\e[<65;1;1M`. One wheel step arrives as one chunk with one arrow.

Context key `herdr.activeTerminalIsPane`: Manager sets it with `setContext` on `window.onDidChangeActiveTerminal`, once at construction and after tab changes. It is true when `window.activeTerminal` is one of the managed Surfaces' terminals.

## Manual checks (user, Dev Host)

| Scenario | Result |
|---|---|
| zsh in Pane: ↑/↓ | marker → `\e[A`/`\e[B`; shell history works |
| zsh after `seq 1 300`: wheel | `\e[A` → `\e[<64;1;1M`; Herdr history scrolls up and back to the prompt |
| typing after scroll, arrows after scroll | work, predictable |
| agents (Pi, Claude Code) | wheel native, arrows work |
| plain terminal, text editor, terminal find, switching Pane ↔ plain terminal | unchanged |

## Pitfalls

- **Terminal find sees only the viewport** in a Pane terminal. The alternate screen has no xterm.js scrollback, and history lives in Herdr. This existed before the spike and is accepted for now.
- **The right-button filter does not help.** `\e[<2;…M` was dropped (logged), and selection still broke after a right click. The same happens with Pi or Claude Code in a plain VS Code terminal without Herdr, so this is VS Code/xterm.js: the context menu takes the release. It recovers after a blur→refocus (attach is re-created and mouse modes are re-enabled). Decision: drop the filter from S7.
- Option+click (`altClickMovesCursor`) was not checked.

## Separate bug (not S7): kitty keyboard flags leak across attach handoff

`terminal.integrated.enableKittyKeyboardProtocol` defaults to `true` in 1.138. Symptom: open Pi in a Pane, blur the window, refocus, press Ctrl+C quickly. Pi exits, and zsh then receives kitty sequences (typing `c` prints `c9;1:3u`).

Log:

```
19:12:01.518 output(attached) kitty ["\u001b[>7u"]      stack [7]
19:12:04.509 release attached                           no pop seen
19:12:05.797 release observing
19:12:05.816 output(attached) kitty ["\u001b[>7u"]      stack [7,7]
19:12:06.121 output(attached) kitty ["\u001b[<1u"]      Pi exits, stack [7]
then input  "\u001b[99;5u" / "\u001b[99;5:3u"            xterm.js still in kitty mode
```

The released attach's pop is lost: either the attach does not emit it on stop, or the sink already drops output because `this.client !== attached`. The next attach pushes again, so the xterm.js stack grows. A possible direction: reset the kitty stack in xterm.js when the Surface drops an attach (for example `\e[<99u` in `SCREEN_RESET`, keeping in mind that the main and alternate screens have separate stacks). Why a later blur→refocus heals it is not explained by the logs, because observer `replace()` output was not logged.
