# Work within Herdr as released; no upstream changes

The project cannot influence Herdr, so every behaviour is built on the released Herdr CLI, socket protocol, and plugin system. This is why Pane Editors need the attach-and-observer machinery (ADR-0001) instead of a focus-based lock release, and why the mobile handoff signal arrives through a Herdr plugin popup (the Takeover Popup) instead of a server feature.
