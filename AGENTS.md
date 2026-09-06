# AI Game Kernel agent contract

## Authority

- `docs/MVP.md` defines product scope.
- `docs/architecture/*.md` contains accepted architecture decisions.
- `docs/design/STUDIO-UI-SYSTEM.md` defines the approved Studio shell design
  language and interaction-density contract.
- `studio/electron/renderer/studio-ui.tokens.json` is the machine-readable,
  versioned Studio theme baseline.
- Future `schemas/` files define the authoring and tool protocols.
- `lib/roadmap.ts` is the human-facing delivery status source.
- Game IR is authoritative; runtime ECS, physics, renderer, and editor state are
  derived and disposable.

## Required workflow

1. Work on the active roadmap phase and its earliest unfinished acceptance item.
2. Keep every external operation structured, addressable, and machine-readable.
3. Add or update executable checks before marking a task complete.
4. Run `npm run check` and the relevant phase gate.
5. Update `lib/roadmap.ts` only after evidence passes.

## Studio UI contract

- For changes to the Electron renderer, project manager, Workbench, panels,
  dialogs, menus, or visual interaction states, use
  `.agents/skills/maintain-studio-ui/SKILL.md` and read the complete design
  system before editing.
- Preserve the approved Midnight Workshop tokens and component grammar. Do not
  change the global visual language unless the user explicitly requests a
  redesign.
- Add or update a computed-style, geometry, or interaction assertion. Run
  `npm run check:studio-ui-contract` and the relevant real Electron gate.
- This contract applies to Studio chrome, not to game HUD or game art; those
  remain governed by the individual game project's art direction.

## Architectural prohibitions

- Do not expose renderer, ECS, physics, pointer, or array-index handles in the
  public protocol. Map them to stable semantic IDs.
- Do not make an editor-only or binary artifact the source of truth.
- Do not add a capability without a vertical-slice acceptance scenario.
- Do not couple headless simulation to a window, GPU, wall-clock time, or an
  unseeded random source.
- Do not bypass preview, validation, approval, audit, or rollback for AI writes.
