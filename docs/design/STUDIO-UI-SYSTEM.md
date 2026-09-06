# AI Game Studio UI system

- Name: **Midnight Workshop**
- Status: product-owner approved and locked
- Scope: Electron project manager and Studio Workbench chrome
- Canonical implementation: `studio/electron/renderer/styles.css`
- Machine-readable tokens: `studio/electron/renderer/studio-ui.tokens.json`
- Machine contract: `npm run check:studio-ui-contract`
- Real-renderer contract: `npm run check:p15:quality`

This document preserves the interface language the product owner approved on
2026-09-04. It is a constraint for future Studio work, not a request to freeze
all layout forever. New capabilities should look native to this system while
remaining discoverable and responsive.

## Visual character

Midnight Workshop is a compact, quiet, blue-black professional tool UI. Its
hierarchy comes from surface depth, one-pixel boundaries, typography, spacing,
and restrained cyan state cues—not decoration. It should feel like one coherent
desktop instrument rather than a collection of web cards.

The design has five non-negotiable traits:

1. Near-black layered surfaces with no light-theme leakage.
2. Compact IDE density, with most chrome and controls between `9px` and `12px`.
3. Cyan used for focus, selection, and actionable emphasis, never as general
   decoration.
4. Thin aligned boundaries and generous invisible hit targets for interaction.
5. Explicit, consistent states instead of browser-native controls.

## Canonical tokens

These values are the current approved baseline. Changing one is a design-system
change, not an incidental component edit. Agents should read the versioned JSON
token file instead of recovering values from screenshots.

| Role            | Token           | Value                        |
| --------------- | --------------- | ---------------------------- |
| App background  | `--bg`          | `#090b10`                    |
| Base surface    | `--surface`     | `#0d1118`                    |
| Raised surface  | `--surface-2`   | `#111721`                    |
| Active surface  | `--surface-3`   | `#151c27`                    |
| Boundary        | `--line`        | `rgba(255, 255, 255, 0.075)` |
| Strong boundary | `--line-strong` | `rgba(255, 255, 255, 0.13)`  |
| Primary text    | `--text`        | `#c9d1d9`                    |
| Secondary text  | `--muted`       | `#728091`                    |
| Tertiary text   | `--faint`       | `#465361`                    |
| Focus/action    | `--accent`      | `#49cddd`                    |
| Soft selection  | `--accent-soft` | `rgba(73, 205, 221, 0.1)`    |
| Success/run     | `--green`       | `#64d98b`                    |
| Warning         | `--warning`     | `#e7b85d`                    |
| Error/danger    | `--danger`      | `#f0737e`                    |

Use Inter/Segoe UI for product text and Consolas/monospace for paths, code,
identifiers, hashes, and machine output. Do not introduce a decorative display
font into Studio chrome.

## Density and geometry

- Standard product chrome: `9–12px`; compact form labels and buttons: `9–10px`.
- Large project-manager headings may use `20–28px`; this exception does not
  transfer to Workbench panels.
- Titlebar height: `38px`; Activity Bar width: `44px`.
- Workbench boundaries are normally `1px`; compact controls usually use `4–6px`
  corner radii. Reserve larger radii for project-manager cards and dialogs.
- Scrollbars remain dark, thin, and visible enough to discover.
- Splitters expose an `8px` interaction target while their visible `1px` axis
  remains exactly on the adjoining panel boundary. Internal panel rules must
  not cross that axis.
- Long paths and labels truncate or wrap deliberately. They must not expand a
  dock, toolbar, or document tab unexpectedly.
- At the 960px minimum window width, clamp effective dock widths to the available
  container width and retain at least 260px for the central document. Keep saved
  dock preferences so a wider window restores them; explicit keyboard or pointer
  resizing starts from the visible panel boundary, not an off-screen saved size.

## Component grammar

### Application and panels

The frameless titlebar, Activity Bar, left navigation, central documents, right
Inspector/Copilot dock, and bottom diagnostics dock form one continuous shell.
Use surface changes and aligned rules for hierarchy. Avoid surrounding every
subsection with a card.

### Controls

Buttons, inputs, selects, textareas, tabs, tree rows, menu items, and disclosure
rows must have explicit Studio styles. A control must define all applicable
normal, hover, selected/active, focus-visible, disabled/loading, error, and
destructive states. Focus uses the cyan token and remains visible on dark
surfaces. Disabled controls stay legible but cannot resemble active actions.

### Icons and status

Use the existing Lucide line-icon language at roughly `13–16px`. Pair unfamiliar
icons with text or tooltips. Status colors carry semantic meaning: green for
successful/running, amber for warning, red for error/destructive, and cyan for
focus/selection. Never use color as the only status cue.

### Menus and transient UI

Menus, dialogs, context menus, progress overlays, empty states, and notifications
belong to the same surface and typography hierarchy. They must not fall back to
native gray buttons, unstyled white surfaces, or default `16px` form text.

## Interaction contract

- A click acknowledges immediately. Long operations show a busy state, real
  stages, elapsed time where useful, and duplicate-action protection.
- Pointer drag, viewport navigation, and splitter resizing update visually in
  the same animation frame; durable persistence may complete on release.
- Keyboard operation and focus-visible behavior are first-class.
- Loading, empty, unavailable, failure, and recovery states are designed states,
  not blank panels.
- AI-originated changes still use preview, validation, approval, audit, and
  rollback; visual convenience never bypasses those boundaries.

### Copilot progress placement

Goal / Plan progress belongs in a compact, collapsible card immediately above
the composer, not above the conversation. The collapsed header retains the
status, an objective/current-step summary, and applicable stop, resume, retry,
or remove actions. These actions are siblings of the disclosure button, never
hidden inside its body or nested inside the toggle target. Details scroll within
a bounded height; the transcript retains its own scrolling and bottom-follow
behavior. The card may have one quiet frame; avoid another frame around every
Goal / Plan detail section.

## Prohibited drift

Do not introduce any of the following without an explicit product-owner
redesign request:

- white or light-gray application surfaces;
- Chromium-native gray/outset form controls;
- inherited `16px` form typography in compact Workbench panels;
- glassmorphism, strong blur, decorative glow, or large soft shadows as the
  primary hierarchy;
- thick or misaligned separators;
- large pill buttons, oversized rounded cards, emoji icons, or a second icon
  family in the Workbench;
- cyan on most text or borders, which destroys its state meaning;
- game-specific military, fantasy, pixel-art, or neon decoration in Studio
  chrome;
- inline visual constants when an existing token or shared class fits.

## Agent implementation workflow

1. Read this file and inspect the closest existing component pattern.
2. State which existing tokens and primitive patterns the change will reuse.
3. Add a failing contract, computed-style, geometry, or interaction assertion
   for the defect or new invariant.
4. Implement every relevant interaction state and minimum-size behavior.
5. Inspect the real Electron result at 960×640 and 150% scale when applicable.
6. Run `npm run check:studio-ui-contract`, `npm run check:p15:quality`, and the
   phase/full gate required by `AGENTS.md`.
7. Update evidence and roadmap only after checks pass.

Screenshots are supporting references. The token contract, computed styles,
geometry, interactions, and executable gates determine whether a future change
still belongs to Midnight Workshop.
