# The Surface resets terminal modes when it drops an Attach

On exit, `herdr terminal attach` prints a tail that restores terminal modes: it pops the kitty keyboard flags and turns off bracketed paste, focus reporting, mouse modes and the alternate screen. The extension stops reading the Attach the moment it stops it, so that tail never reaches xterm.js, and kitty flags leaked across Attach handoffs (#29). We do not forward the tail. Instead, whenever the Pane Editor's Surface drops an Attach, it writes its own fixed reset: pop every kitty flag on the current, alternate and main screens, then turn off the modes the attach client enables. Every new Attach replays the Pane's current state, so a fully reset terminal is always a correct starting point.

## Considered Options

- **Forward herdr's exit tail.** Rejected for three reasons. The tail arrives up to the SIGTERM timeout after the Observer has already started, so it interleaves with the Observer's `replace()` output. It turns off mouse modes the displaced Observer has just enabled. And it is missing entirely when the Attach is killed with SIGKILL.
- **Reset only in `SCREEN_RESET`.** Rejected because focused → hidden → focused and `move()` go from one Attach to the next with no `SCREEN_RESET` in between.

## Consequences

The reset sequence is tied to xterm.js's per-screen kitty flags: `?1049l` saves the current flags and `?1049h` restores them. If herdr's attach client starts enabling a new terminal mode, add it to the reset as well.
