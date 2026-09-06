---
name: maintain-studio-ui
description: Preserve and extend the AI Game Studio desktop interface when changing its Electron renderer, project manager, Workbench, panels, dialogs, menus, or visual interaction states. Do not use this skill to impose the Studio shell style on a game's own HUD or art direction.
---

# Maintain Studio UI

1. Read [`docs/design/STUDIO-UI-SYSTEM.md`](../../../docs/design/STUDIO-UI-SYSTEM.md)
   completely before editing Studio UI code. Treat it as the product-owner-approved
   visual and interaction contract.
2. Inspect the existing component and its neighboring patterns. Reuse the
   established tokens, typography, density, borders, states, and layout grammar;
   do not introduce a second visual language for one feature.
3. Keep visual constants in CSS. Inline style is allowed only for genuinely
   dynamic geometry or data values. A new global token requires an explicit
   design-system decision and an update to the contract check.
4. Normalize every interactive state: normal, hover, active/selected,
   focus-visible, disabled, loading, empty, error, and destructive where
   applicable. Never rely on Chromium's native form appearance.
5. Add or extend an executable check before considering the change complete.
   Use `check:studio-ui-contract` for stable design invariants and the real
   Electron P15 gate for computed style, geometry, DPI, focus, resizing, or
   interaction behavior.
6. Inspect the result in a real Electron window at the minimum supported size
   and at 150% scale when geometry or density changes. Screenshots support the
   decision but do not replace computed-style and interaction assertions.
7. Run `npm run check:studio-ui-contract`, the relevant UI gate, and
   `npm run check`. Update roadmap/evidence only after those checks pass.

Game-facing UI remains project-specific. For a game's HUD, menus, sprites, or
art assets, follow that game's `AGENTS.md` and art-direction Skill instead.
