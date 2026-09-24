# Direct-attach handoff — throwaway prototype

> **Not production code.** This prototype exists only to answer a transport and lifecycle question for issue #16.

## Question

Can one native VS Code terminal surface switch cleanly between:

1. read-only `herdr terminal session observe`, and
2. the official interactive `herdr terminal attach <terminal_id> --takeover` running inside a real PTY,

while preserving keyboard modes, fullscreen scrolling, local text selection, Pane continuity, and release of Herdr's resize lock?

The prototype deliberately does **not** choose the final automatic mobile-Yield policy. Manual **Yield Control** is the baseline for testing mobile while VS Code remains focused.

## Shape

- One VS Code `Pseudoterminal` remains open for the whole experiment.
- Observer mode uses the documented NDJSON terminal-session stream.
- Controller mode runs official `herdr terminal attach` through `node-pty`.
- The attach process receives an isolated `HERDR_CONFIG_PATH` containing `[ui] mouse_capture = false`; the user's global Herdr config is untouched.
- Focused local input can start direct attach and is buffered until its first output.
- A reproducible inactivity-lease experiment remains available through `herdrPrototype.idleReleaseMs`, but it is disabled by default (`0`) because validation rejected its UX.
- A nonzero lease expires into observation and the next local input reacquires control, but Herdr immediately restores the geometry of a still-connected native client even when that client is stale or backgrounded.
- Terminal or VS Code window blur still stops direct attach immediately rather than waiting for inactivity.
- Temporary **Yield Control** and **Take Control** commands expose the seam explicitly.
- A **throwaway mobile Yield popup** opens via the linked `local.vscode-yield-popup-probe` plugin only when this prototype holds direct attach and its terminal is the selected visible editor tab in the focused VS Code window. Pressing `y` sends a generation-bound request to the extension; the extension acknowledges, checks that the same visible attach still owns control, then stops its attach and returns to read-only observation. **This is live-untested; use a disposable Pane or preserve important input first.** The popup process stays open while it receives VS Code socket heartbeats and exits when the offer is retracted, the socket closes, or heartbeats stop for about 4 seconds. The popup is global to the Herdr Session, so this experiment may interrupt other clients; do not assume the UX is accepted.

## Run

1. Open this worktree in VS Code:

   ```bash
   code --new-window /tmp/vscode-herdr-direct-attach-prototype
   ```

2. Press **F5** and choose **Run direct-attach handoff prototype**.
3. In the Extension Development Host, run **Herdr Prototype: Open Direct-Attach Handoff**.
4. Enter the real terminal ID shown by `herdr pane list` (for example `term_...`).
5. If the Pane belongs to a named Session, set `herdrPrototype.session` first.
6. Inspect **Output → Herdr Direct Attach Handoff Prototype** for state transitions and child exits.

## Guided checks

### A. Direct-attach fidelity

1. Focus the prototype terminal and wait for the existing Pane screen.
2. In Pi, verify `Shift+Enter` inserts a newline instead of submitting.
3. Verify fullscreen wheel scrolling.
4. Verify ordinary drag selection and copy.
5. Type a harmless marker and confirm it reaches the existing Pane exactly once.

### B. Explicit mobile handoff

1. Keep VS Code focused and run **Herdr Prototype: Yield Control**.
2. Tap/type in the same Pane on mobile.
3. Resize or rotate mobile and confirm Pane geometry changes away from the desktop dimensions.
4. Confirm the VS Code surface continues rendering as a read-only observer.
5. Run **Herdr Prototype: Take Control** and confirm the same Pane/input line returns.

### C. VS Code ↔ Ghostty focus handoff

1. Control the Pane from VS Code.
2. Focus its native Herdr/Ghostty client.
3. Confirm blur releases direct attach and Ghostty can resize and type.
4. Return to the prototype terminal and confirm direct attach is recreated without restarting the Pane.

### D. Rejected inactivity-Yield experiment

The 3000 ms experiment proved that local activity can debounce release and that input can reacquire control. It also exposed a blocking UX problem: when the lease expires, Herdr immediately reapplies the saved geometry of its native geometry controller. A mobile SSH client that remains connected while the device is locked can therefore make the focused VS Code surface jump to stale mobile dimensions without any new mobile intent.

The setting remains only to reproduce the finding. It defaults to `0`; do not treat a nonzero value as the selected product policy.

### E. Mobile popup/Yield lifecycle gate (throwaway, live-untested)

The temporary plugin was unlinked after the successful live gate. Repeating this gate requires explicit permission to link it again; otherwise the CLI open fails and is logged in Output. Reload the Extension Development Host to load the updated extension code. Close any earlier probe popup with `q` before this gate; Herdr permits one popup at a time.

1. Close RootShell on the phone. Focus the prototype Pane editor in VS Code and wait for `direct attach ready` plus `popup probe: open request completed` in Output.
2. Open RootShell later and check whether the previously opened popup appears. **Preserve any important unfinished input before pressing `y`.** After `y`, check Output for `popup probe: mobile Yield requested ...` and `stop attach (observe: mobile popup confirmed Yield)` followed by `spawn observer`; the Pane should remain alive and reflow to mobile dimensions when mobile takes control. There should be no automatic VS Code re-attach just because its editor remains visible.
3. Type from mobile, then locally type a harmless marker in the VS Code prototype; that first local input should reacquire attach and appear only once, restoring desktop geometry and reopening the popup. Separately check whether the popup interferes with Ghostty or other Panes. Switch the visible VS Code editor tab away; the popup should close. Return to the prototype to create another offer.
4. Close the VS Code prototype terminal or reload/close the Development Host: the popup should close. A hung host should stop heartbeats and the popup should close within about 4 seconds. Do not force-kill the Herdr server or Pane process for this check.
5. If a popup stays stuck, press `q` in RootShell/Ghostty. The popup is a temporary server UI resource; it is not the Pane being tested.

Real Yield is connected **only in this throwaway prototype** and still requires live validation. The host detects selected editor tabs using the public `TabInputTerminal` type and matching terminal label, a conservative prototype heuristic rather than proven multi-group identity. A local Unix socket with restrictive permissions is sufficient for this prototype, not a reviewed production authentication boundary.

### F. Transition residue

After several Observe → Attach → Observe cycles, check:

- no duplicated first character;
- no stale or partly repainted screen;
- cursor and unfinished input line survive;
- selection still works after reacquisition;
- clicks do not insert escape-sequence junk;
- closing the prototype terminal leaves the Pane/process alive.

Record results in [`EVIDENCE.md`](./EVIDENCE.md).

## Decision rule

- **Pass:** the direct-attach transport can replace the current semantic controller path; only the automatic mobile-Yield trigger remains unresolved.
- **Fail:** do not introduce `node-pty` into production; record which transition or terminal behavior makes the approach unsafe.
