# VS Code Herdr Extension

A local desktop VS Code client for Herdr.

The first production slice performs discovery only during activation. It never starts or stops Herdr automatically. A compact status item reports whether the configured executable and Session are available; click it for recovery and diagnostic actions.

## Commands

- **Herdr: Show Status Actions**
- **Herdr: Retry Discovery**
- **Herdr: Start Herdr** — available for an explicitly selected stopped Session
- **Herdr: Select Herdr Executable**
- **Herdr: Open Settings**

Diagnostics are written to the **Herdr** Output channel.

## Settings

- `herdr.executable`: executable name or absolute path; defaults to `herdr`
- `herdr.session`: selected Herdr Session; defaults to `default`

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
