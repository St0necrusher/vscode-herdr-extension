# Translate wheel-emulated arrows into SGR wheel events

The attach client switches xterm.js to the alternate screen, where xterm.js turns every wheel step into a bare arrow key whenever the Pane's program has not requested mouse reporting (bash, older Codex), so the wheel scrolled shell history. We bind real Up/Down in Pane Editors to `workbench.action.terminal.sendSequence` with private markers (`\e]herdr;arrow-up\a`, `\e]herdr;arrow-down\a`), turn markers back into arrows (respecting DECCKM), and translate any remaining bare arrow into an SGR wheel event that Herdr's attach client scrolls. Keep the keybindings and the translation together: each is meaningless without the other.

## Considered Options

- Stripping alternate-screen switches plus PageUp/PageDown scrolling: the wheel stopped damaging input but no longer scrolled history; rejected by the owner.
- `mouse_capture = true`: fixes the wheel but needs a modifier for native selection; rejected.
