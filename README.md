# VS Code Herdr Extension

A local desktop VS Code client for Herdr.

The extension discovers available Herdr Sessions and shows them in the **Sessions** View. Each row shows whether a Herdr Session is running, stopped, selected, connecting, connected, incompatible, or disconnected. Select a row to make that Herdr Session active; the selection is persisted and restored when possible.

Discovery runs during activation and can be refreshed from the Sessions View. Refreshing re-reads the configured Herdr executable and catalog, then restores the saved, configured, or default Herdr Session selection. The extension never starts or stops a Herdr Session automatically. To start one explicitly, select a stopped Herdr Session and choose **Herdr: Start Herdr** from the status actions. Start applies only to the currently selected stopped Herdr Session.

A compact status item reports discovery and connection state and provides recovery and diagnostic actions. Selected Session tooltips include endpoint, version, protocol, and failure details when those values are available.

## Commands

- **Herdr: Show Status Actions** — open status, recovery, and diagnostic actions
- **Herdr: Refresh Sessions** — rediscover Herdr Sessions and restore selection
- **Herdr: Retry Discovery** — retry discovery or reconnect the selected Herdr Session
- **Herdr: Start Herdr** — start the explicitly selected stopped Herdr Session
- **Herdr: Select Herdr Executable**
- **Herdr: Open Settings**

Diagnostics are written to the **Herdr** Output channel.

## Settings

- `herdr.executable`: executable name or absolute path; defaults to `herdr`
- `herdr.session`: initial Herdr Session preference/fallback when no valid saved per-workspace/window selection exists; defaults to `default` and never starts a Session automatically

## Development

```sh
npm install
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:extension
```

The normal test suite uses fakes and does not require Herdr to be installed. Extension Host activation is also safe without Herdr: discovery reports a missing executable and does not start a process.
