# Automatic terminal control handoff prototype

Throwaway prototypes for [Define automatic terminal control handoff](https://github.com/St0necrusher/vscode-herdr-extension/issues/3).

## Decision under test

- Merely opening VS Code does not take control.
- Focusing a specific Herdr terminal editor immediately shows the current Pane and takes control.
- Leaving VS Code releases control after a 500 ms grace period.
- A displaced client remains able to observe the live Pane.
- Returning to either client should make that client writable again without restarting the Pane.

The complete VS Code → Ghostty → VS Code round trip passed in the human validation. See [`EVIDENCE.md`](./EVIDENCE.md). VS Code releases its controller when its window loses focus, and the normal Herdr client in Ghostty becomes writable again when focused.

## Logic walkthrough

Open [`index.html`](./index.html) directly in a browser. No install or server is required. This page is an earlier state-model sketch; the human review changed its proposed acquisition rule from “first input” to “focus the concrete terminal.” It remains useful only for the disconnect and conflict cases.

## Live VS Code ↔ Ghostty experiment

Prerequisites: Herdr 0.9.0, VS Code, Ghostty, and a disposable Herdr Session/Pane.

1. Open this branch in VS Code.
2. Set `herdrPrototype.session` to the disposable named Session. Its default is `vscode-bridge-prototype`.
3. Press **F5** and choose **Run Herdr terminal bridge prototype**.
4. In the Extension Development Host, run **Herdr Prototype: Open Pane with Automatic Focus Handoff** and enter the test Pane ID, such as `w1:p1`.
5. In Ghostty, open the same Pane using the normal Herdr UI. Keep the test disposable; either client may be displaced while this policy is exercised.
6. Alternate clicks and harmless input:
   - focus Ghostty and run `printf 'GHOSTTY\n'`;
   - click the VS Code terminal and run `printf 'VSCODE\n'`;
   - click Ghostty and try `printf 'GHOSTTY_AGAIN\n'`;
   - click the VS Code terminal once more and run `printf 'VSCODE_AGAIN\n'`.
7. Open **Output → Herdr Terminal Bridge Prototype** and note whether VS Code's active-terminal and window-focus signals matched what was visibly focused.

Record these outcomes:

- Did the VS Code terminal always show the current screen before input?
- Did focusing it take control without losing the first key?
- Did leaving VS Code release control?
- Did Ghostty become writable again merely from focus, or did it require an explicit reattach/takeover?
- Did clicking back into VS Code reacquire control?

The full round trip was validated on 2026-09-16. The steps remain here as a reproducible manual compatibility check.
