# Automatic control handoff evidence

Date: 2026-09-16  
Environment: macOS, Herdr 0.9.0, Ghostty, VS Code Extension Development Host

## Policy validated

- A Herdr Pane remains server-owned and live in both clients.
- Opening the VS Code surface begins with a current read-only frame.
- Focusing the concrete Herdr terminal in VS Code changes its bridge from `observe` to `control --takeover`.
- Losing VS Code window focus releases its controller after a 500 ms grace period and returns the bridge to observation.
- The normal Herdr client in Ghostty becomes writable again when focused.
- Returning to the VS Code terminal reacquires control automatically.
- No first-input buffer or explicit takeover prompt is needed for this normal focus-driven path.

## Human round-trip

The complete round trip passed against the same disposable Pane:

1. Focused the VS Code terminal and ran `echo VSCODE` — output appeared.
2. Focused the same Pane in Herdr/Ghostty and ran `echo GHOSTTY` — output appeared.
3. Focused the VS Code terminal again and ran `echo VSCODE_AGAIN` — output appeared.

The current screen remained visible through the native VS Code terminal bridge. The Pane and process were not recreated.

A longer rapid-switching pass then exposed brief bridge-mode/reconnect messages flashing inside the VS Code terminal. These were emitted by the throwaway prototype itself before each expected observer/controller stream replacement; they were not Pane output and did not appear in Ghostty. The prototype was corrected to keep expected handoff diagnostics in the VS Code Output channel and reserve terminal-visible messages for unexpected failures. This correction requires one short human recheck.

## Boundary

The prototype used VS Code's public window/active-terminal events and Herdr's documented `terminal session observe|control` CLI. Automatic takeover is tied to the concrete extension terminal becoming active, not merely extension activation. Window blur is the reliable cross-application release signal. A short grace period prevents a transient focus change from immediately churning the controller.

Recovery policy remains conservative: after unexpected bridge loss or displacement, reconnect as an observer and wait for a new qualifying focus transition before taking control again.

## Residual implementation hardening

The MVP implementation should still verify rapid focus oscillation, multiple open Herdr terminals, VS Code modal dialogs, Mission Control, sleep/wake, and bridge loss during the 500 ms grace period. These are robustness cases, not blockers to the control-policy decision.
