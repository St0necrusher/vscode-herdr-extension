# Session state is reconciled from full snapshots; events only invalidate

Herdr events mark the projected Session state dirty, and after a short debounce the connection fetches a complete `session.snapshot` and publishes it; event payloads are never applied as patches. One serialized reconciliation loop keeps the projection consistent with the server without an event queue or incremental reducer. The single exception is `pane.moved`, which is also forwarded directly so open Pane Editors can follow a Pane's new identity before the next snapshot.
