# The selected Session decides the active connection, for now

The Session the window selects is the one it keeps connected, so the selection lives in `modules/sessions` beside the connection it drives, not in `modules/workspace-context` beside the Selected Space; the initial choice prefers the saved selection over the `herdr.session` setting. This is today's behavior, not a property of a Session: remote Sessions or several connected Sessions may later separate "browsed in navigation" from "kept connected", and Pane Editors already outlive a Session switch (ADR 0010).
