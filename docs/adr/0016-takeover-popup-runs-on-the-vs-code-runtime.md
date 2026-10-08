# The Takeover Popup runs on the VS Code runtime

Herdr starts a plugin pane's `command` with the Herdr server's environment, and the server keeps the environment of whatever started it. A server started by launchd (for example `brew services`) has `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, so a manifest command of `node` fails when `node` comes from nvm (#36). The extension cannot control how the server was started.

The manifest therefore runs `/bin/sh` by absolute path and execs `$HERDR_VSCODE_TAKEOVER_RUNTIME`. `TakeoverPopupHost` passes the extension host's `process.execPath` in that variable, together with `ELECTRON_RUN_AS_NODE=1`, through `--env` on every `plugin pane open`. A spike on Herdr 0.9.0 confirmed that the command runs in the plugin directory and that `--env` values reach it.

## Considered Options

- **Pass the extension host's `PATH` with `--env`.** Herdr resolves the command against it, but the popup still needs a `node` somewhere, and the extension host's `PATH` has no nvm when VS Code fails to resolve the shell environment.
- **Write an absolute `node` path into the copied manifest at install time.** Breaks whenever the nvm version changes.
- **Search the usual version-manager directories for `node`.** A heuristic that never covers every setup.

## Consequences

- The machine needs no `node`. The runtime path is read at every open, so VS Code updates do not break it.
- The popup starts only when VS Code opens it. Opened any other way, the `:?` guard in the manifest exits with an error. This matches the popup's purpose, since there is nothing to take over without VS Code.
- The popup bundle must run on the Node.js version bundled with VS Code's Electron.
- The design relies on Herdr putting `--env` values into the command's environment.
