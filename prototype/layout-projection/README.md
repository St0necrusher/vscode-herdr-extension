# Herdr Tab layout projection prototype

> **THROWAWAY:** this Extension Host prototype answers wayfinding issue #5. It is not production extension code.

## Question

Can an explicit **Open Herdr Tab Layout** action project a Herdr Tab's BSP split tree into native VS Code editor groups without unexpectedly disrupting file editors? What fidelity and ownership limits must the MVP state?

The prototype deliberately separates two already-distinct boundaries:

- static fixtures test VS Code editor-group placement without requiring Herdr;
- real Pane mode reuses Herdr's supported, read-only `terminal session observe` bridge to prove that existing server-owned Panes can occupy those surfaces.

It never calls `layout.apply`, creates a PTY, closes a Herdr Pane, or takes terminal control.

## Run

1. Open this repository in VS Code.
2. Press `F5` and choose **VS Code Extension Development** if prompted.
3. In the Extension Development Host, open two ordinary files. Modify one without saving.
4. Run **Herdr Prototype: Audit Editor State** and inspect the `Herdr Layout Projection Prototype` Output channel.
5. Run **Herdr Prototype: Open Layout Fixture** and exercise each fixture.
6. Compare the `BEFORE` and `AFTER` snapshots in the Output channel.
7. Run **Herdr Prototype: Close Layout Surfaces**. Confirm that only prototype terminals close.

For real Pane rendering, configure `herdrPrototype.session`, then run **Herdr Prototype: Open Real Panes as Layout** and enter existing Pane IDs in leaf order. The command opens observers only.

No install step is required. Syntax-check with:

```bash
npm run check:prototype
```

## Guided checks

### 1. Single Pane, occupied group

- Keep a clean and a dirty file open in the active group.
- Open the **Single Pane** fixture.
- Confirm both file tabs, their URIs, and the dirty flag remain present.
- Expected: the terminal is added as another native editor tab and receives focus.

### 2. Right split

- Start with one editor group containing files.
- Open **Right split**.
- Expected: the first terminal joins the active group. The prototype invokes `workbench.action.newGroupRight`, then opens the second terminal in the newly active group.
- Repeat with an existing editor grid. Check whether VS Code only resizes the grid or unexpectedly relocates existing file tabs.

### 3. Down split

- Open **Down split**.
- Expected: the first terminal joins the active group. The prototype invokes `workbench.action.newGroupBelow`, then opens the second terminal in the new group below it.
- Confirm the unsaved file remains open with unchanged contents and dirty state.

### 4. Mixed tree and ratios

- Open **Mixed tree + ratios**.
- Expected: the prototype creates the top-level group to the right, then a nested group below it. Herdr's direction and nesting should be visible; the `0.62`/`0.7` ratios are not applied.
- Confirm no existing file tab closes, moves, or loses its dirty state.

### 5. Repeated action and ownership

- Run the same fixture twice.
- Expected: the second action focuses an existing prototype surface and asks you to close the surfaces before rebuilding topology. It must not create duplicate groups or observers.
- Close one prototype terminal directly, or run **Close Layout Surfaces**.
- With real Panes, confirm the same Pane remains alive in Herdr/Ghostty.

### 6. Partial failure

- In real-Pane mode, provide one valid and one invalid target.
- Expected: existing files remain untouched. One observer may render while the other reports a bridge error; there is no editor-layout transaction to roll back.

## What the prototype is expected to establish

The typed VS Code API can add transient terminal tabs to existing editor columns but cannot create or resize editor groups. VS Code also exposes built-in workbench commands used by first-party features: `workbench.action.newGroupRight` and `workbench.action.newGroupBelow`. The prototype feature-detects and invokes those commands to reproduce Herdr's split direction and nesting.

This command-driven boundary still cannot apply Herdr split ratios, reserve an extension-owned editor grid, or transactionally restore the user's previous layout. Its focus and placement effects must therefore be validated rather than inferred from types.

A viable MVP action may be **additive and directional, but still best-effort**:

- open existing Panes as read-only terminal editor tabs;
- preserve all file editors;
- recursively create right/below groups using feature-detected built-in commands;
- preserve split direction and nesting, but ignore ratios;
- stop safely if a group command is unavailable or VS Code refuses another group;
- never rearrange or close existing file tabs to force fidelity;
- keep Take Control separate from opening the layout;
- close only extension-owned client surfaces, never Herdr-owned Panes.
