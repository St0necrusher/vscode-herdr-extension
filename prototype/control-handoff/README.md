# Automatic terminal control handoff prototype

Throwaway logic prototype for [Define automatic terminal control handoff](https://github.com/St0necrusher/vscode-herdr-extension/issues/3).

## Run

Open [`index.html`](./index.html) directly in a browser. No install or server is required.

Use the four guided walkthroughs first, then free play. The question is whether this policy feels safe and predictable:

- opening or focusing a VS Code terminal observes without taking control;
- first input requests control only if it is free;
- one input chunk may wait while that request resolves;
- conflict discards pending input and requires explicit **Take control**;
- leaving the active VS Code surface releases control after a short grace period;
- takeover by another client and reconnect both return VS Code to read-only observation.

Please note any point where the expected next state differs from what the prototype shows. The prototype is intentionally not production code.
