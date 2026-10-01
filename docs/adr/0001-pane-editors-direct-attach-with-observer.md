# Pane Editors use a Pseudoterminal over a direct attach and an observer

Herdr releases a Pane's input and geometry only when its attach client disconnects, so a Pane Editor that hands control back to Ghostty or a phone must stop its attach process while keeping the VS Code tab alive. We therefore render each Pane Editor through a `Pseudoterminal` that runs `herdr terminal attach --takeover` under an extension-owned `node-pty` while focused, and a read-only `terminal session observe` client otherwise. Details: `docs/design/issue-16-focus-control-handoff/`.

## Considered Options

- Plain `createTerminal` running `herdr terminal attach`: same fidelity, but releasing the lock kills the tab.
- `Pseudoterminal` over `terminal session control`: same exclusive lock, and application-requested modes (keyboard protocol, mouse reporting) never reach xterm.js, breaking Shift+Enter and the wheel in agents.
- Dropping the observer for a "press a key to take control" placeholder: loses the live view while another client controls the Pane.
- Webview with xterm.js or ghostty-web: the lock and handoff stay the same; no gain.

## Consequences

`node-pty` is pinned to `1.2.0-beta.13` and kept external to the bundle: the published `1.1.0` macOS arm64 spawn-helper is not executable after an ordinary install.
