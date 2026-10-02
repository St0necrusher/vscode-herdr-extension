# Close actions close their Pane Editors; remote closes leave the placeholder

When Close Pane, Close Tab, Close Space, or Close Group from VS Code succeeds, the extension closes the Pane Editors of every Pane that action closed. When another Herdr client closes a Pane, its Pane Editor stays open with the "Herdr Pane is unavailable" placeholder. The user who clicked `×` in VS Code clearly wants the editor gone; a Pane vanishing from elsewhere is a surprise the user should see rather than lose their tab layout to. If the close response is lost or fails, no editor is closed.
