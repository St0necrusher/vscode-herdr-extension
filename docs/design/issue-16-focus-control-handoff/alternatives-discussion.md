# Issue #16 — discussion of alternative approaches

Status: result of a discussion with the user on 2026-09-26. It complements [`simplification-audit.md`](simplification-audit.md). Code was not changed.

Question: is there a fundamentally simpler path that makes large parts of the current Pane terminal surface machinery (Pseudoterminal + `node-pty` attach + observer + focus handoff) unnecessary?

Answer: no, not while Herdr stays unchanged. The current approach stays. The audit plan stays, with the corrections below.

## Facts from Herdr 0.9.0 source

Pinned revision `b99002ac99b09e00b4ca692436cb15a6b0d676f1`.

- **Only attach clients are exclusive.** `terminal_attach_owners` (`src/server/headless.rs`, `attach_terminal_client`) tracks `terminal attach` and `terminal session control` clients only. Ghostty and the mobile SSH client are shell clients (the full Herdr TUI) and are not in this table. `--takeover` displaces only another attach client: the server sends it `ServerShutdown "terminal attach taken over"` and the process exits. Without `--takeover`, a second attach fails immediately.
- **`control` is the same server path as `attach`.** `control_terminal_client` calls `attach_terminal_client`. It has the same exclusive owner and the same resize lock.
- **Resize lock.** While an attach client is connected, `direct_attach_resize_locks` holds the Pane geometry. Shell clients cannot resize the Pane. When the attach client disconnects, `remove_client_and_resize_if_needed` restores the geometry of the last shell geometry controller. This is the "stale mobile geometry" finding in the prototype `EVIDENCE.md`.
- **No release without disconnect.** `terminal.release` in the `session control` protocol maps to `ClientMessage::Detach`, and the client exits. The raw `terminal attach` client has no release at all.
- **The attach client ignores focus.** `src/client/attach.rs` does not handle focus in/out.
- **Input from mobile is blocked in practice** while a VS Code attach is connected. The user tested this. In source only the geometry lock was found, but the result is the same: the Pane is not usable from the phone.

## Why the machinery exists

1. Faithful interaction (Shift+Enter in Pi, wheel inside Pi and Claude Code, local selection) needs the raw `terminal attach` client in a real PTY with `mouse_capture = false`.
   - A full `herdr` inside a VS Code terminal shows the Herdr sidebar and Herdr Tabs, and mouse input does not work.
   - `terminal session control` streams frames rendered by Herdr. The modes that the application requests (keyboard protocol, mouse reporting) do not reach xterm.js, so Shift+Enter and the wheel inside Pi break.
2. Herdr releases control and geometry only when the attach client disconnects. To let Ghostty take over on blur, the extension must stop the attach process. To keep the Pane editor alive after that, it must show something else in the same tab: the observer. A plain `createTerminal({ shellPath: "herdr", ... })` closes the tab when its process exits. That is the only reason for Pseudoterminal + `node-pty`.
3. The main use case: the user works in VS Code, walks away, and continues on the phone. The VS Code window stays focused. The extension has no local signal that the user moved to the phone. Only the Herdr server sees mobile activity. The mobile popup plugin (#26) exists to bring this signal back to the extension.

## Alternatives examined

| Alternative | Result |
|---|---|
| Plain `createTerminal` + `herdr terminal attach` (VS Code owns the PTY) | Same fidelity, but the lock cannot be released without killing the tab. The phone stays blocked. Rejected. |
| Pseudoterminal + `terminal session control` instead of attach | Same exclusive owner and lock; `release` = disconnect. Shift+Enter and wheel inside Pi are lost. Only gain: no `node-pty`. Rejected. |
| Drop the observer, show "press a key to take control" | Possible, but the user loses a live view while another client controls the Pane. Not chosen. |
| Upstream Herdr change (focus-based lock release, or "last active client owns geometry", like tmux `window-size latest`) | Would remove `node-pty`, the observer, process restarts and the popup. **Not possible: the user cannot influence Herdr.** |
| Webview + xterm.js | Handoff and lock stay the same. Only gain: wheel events under our control. Not needed: the wheel-to-SGR fix gives the same result in the native terminal. Rejected. |
| Webview + Ghostty (`coder/ghostty-web`, libghostty in WASM) | Same as webview + xterm.js with a different engine. No gain for our problems. Rejected. |

## Decisions

- **D-A1.** Keep the current approach (Pseudoterminal + `node-pty` attach + observer) and continue with the audit plan.
- **D-A2.** The mobile popup (#26) is a required part of the solution for the main use case, not a speculative "future consumer". Therefore keep `PaneEditorSelectionModel` and `PaneEditorFocusTracker` as the source of the selection and focus signal. This reverses audit decision D2 (R4). Manager can still push visibility to Surface if that is simpler, but the Selection/focus signal stays available for the popup and sidebar highlighting.
- **D-A3.** No upstream Herdr changes.

## New finding: wheel in applications without mouse reporting

Symptom: in a Pane with a plain shell or Codex, the wheel scrolls the input history instead of the output. In Pi and Claude Code the wheel works.

Cause (verified in source and by manual test):

- The attach client calls `ratatui::init()`. This switches xterm.js to the alternate screen (`\e[?1049h`).
- With `mouse_capture = false`, mouse reporting in xterm.js is on only when the application in the Pane asks for it (`stream_host_mouse_capture_mode`, `child_requests_mouse`). Pi and Claude Code ask. bash and Codex do not.
- xterm.js in the alternate screen without mouse reporting always converts the wheel to arrow keys (`MouseService.ts`, `!buffer.hasScrollback`). This cannot be switched off.
- `node-pty` cannot help: the conversion happens in xterm.js, before the bytes reach the extension. The VS Code API gives no wheel events for terminals.

Apparent platform limit: xterm.js offers no mode where the wheel is reported while native selection stays on. `mouse_capture = true` fixes the wheel but needs Option+drag for selection; the user rejected modifiers. The arrow-key trick below works around this limit.

### Chosen fix: wheel-to-SGR translation + arrow-key keybinding

Supersedes the "alt-screen filter + page-scroll keybinding" fix below, which the user rejected: in bash and Codex the scroll feels like a normal terminal scroll, and keyboard-only history is not acceptable. Goal stated by the user: the same experience as running the program directly in Herdr.

Idea: keep the alternate screen, so xterm.js still converts each wheel step into one bare arrow. Make real arrow keys never reach `handleInput` as bare arrows. Then every bare arrow in `handleInput` is a wheel step.

1. The extension contributes keybindings for ↑/↓ with a custom context key that is true only when a Pane editor terminal has focus. The command writes the arrow bytes directly into the attach input (not through `handleInput`), and it uses `\eOA`/`\eOB` or `\e[A`/`\e[B` according to the DECCKM state that Surface tracks from attach output.
2. Surface replaces a bare `\e[A`/`\eOA` in `handleInput` with SGR wheel up `\e[<64;col;rowM`, and `\e[B`/`\eOB` with wheel down `\e[<65;col;rowM`.
3. The attach client parses SGR wheel input even when its own mouse capture is off (`attach_scroll_action`) and sends `AttachScroll`. The server forwards it to an application that requested mouse input, or else scrolls the Herdr scrollback of the Pane. This is the same routing that Herdr uses for Ghostty.

Manual experiment 2026-09-26 (PTY proxy in the VS Code integrated terminal, disposable Pane, `--wheel-to-sgr`, no arrow keys pressed):

| Pane content | Wheel up | Wheel down | Selection | Typing after scroll | Shift+Enter |
|---|---|---|---|---|---|
| bash after `seq 1 300` | scrolls Herdr history to the top, input line untouched | returns to prompt | native, no modifiers | works | — |
| Codex 0.157.1 | scrolls the answer and earlier output | returns to input | works (see below) | works | works |

Findings from the input/mode log of the Codex run:

- **Codex 0.157.1 requests mouse input.** 80 ms after connect, the attach client enabled `?1000h ?1002h ?1003h ?1015h ?1006h` in xterm.js (server `MouseCapture`, `child_requests_mouse`). The wheel reached Codex as real SGR events; the arrow translation was not used. The earlier report "wheel scrolls Codex input" was probably an older Codex version. Pi and Claude Code also request mouse input. The arrow translation is needed for bash and other programs without mouse input.
- **Selection in programs with mouse input is the program's own selection**, as in Herdr in Ghostty. VS Code Cmd+C does not copy it, because VS Code copies only the xterm.js selection.
- **Right click breaks mouse state.** The log has four right-button presses (`\e[<2;…M`) and no releases: VS Code opens its context menu and takes the release. The program thinks the right button is still down, and its selection stops working. This also affects Pi, Claude Code and the current extension. Fix: Surface does not forward right-button SGR events to attach (or sends the release immediately).

Copy behaviour compared by the user (2026-09-26):

| Program | Plain VS Code terminal | Herdr in Ghostty | Current extension (attach) |
|---|---|---|---|
| Pi | copies on selection | copies on selection | same as VS Code |
| Claude Code | copies on selection | copies on selection + Herdr tooltip | same as VS Code |
| Codex | Ctrl+C after selection | Ctrl+C or Cmd+C after selection | same as VS Code |
| shell | select + Cmd+C | copies on selection (Herdr selection, `mouse_capture = true`) | select + Cmd+C |

Decision: the extension behaves like a plain VS Code terminal. This is accepted. Native selection in programs with mouse input is not needed. Copy on selection for a shell is available through the user setting `terminal.integrated.copyOnSelection`; the extension does nothing for it.

The user confirmed that a right click breaks selection in the current extension too, so the right-button filter fixes an existing bug.

To check during implementation: arrow keybinding conflicts with user keybindings; the context key updates on terminal focus changes; Option+click (`altClickMovesCursor`) also sends bare arrows and must be disabled or accepted; DECCKM tracking; wheel coordinates in the SGR event (the experiment used `1;1`); right-button filter in Pi, Claude Code and Codex.

### Rejected fix: alt-screen filter + page-scroll keybinding

Manual experiment (throwaway PTY proxy in the VS Code integrated terminal, disposable Pane, `seq 1 300`):

| Run | Wheel | Selection | Resize | PageUp (Fn+↑) |
|---|---|---|---|---|
| A: current behaviour (alternate screen kept) | scrolls input history | works | — | scrolls Herdr history up to the top |
| B: `\e[?1049h`/`\e[?1049l` removed from attach output | does not touch input; scrolls only the small xterm.js viewport | works | ok | intercepted by VS Code (scrolls the xterm.js viewport only) |

This fix was proposed first:

1. Surface removes the alternate-screen switches (`\e[?1049h/l`, `\e[?1047h/l`, `\e[?47h/l`) from attach output before it writes to the Pseudoterminal. It must handle a sequence that is split between two chunks.
2. The extension contributes a command bound to PageUp/PageDown (optionally ⌘↑/⌘↓) when a terminal has focus. If the active terminal is a Pane editor, it sends `\e[5~`/`\e[6~` to the attach through `Terminal.sendText` (Pseudoterminal `handleInput`). Otherwise it runs `workbench.action.terminal.scrollUpPage`/`scrollDownPage`.
3. The attach client converts unmodified PageUp/PageDown into a Herdr page scroll (`attach_scroll_action`, `AttachScrollSource::PageKey`).

Result: the wheel no longer damages input, but it does not scroll history either; history is scrolled only with keys. Rejected by the user.

## Changes relative to `simplification-audit.md`

- D2 / R4: reversed (see D-A2).
- New slice: wheel-to-SGR translation + arrow-key keybinding + right-button filter.
- Rest of the audit plan: unchanged.

## Open questions

- Where Selection/focus should live, and how Manager and Surface use them, now that D2 is reversed.
- Webview: not needed for the wheel any more (the wheel-to-SGR fix gives wheel scrolling with native selection).

