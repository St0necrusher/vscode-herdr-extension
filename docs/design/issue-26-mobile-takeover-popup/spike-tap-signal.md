# Spike: how can a phone user signal "take over"? (issue #26)

Date: 2026-09-27. Throwaway code: branch `spike/issue-26-tap-signal` (local commits `fedf6ad`, `b44966f`, not pushed), worktree `/private/tmp/vscode-herdr-issue26-spike`, directory `prototype/issue-26-tap-signal/` (tools, plugin, raw `logs/`).

## Environment

- macOS arm64, Herdr 0.9.0 (protocol 22), Session `default`.
- Lock holder: **the real VS Code extension** (#16 build), which the owner preferred to a Ghostty stand-in. The owner's desktop was VS Code only. There were two editor groups: `spike26-x` (disposable Pane `w3:p1P`, terminal `term_65c7384b7db0f5f`, 129×79 while attached) and the owner's chat with this session (`w3:p1N`). Both were attached at the same time under the multi-visible policy.
- Other Herdr clients: RootShell on the phone (43×33, 43×19 with the keyboard open), and an **unfocused Ghostty + Herdr TUI on a second monitor** (152×52).
- Probes:
  - `watch.cjs`: subscribes to all 24 parameterless event types, plus `pane.scroll_changed` and `pane.agent_status_changed` for `w3:p1P`. It also diffs `session.snapshot`, `pane.get` and `pane.process_info` every 250 ms.
  - `mouselog.cjs` in `w3:p1P`: SGR mouse modes 1000/1002/1006, focus reporting 1004, bracketed paste; logs raw stdin.
  - Plugin `local.issue26-tap-spike`: entrypoints `popup-tap`, `overlay-tap` and `overlay-mirror` log every input byte. A mouse press, Enter, Space or `y` counts as a confirm.
- The plugin was linked only while in use and then unlinked. The final `herdr plugin list --json` returned `{"plugins":[]}`. `popup.close` was never called.

Caveat: run 0 (logs `*-run0-dirty.log`) was contaminated while the owner was still setting up. Its findings were re-checked in clean steps A–F3; only the clean steps are cited below unless marked.

## Results

### E1: no UI (lock held by VS Code, phone on the same Pane)

| # | Phone action | Reached Pane process? | Visible through Herdr API? | Verdict |
|---|---|---|---|---|
| 1 | Switch to the tab | `\e[I` focus-in (run 0) | `workspace_focused`, `tab_focused`, `pane_focused`; `focused_pane_id` changes (run 0) | Signal only if the phone *changes* focus; in #26 the Pane is already focused |
| 2 | First touch after the other TUI client was active | `\e[I` focus-in | Only by polling: `snapshot.layouts[*].area` changes to the phone size (e.g. 152×52 → 43×33). No event, not even `layout.updated` | Weak; see inference below |
| 3 | Short tap (×3, twice: steps B, D, F1) | **No** (one exception in step C: `\e[<0;8;14M\e[<0;8;14m` in one chunk) | No | Fail |
| 4 | Long tap (1–2 s) | **Yes**, `\e[<0;12;21M` … `m`, held 0.5–0.7 s (F1, 3/3) | No | Fail for VS Code |
| 5 | Scroll, app with mouse mode on | **Yes**, as wheel `\e[<64/65/67;…M` | No (`pane.scroll_changed` fires only for output growth, `offset_from_bottom` stays 0) | Fail for VS Code |
| 6 | Scroll, plain zsh (no mouse mode, 322 lines of scrollback) (F3) | No | No: `offset_from_bottom` stays 0, no scroll | Fail |
| 7 | Keyboard `zz` / `y` | **Yes**; input is not locked, only geometry | No | Fail for VS Code |
| 8 | Keyboard shown/hidden | Nothing | Poll only: `layouts.area.height` 33↔19 | Incidental |
| 9 | Phone reconnect after lock screen (E4) | Nothing | Nothing observed | Fail |

Observed: the takeover lock is a **geometry** lock. Phone keys, wheel events and long taps are delivered to the Pane process while VS Code holds the attach, and the Pane keeps desktop geometry (the phone shows it cropped; the `R`/bottom frame was never visible on the phone). None of this input is exposed through the socket API. `pane.process_info` and `pane.get` never changed on input.

Inference, not proven: `layouts[*].area` looks like the size of the **most recently active TUI client**, and focus reporting follows that client's focused Pane. When the owner typed in the VS Code editor for `w3:p1N`, the Pane `w3:p1P` got `\e[O` and `area` became 152×52. That size belongs to Ghostty's TUI, not VS Code. It happened at 09:34:43, 09:40:09 and 09:48:43, and no `*_focused` event fired. The mechanism is unexplained. As a take-over signal, `area` only flips when a *different* TUI client was active before. It has no event (polling only), it cannot tell a tap from any other touch, and two clients of the same size would be indistinguishable. Not usable.

### E2: plugin `popup`

| Action | Observed | Result |
|---|---|---|
| Popup opened by the host CLI | Visible on the phone and on the unfocused Ghostty TUI; **not visible in VS Code** (the attach shows Pane content only) | Pass |
| Phone short tap inside | Nothing logged | Fail |
| Phone long tap inside | `IN \e[<0;22;2M`, release after 250 ms, then CONFIRM (09:37:58) | Pass |
| Phone long tap outside the popup | Not delivered to the popup or to the Pane; popup stays open | Swallowed (modal) |
| Phone key `y` | Delivered to the popup, CONFIRM (09:39:29) | Pass |
| Ghostty: click the window title, type `a` (popup opened with `--no-focus`) | Keys (`Ñ`, `a`) went to the **popup** | `--no-focus` does not stop the popup from taking TUI keyboard input |
| Ghostty click outside the popup | Not delivered anywhere | Swallowed |
| Ghostty **short** click inside | CONFIRM (09:43:00) | Pass |
| Popup opened, VS Code focused | VS Code typing and Pane unaffected; the popup lives only in TUI clients | Pass |

The plugin CLI returned `{"type":"ok"}` for a popup, with no `pane_id`. Popups do not appear in `session.snapshot` panes.

### E3: `overlay` placement

| Action | Observed | Result |
|---|---|---|
| Open `overlay-tap` | A **real Pane** `w3:p1Q` was created in the focused tab (`layout_updated`, `pane_focused` events). It **takes server focus**: `focused_pane_id` = the overlay, and the target Pane gets `\e[O`. Shown as an opaque full-tab pane on the phone and in Ghostty | Opaque, as expected |
| Size | Not bound by the takeover lock; follows the active client: 152×52 → 40×17 → 40×31 on the phone | — |
| Phone short tap | Nothing | Fail |
| Phone long tap | CONFIRM (09:45:34); on exit, `pane_exited` fires and focus returns to `w3:p1P` | Pass |
| `overlay-mirror` (pseudo-transparent: re-renders the target via `pane read --format ansi` under a banner) | The owner saw it as "a separate overlay"; the long tap confirmed (09:50:42), short taps did nothing. The mirror shows the desktop-geometry Pane cropped, so it is not convincing | Mechanism pass / UX not better |

Product risk (observed): an overlay changes `focused_pane_id` away from VS Code's Pane. That breaks the agreed eligibility rule ("offer only while the attached Pane is `focused_pane_id`") for as long as the overlay is open, and it emits focus events that VS Code's projection would react to.

### E5: plugin event hooks (`[[events]]` in the manifest)

The manifest accepts `[[events]] on = "<name>" command = [...]`. The hook process gets `HERDR_PLUGIN_EVENT` and `HERDR_PLUGIN_EVENT_JSON`. Observed: `pane.agent_status_changed` hooks ran, with the event JSON logged in `logs/hooks.log`.

- **Accepted** names are the dotted socket subscription names: `pane.focused`, `tab.focused`, `pane.created`, and similar.
- **Rejected** as `unknown event` at link time: `layout.updated`, `pane.scroll_changed`, `pane.updated`, `pane.output_matched`, `workspace.metadata_updated`, `*`, and the guessed `client.attached`, `client.connected`, `client.detached`, `session.started`.

Conclusion (observed): a plugin sees no more than a socket client, and actually a subset. There is no client, input, mouse or scroll hook.

### E6: full-screen popup mirror (`popup-mirror`, the owner's idea)

`placement = "popup"`, `width = height = "100%"`. `mirror.cjs` polls `herdr pane read <target> --source recent --lines 400 --format ansi` every 400 ms and draws the tail under a one-line inverse banner ("Hold to continue here · VS Code has this Pane"). SGR wheel events scroll the mirror, and any mouse press or key confirms.

| Action | Observed | Result |
|---|---|---|
| Open while the phone is disconnected | Full-screen popup shown in the Ghostty TUI (149×50). After the phone reconnected, the popup resized to 40×31, and the whole Ghostty TUI reflowed to the phone size (the owner found this acceptable) | Pass |
| First attempt (G) | The banner was visible but the mirror body was empty. Bug: `pane read` lines end in `\r`, and the following `\e[K` erased each line. Fixed by stripping `\r` | Fixed |
| Look on the phone (G2) | The owner saw the Pane content (`…398 399 400`, prompt) under the banner, "like a normal terminal" | Pass |
| Phone scroll up and down | Hundreds of wheel events reached the popup; the mirror offset moved 0 → 57 → 0 and the content scrolled | Pass |
| Phone long tap | CONFIRM (10:05:25) | Pass |
| `focused_pane_id` | Unchanged; a popup is not a Pane | Pass |

The owner's verdict: "it seems to work really well". The owner would keep the visible banner line in the final product, not hide it: it tells the phone user that VS Code holds the Pane and how to take it.

Caveats (inferred, not tested):
- Only a plain-shell scrollback (`seq 1 400`) was mirrored. The mirror shows desktop geometry (129 columns) cropped to the phone width.
- Alternate-screen TUIs (Pi, Claude Code) and colour or wide-character fidelity through `pane read --format ansi` are untested.
- The 400 ms CLI polling is a spike shortcut; production should subscribe or poll over the socket.
- The mirror popup also covers the whole desktop Herdr TUI while it is open.

### E4: offline phone

The popup was opened at 09:46:55 while the phone was locked and RootShell disconnected. After unlock and reconnect the popup was visible, and a long tap confirmed it (09:47:10). **Pass.** Reconnect alone produced no API-visible change.

## Raw evidence excerpts

```
# F1: plain taps on the locked Pane (mouse.log)
09:48:58.936Z \e[I                         # first phone touch = phone becomes active; 3 short taps otherwise lost
09:49:10.454Z \e[<0;12;21M   09:49:10.920Z \e[<0;12;21m   # long tap 1
09:49:12.275Z \e[<0;13;21M   09:49:12.740Z \e[<0;13;21m   # long tap 2
09:49:14.077Z \e[<0;13;22M   09:49:14.811Z \e[<0;13;22m   # long tap 3
# watch.log in the same window: only DIFF snapshot layouts.*.area 152x52 -> 43x33 at 09:48:59.134

# E2 popup (tap.log)
09:36:26.180Z [E2-popup-default] START size=37x7        # short tap at ~09:36:4x: nothing
09:37:58.223Z [E2-popup-default] IN \e[<0;22;2M          # long tap
09:37:58.224Z [E2-popup-default] CONFIRM via mouse press
09:42:51.509Z [E2d-popup-nofocus] IN Ñ                   # Ghostty keys despite --no-focus
09:43:00.647Z [E2d-popup-nofocus] IN \e[<0;29;2M          # Ghostty short click -> CONFIRM

# E3 overlay (watch.log)
09:44:09.901Z EVENT pane_focused {"pane_id":"w3:p1Q"}     # overlay steals focus
09:45:37.497Z EVENT pane_exited  {"pane_id":"w3:p1Q"}     # after long-tap confirm; focus back to w3:p1P
```

## Verdict and recommended UX

1. **E1 (no UI) is not feasible with stock Herdr 0.9.0.** Phone input reaches the Pane process, but Herdr exposes nothing that VS Code can observe. The one API-visible hint (`layouts.area` switching to the phone size) is polling-only and ambiguous, and it does not fire when the phone was already the last active TUI client. Do not build on it.
2. **Recommended: full-screen plugin `popup` that mirrors the Pane (E6)**, with a one-line banner. This is the best UX found. The phone user sees what looks like their terminal and can scroll it, and a long press (or a key) means "continue here". It is visible on the phone even when opened while the phone was offline, invisible in VS Code, and leaves `focused_pane_id` alone. The fallback, if mirroring proves unfaithful for TUIs, is the small confirm popup (E2). Either way:
   - Confirm on **any mouse press** (long tap on RootShell, short click in a desktop TUI) or a key. Use wheel only for scrolling the mirror.
   - Copy must say "**press and hold**" for RootShell; short taps never arrive. The owner reports that this is general RootShell behaviour in Herdr (tabs need long press too).
   - Clicks outside a small popup are swallowed and it takes the desktop TUI keyboard even with `focus: false`. Decide which keys confirm (the E2 note about stray Enter/Space/`y` also applies to the mirror, which currently confirms on any key).
3. **Reject `overlay`**. It steals server focus (breaking the eligibility rule and emitting focus events), it is opaque, and the "mirror" variant did not read as transparent.

## Open questions

- (Owner chose not to test before implementation; expects no problems.) E6 mirror with a real alternate-screen agent TUI (Pi / Claude Code) at desktop geometry: readability on a 40-column phone, colours, cursor, latency. Should confirming forward the first key to the Pane?

- Does RootShell's "short tap is lost" behaviour come from RootShell, Ghostty-in-RootShell, or Herdr's mouse handling? One short tap (step C, 09:33:04) did arrive, as press and release in a single chunk.
- Why do `\e[O` and `layouts.area` → 152×52 (the Ghostty TUI size) happen when the owner types in VS Code into *another* Pane's attach? Is "active client" tracked across attach clients?
- Should keyboard confirm be limited to `y`, so that desktop TUI keystrokes (the popup takes the keyboard despite `--no-focus`) cannot yield by accident?
- Popup `pane_id` is not returned by the CLI `plugin pane open` for popups (`{"type":"ok"}`). Check whether the socket `plugin.pane.open` returns one for popup placement; the extension needs it to close its own popup without `popup.close`.
- Not run: `--focus` explicitly on popup (default and `--no-focus` behaved the same on the phone), Ghostty focused while the phone confirms, multiple TUI clients confirming concurrently.
