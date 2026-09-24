# Direct-attach handoff prototype evidence

Status: transport and explicit mobile popup Yield validated in throwaway prototype; production design not approved.

Environment:

- macOS: arm64
- VS Code: 1.137.0
- Herdr: 0.9.0
- Pi: 0.87.1
- Session:
- Pane / terminal ID:

## Results

| Check                                               | Result                     | Observation                                                                                                                                                        |
| --------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Direct attach renders existing Pane                 | Pass                       | Existing Pane opened through the prototype's `node-pty`-backed official attach.                                                                                    |
| `Shift+Enter` in Pi                                 | Pass                       | User confirmed that Shift+Enter works through the nested official attach.                                                                                          |
| Fullscreen wheel scrolling                          | Conditional pass           | Passed through both attach paths after Pi restart; transiently failed through both beforehand. Cause unknown.                                                      |
| Ordinary drag selection/copy                        | Pass                       | User confirmed ordinary selection works.                                                                                                                           |
| Input delivered exactly once                        | Pass                       | After mobile entered `MOBILE_` in observer mode, the first local `V` reacquired control and appeared exactly once.                                                 |
| Explicit Yield frees mobile resize                  | Pass                       | Merely connecting mobile changed nothing; after explicit Yield, the Pane immediately reflowed to mobile geometry.                                                  |
| Observer remains live during mobile control         | Pass                       | Mobile entered `MOBILE_` without submitting, and the VS Code observer rendered it live.                                                                            |
| First local input reacquires control                | Pass                       | Typing in VS Code after Yield immediately recreated direct attach and restored desktop geometry.                                                                   |
| Take Control restores the same Pane/input line      | Pass                       | Explicit Take Control restored desktop geometry; a separate first-input reacquire preserved `MOBILE_`, appended one `V`, and kept the cursor correctly positioned. |
| VS Code blur frees Ghostty resize/input             | Pass                       | Switching to Ghostty worked immediately without an explicit Yield because VS Code window blur automatically stopped direct attach.                                 |
| VS Code refocus reacquires cleanly                  | Pass                       | Returning to VS Code restored control without an explicit Take Control command.                                                                                    |
| 3000 ms local inactivity yields control             | Mechanism pass / UX reject | Yield occurred after the pause, but Herdr immediately restored stale mobile geometry even though the device was locked and supplied no new intent.                 |
| Continued local input debounces inactivity Yield    | Pass                       | The user completed the continuous-input phase before the post-input pause triggered Yield.                                                                         |
| Remote output/mobile input does not debounce Yield  | Not fully tested           | A connected background mobile client did not prevent expiry; program-output behavior was not separately exercised.                                                 |
| First input after inactivity is delivered once      | Provisional pass           | No loss or duplication was reported before the rejected post-input reflow; the earlier explicit-Yield path passed this check exactly.                              |
| Repeated transitions leave no terminal-mode residue | Provisional pass           | Multiple mobile Yield/reacquire and Ghostty focus transitions remained usable; a longer stress pass was not performed.                                             |
| Closing surface leaves Pane/process alive           | Pass                       | User confirmed the same Pane and process remained alive after closing the prototype terminal tab.                                                                  |

## Mobile popup Yield gate

**Live pass, 2026-09-24, Session `default`, terminal `term_65bed6b001ece2`:** VS Code auto-opened the linked Herdr plugin popup while its visible editor controlled the Pane. RootShell displayed it; the user reported that it looked right and did not interfere. Switching away from the editor and back opened a fresh offer. A preliminary no-op `y` reached VS Code (`received mobile request ... (NO YIELD)`), confirming the socket path before enabling release.

With real Yield enabled **only in the throwaway prototype**, the user's Output at 18:46:58 showed `mobile Yield requested`, offer retraction, `transition observe: mobile popup confirmed Yield`, graceful direct-attach exit code 0, and observer spawn at 99×31. The user confirmed that phone input worked and the Pane **immediately resized to phone dimensions** after `y`. Subsequent local VS Code typing reached the Pane, **restored VS Code dimensions**, and immediately opened a new popup. On closing the Extension Development Host, the popup disappeared apparently immediately; this may be normal focus-loss cleanup or socket disconnect, so it does not separately prove the 4-second hung-host watchdog. Isolated socket-close, heartbeat-timeout, accepted-request and stale-generation probes passed.

**Limits:** Offline RootShell reconnection after the offer was created has not been explicitly checked; the exact first-character count in this particular popup cycle was not measured (an earlier manual-Yield cycle delivered one `V` exactly once). A live deliberately hung VS Code host was not tested. Herdr popup capacity is global (one at a time); another popup may cause `ui_busy`. The prototype's visible-editor check uses `TabInputTerminal` plus terminal label, not a guaranteed identity in complex tab groups. The temporary globally linked plugin was unlinked after this gate; `herdr plugin list --json` returned an empty list.

## Interim finding

The transport seam works: one VS Code Pseudoterminal can switch between semantic observation and a `node-pty`-backed official direct attach. Direct attach preserves Shift+Enter, fullscreen scrolling, selection, and local input. Stopping direct attach releases Herdr's resize lease, and a later local input or explicit Take Control recreates it.

Mobile connection alone still does not displace direct attach. The validated explicit policy instead lets VS Code offer a popup in Herdr and yields only on the user's mobile confirmation. It is not transparent automatic handoff.

## Verdict

**Transport prototype: pass.** One VS Code terminal surface can use a real PTY-backed official attach for faithful control, release it into a live semantic observer, and reacquire without losing the existing Pane, unfinished input, cursor position, or first local character. Blur/refocus gives automatic VS Code ↔ Ghostty handoff, and closing the surface leaves server-owned state alive.

**Explicit popup policy: prototype pass, production not approved.** RootShell-confirmed popup Yield releases the VS Code resize lease and permits mobile geometry/input without an idle timer. Local input reacquires and reoffers the popup. The rejected inactivity policy would restore stale mobile geometry even with a locked phone; transparent mobile takeover still lacks a released Herdr signal. Before production, resolve the global-popup UX, robust editor identity/retry behavior, local IPC security, disconnect/restart behavior and the remaining live fidelity checks with the user.
