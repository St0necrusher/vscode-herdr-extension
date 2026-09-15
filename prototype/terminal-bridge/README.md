# Herdr native terminal bridge — throwaway prototype

> **Not production code.** This artifact exists only to answer the wayfinding question in [Validate the native VS Code terminal bridge](https://github.com/St0necrusher/vscode-herdr-extension/issues/2).

## Question

Can a native VS Code terminal opened in the editor area faithfully present and interact with an **existing, Herdr-owned Pane** through the supported `herdr terminal session observe/control` CLI boundary—including initial state, ANSI output, input, resize, reconnect, and non-destructive detach—without creating a second PTY or using Herdr's private binary protocol?

## Run

1. Open this repository in VS Code.
2. Press **F5** and choose **Run Herdr terminal bridge prototype** if prompted.
3. In the Extension Development Host, run one of:
   - `Herdr Prototype: Open Pane Read-only`
   - `Herdr Prototype: Open Pane with Control`
   - `Herdr Prototype: Take Control of Pane`
4. Enter an existing Pane ID from the configured Herdr Session (for example `w1:p1`).

The default setting targets the disposable named Session `vscode-bridge-prototype`. Change `herdrPrototype.session` to test another Session. An empty value targets the default Session.

## What the prototype deliberately does

- Creates a VS Code `Pseudoterminal` in `TerminalLocation.Editor`.
- Spawns the documented `herdr terminal session observe|control` subprocess.
- Decodes each `terminal.frame.bytes` base64 payload and forwards its ANSI bytes to VS Code.
- Sends `terminal.input` and `terminal.resize` only from a controller.
- Sends `terminal.release` when a controlled VS Code terminal closes, then terminates only the bridge subprocess if it does not exit promptly.
- Reconnects by starting a fresh CLI stream after an unexpected bridge exit. Herdr supplies a fresh full frame; the prototype does not replay a private cache.
- Makes takeover a separate command with a modal warning.

It never starts an independent shell/agent PTY and never stops or closes the Herdr Pane, Workspace, or Session.

## Guided checks

### 1. Initial state and ANSI

1. Put visible coloured output and a Unicode string in the test Pane.
2. Open it read-only.
3. Confirm the editor terminal immediately matches the current Herdr screen.
4. Produce more output from another client and confirm the VS Code surface updates.

### 2. Input and resize

1. Open the Pane with control while no other controller owns it.
2. Type `printf '\e[32mGREEN ✓\e[0m\\n'` and press Enter.
3. Resize the editor group several times.
4. Run `stty size` and compare the result with the visible terminal dimensions.

### 3. Ownership conflict and explicit takeover

1. Keep the Pane controlled from Herdr/Ghostty.
2. Try `Open Pane with Control`; it should fail rather than silently steal control.
3. Run `Take Control of Pane`, accept the warning, and confirm the previous controller is displaced visibly.

### 4. Reconnect

1. With a stream open, terminate only its `herdr terminal session ...` child process.
2. Confirm the terminal reports disconnection, reconnects, and receives a fresh full screen.
3. Confirm the Pane process never exits.

### 5. Non-destructive detach

1. Close the VS Code editor terminal.
2. Reattach from Herdr/Ghostty.
3. Confirm the same shell/process and screen remain alive.

## Evidence to record

For every check, capture pass/fail plus observed differences in:

- initial frame completeness;
- colours, cursor, alternate screen, Unicode, and line wrapping;
- keyboard input, Ctrl-C, bracketed paste, mouse reporting, and clipboard;
- resize timing and final PTY dimensions;
- controller conflict/takeover visibility;
- reconnect timing and stale output;
- survival of the Pane after editor-terminal close.

Open **Output → Herdr Terminal Bridge Prototype** for frame sequence, dimensions, full/delta markers, subprocess exits, and parser errors.
