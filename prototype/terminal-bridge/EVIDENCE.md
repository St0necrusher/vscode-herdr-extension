# Prototype evidence

Environment: macOS arm64, Herdr 0.9.0, VS Code 1.137.0, Node 22.22.0.
Disposable Session: `vscode-bridge-prototype`; disposable Pane: `w1:p1`.

## Automated boundary probes

| Check | Result | Observation |
|---|---|---|
| Initial frame | Pass | `observe` immediately emitted `terminal.frame`, `encoding=ansi`, `full=true`, requested `80x24`, with 2,502 decoded ANSI bytes. |
| ANSI and Unicode | Pass | Initial frame contained coloured `RED` plus `✓ 你好`; a later controller frame contained coloured `CONTROL_OK_2 ✓`. |
| Input | Pass | `terminal.input` text plus base64 carriage return executed a command in the existing Pane shell. |
| Resize | Pass | `terminal.resize` to `91x27` changed the Pane viewport to 27 rows; `stty size` inside the existing shell printed `27 91`. |
| Release | Pass | `terminal.release` ended the controller subprocess with exit status 0. A subsequent `pane.get` and fresh controller both found the same live Pane. |
| Ownership conflict | Pass | A second controller without takeover received `terminal.closed`: `already has an attached client; retry with --takeover`. The CLI process exits successfully, so clients must inspect the protocol record rather than only the exit status. |
| Explicit takeover | Pass | `control --takeover` received an initial frame; the previous controller received `terminal.closed` with `terminal attach taken over`. |
| Fresh attach | Pass | Every new observer/controller received a fresh `full=true` initial frame with sequence 1. This supports reconnect by respawning the documented CLI boundary rather than maintaining a private screen cache. |
| Pane survival | Pass | The Pane and its shell remained alive after observer termination, controller release, rejected control, and takeover/release. |

## Prototype correction surfaced by probing

Two corrections surfaced during probing:

1. The first bridge implementation treated every clean CLI exit as reconnectable. The ownership probe showed that Herdr reports control conflicts as a `terminal.closed` protocol record and may still exit with status 0. The prototype now disables automatic reconnect after any protocol-level `terminal.closed`; only unexpected subprocess loss reconnects. This prevents a rejected controller from retrying forever.
2. The first human reconnect showed stale, cursor-addressed fragments and blank regions. A Herdr `full=true` frame repaints the viewport but does not clear VS Code's existing Pseudoterminal screen/scrollback. The bridge now sends `CSI 3 J`, `CSI 2 J`, and cursor-home immediately before installing the first frame after reconnect. This retry still needs human confirmation.

## Human validation

The Extension Development Host pass confirmed:

- read-only mode rendered the current Pane and blocked input;
- control mode accepted normal commands;
- resize worked while changing the editor terminal size;
- closing the terminal editor tab released control without closing the Herdr Pane;
- reconnect status was visible;
- after adding a client-screen reset, reconnect restored a clean full frame without stale fragments or blank regions.

Not exercised in this bounded prototype: Ctrl-C, bracketed paste, mouse reporting, clipboard integration, and alternate-screen TUIs. These are residual compatibility checks for implementation hardening, not blockers to selecting the supported CLI bridge boundary.
