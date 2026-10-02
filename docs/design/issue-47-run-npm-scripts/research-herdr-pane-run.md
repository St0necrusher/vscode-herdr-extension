# Herdr: running a command in a Pane (0.9.0 vs latest)

Researched 2026-10-02 from shallow clones of `github.com/herdrdev/herdr` tags `v0.9.0` and `v0.9.3`.

## Confirmed

- The latest stable release is **v0.9.3** (2026-09-29, a hotfix for 0.9.2). `PROTOCOL_VERSION` is 22 in both 0.9.0 and 0.9.3 (`src/protocol/wire.rs:20`).
- **There is no `pane.run` socket method** in 0.9.0 or 0.9.3.
- The CLI `herdr pane run <pane> <cmd...>` is identical in both versions (`src/cli/pane.rs`, `fn pane_run`). It joins the args with spaces and sends a single `pane.send_input { pane_id, text, keys: ["Enter"] }`.
  - It does not quote anything. Quoting is the caller's job.
- On the server, `handle_pane_send_input` (`src/app/api/panes.rs`) encodes the text and keys, writes them to the PTY in one write, and returns `ok`.
  - It does not wait and returns no exit code.
  - When the Pane has bracketed paste on, the text is wrapped in paste brackets, followed by `\r`. Test: `api_pane_send_input_brackets_text_and_enter_atomically`.
  - After the command, the Pane stays the same live shell.
- An invalid key returns `invalid_key` before anything is written.
- `TabCreateParams` and `PaneSendInputParams` are byte-identical in the 0.9.0 and 0.9.3 schemas.
- Protocol stability rules in `socket-api.mdx`:
  - JSON clients ignore unknown fields and treat unsupported methods as normal errors.
  - There is no protocol handshake for JSON clients.

## Unconfirmed

- The raw (non-bracketed) path of `pane.send_input` was not checked by a test.
- If the shell has not started yet, the input is presumably buffered by the PTY. This is not tested.
- Preview builds after 0.9.3 were not inspected.

## Consequence

`runCommand` sends `pane.send_input { pane_id, text: <command line>, keys: ["Enter"] }`. This is exactly what `herdr pane run` sends, and it works the same on 0.9.0 through 0.9.3.
