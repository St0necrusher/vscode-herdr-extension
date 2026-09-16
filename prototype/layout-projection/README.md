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
- Expected: the first terminal joins the active group and the second requests the adjacent editor column. Existing files are not closed or moved.
- Repeat with an already-occupied second group. The terminal should join it rather than replacing its files.

### 3. Down split

- Open **Down split**.
- Expected: VS Code explains that direction cannot be preserved and opens both Pane surfaces as ordered adjacent columns.
- This validates the agreed MVP approximation: every Herdr split becomes another VS Code column.

### 4. Mixed tree and ratios

- Open **Mixed tree + ratios**.
- Expected: all three Pane leaves become ordered adjacent columns. Herdr direction, nesting, and the `0.62`/`0.7` ratios are not applied.
- Confirm no existing file tab closes, moves, or loses its dirty state.

### 5. Repeated action and ownership

- Run the same fixture twice.
- Expected: existing prototype surfaces are reused rather than duplicated. The Output channel records that public API cannot move a reused terminal to a newly requested group.
- Close one prototype terminal directly, or run **Close Layout Surfaces**.
- With real Panes, confirm the same Pane remains alive in Herdr/Ghostty.

### 6. Partial failure

- In real-Pane mode, provide one valid and one invalid target.
- Expected: existing files remain untouched. One observer may render while the other reports a bridge error; there is no editor-layout transaction to roll back.

## What the prototype is expected to establish

The supported VS Code API can add transient terminal tabs to editor columns. It cannot express arbitrary Herdr `right`/`down` nesting, split ratios, a dedicated extension-owned editor grid, or transactional save/restore of the user's editor layout. Therefore exact BSP projection is not a supportable MVP promise.

A safe MVP action can instead be **additive and best-effort**:

- open existing Panes as read-only terminal editor tabs;
- preserve all file editors;
- flatten every Herdr split into ordered adjacent VS Code columns;
- ignore split direction, nesting, and ratios;
- place leaves beyond `ViewColumn.Nine` as tabs in the ninth column;
- never rearrange or close editor groups to force fidelity;
- keep Take Control separate from opening the layout;
- close only extension-owned client surfaces, never Herdr-owned Panes.
