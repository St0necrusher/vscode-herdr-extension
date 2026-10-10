# A navigation click retires the previous Tab Projection

A click on a multi-Pane Herdr Tab lays the Tab out as the whole editor grid (ADR 0017). Before this decision, the Pane Editors that click put into the grid stayed open after the user moved on to another Tab, Pane or Agent, so editor groups from the old Tab cluttered the grid. Now the next navigation click (a Herdr Tab, Pane or Agent row in the sidebar) retires that Tab Projection: it closes the Pane Editors the earlier click put into their groups, and then opens its own target. File editors are never closed. A group that held only Pane Editors from the Tab Projection disappears with them.

Membership comes from what the click did, not from where an editor stands now:

- A Pane Editor the click created or recreated in its group belongs to the Tab Projection, and it stays in it if the user drags it elsewhere afterwards.
- A Pane Editor the click found already in place keeps its previous membership. A repeated click on the same Tab therefore keeps the current Tab Projection.
- A click on a single-Pane Herdr Tab retires the previous Tab Projection and starts none.

When the clicked Pane is itself in the Tab Projection, the other members close first. The clicked Pane Editor stays where it is if its group still holds something else or no other group is left. Otherwise it is recreated in the active remaining group, so the user sees only that Pane. After that it belongs to the user.

Focusing a Pane Editor directly in the editor area, or selecting a Space or a Session, does not retire the Tab Projection.

## Considered Options

- **Close every Pane Editor except the target.** Rejected because it destroys Pane Editors the user opened on purpose.
- **Close only Pane Editors that are alone in a group the click created.** Rejected because `setEditorLayout` reuses the first group, so the first Pane of every Tab would stay behind next to the user's files.
- **Keep the clicked Pane wherever it stands.** Rejected because the owner treats an explicit click as "show only this Pane", so a lone cell left over from the old grid has to fold away.
- **Rejected for now: tracking a Herdr Tab's layout live while it is projected,** so that new Panes join the grid and closed ones leave it. That is a separate feature, and the Tab Projection stays a snapshot taken at click time.

## Consequences

- A recreated Pane Editor loses its VS Code-side scrollback, as in ADR 0017. The Pane in Herdr is untouched.
- The Tab Projection lives only in memory. After Reload Window, the next navigation click closes nothing.
