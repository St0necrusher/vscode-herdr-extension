# VS Code never closes the last Herdr Tab or Pane of a Space

Herdr cascades: closing the last Pane closes its Herdr Tab, and closing the last Tab closes its Space. From VS Code we hide Close Pane when a Space has exactly one Pane and Close Tab when it has exactly one Tab, so a Space disappears only through an explicit Close Space. This replaces the cascade allowed in #6: a small `×` on a Pane row should never silently destroy a whole Space. It also means Pane and Tab closes never hit Herdr's `confirmation_required` worktree-group refusal, which only fires when a close would close the Space.
