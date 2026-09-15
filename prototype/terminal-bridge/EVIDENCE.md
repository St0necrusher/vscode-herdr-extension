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

The first bridge implementation treated every clean CLI exit as reconnectable. The ownership probe showed that Herdr reports control conflicts as a `terminal.closed` protocol record and may still exit with status 0. The prototype now disables automatic reconnect after any protocol-level `terminal.closed`; only unexpected subprocess loss reconnects. This prevents a rejected controller from retrying forever.

## Human checks still required

Run the Extension Development Host and use the walkthrough in `README.md` to judge the actual VS Code surface:

- visual fidelity, cursor, line wrapping, and editor-terminal placement;
- normal typing, Ctrl-C, bracketed paste, mouse, clipboard, and alternate-screen TUIs;
- resize behaviour while dragging editor groups;
- visibility/understandability of conflict and takeover;
- reconnect presentation after killing only the bridge subprocess;
- non-destructive detach when the editor terminal closes.

The wayfinding ticket should remain open until this HITL pass establishes the UX boundary and recommendation.
