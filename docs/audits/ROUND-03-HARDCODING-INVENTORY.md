# Round 03 production-boundary inventory

- Audit date: 2026-09-03
- Baseline commit: `42a6a0a`
- Owner: Round 03 implementation goal
- Status vocabulary: keep, extract, demo, replace, remove

This inventory records product assumptions discovered after the P0-P13
technical prototype. Line numbers identify the baseline; the durable gate uses
the path/pattern scan in `scripts/check-p14-rebaseline.ts` because later edits
move lines.

## Production-path assumptions

| ID      | Baseline evidence                                                                       | Assumption                                                                               | Classification | Owner / removal gate                                              |
| ------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| INV-001 | `studio/project/project-types.ts:3-13`                                                  | Project creation requires 2D, top-down action, Windows, and pixel art.                   | replace        | P15 project manager: Empty/Empty 2D/Empty 3D presets              |
| INV-002 | `studio/electron/renderer/App.tsx:32,235`                                               | New-project UI starts as Tank Arena and describes a fixed template stack.                | replace        | P15 project manager and onboarding                                |
| INV-003 | `studio/electron/renderer/Workbench.tsx:120,130,355,638-713`                            | Workbench state, asset prompts, palette, and canvas directly encode tank terrain.        | remove         | P17 general scene and resource editors                            |
| INV-004 | `studio/electron/renderer/styles.css` selectors `.brick`, `.steel`, `.water`, `.forest` | Production CSS owns one demo's terrain vocabulary.                                       | remove         | P17 generic viewport adapters                                     |
| INV-005 | `studio/workspace/studio-command-registry.ts:211,520`                                   | Workspace snapshot and paint command assume `scenes/main.tiles.json`.                    | replace        | P17 scene/resource registry; Tilemap becomes optional extension   |
| INV-006 | `studio/workspace/workspace-types.ts:30-43,59-68`                                       | Workspace contract has TileMap as a first-class product concept and one entry Scene.     | replace        | P17 generic document/scene summaries                              |
| INV-007 | `studio/workspace/studio-game-build-service.ts:198`                                     | Release attribution is hard-coded to Tank Arena assets.                                  | remove         | P20 project-derived build manifest                                |
| INV-008 | `schemas/game-ir.schema.json:143-181,274,606-741`                                       | Core schema defines Tank, Terrain, and tank-specific snapshots.                          | extract        | P17/P18: example extension schemas and generic component payloads |
| INV-009 | `crates/kernel-core/src/runtime.rs:161-230,351-510`                                     | Core public state, commands, and events encode cardinal tank combat.                     | extract        | P18 extension/system runtime                                      |
| INV-010 | `crates/kernel-core/src/runtime.rs:640,688-717,940-1019`                                | Runtime detects a hidden `tank_mode` and special-cases movement/fire.                    | remove         | P18 explicit project schedule and project scripts                 |
| INV-011 | `crates/kernel-core/src/runtime.rs:1182-1488,1685-1702,1954-1977`                       | Spawning, AI, combat, victory, and component parsing are one demo's compiled Rust logic. | demo           | P18 Tank extension implemented through public SDK                 |
| INV-012 | `crates/kernel-renderer/src/lib.rs:32-42,137-151`                                       | Core renderer assigns Tank/Terrain sprites and a fixed terrain palette.                  | extract        | P19 capability renderer registrations plus demo resources         |
| INV-013 | `crates/kernel-runtime/src/main.rs:103-111,224,417-424`                                 | Player input, title/save path, and HUD require tank state.                               | replace        | P19/P20 project-configured native player                          |
| INV-014 | `templates/topdown-action/**`                                                           | Top-down action and tilemap are installed as the only creation path.                     | demo           | P15 Examples catalog; not a project preset                        |
| INV-015 | `docs/PROJECT_FORMAT.md:17-131`                                                         | The portable format is explained primarily as a Tank Arena composition.                  | replace        | P17 project-format v2 guide                                       |

## Acceptable demo and regression paths

Tank vocabulary is allowed only in `examples/**`, the separately created
`work/projects/tank-arena/**`, explicitly named Tank regression scripts, and
historical Round 02 evidence. It must not leak into production Studio, generic
schemas, project templates, renderer, runtime, SDK, MCP discovery, or default
settings.

## P0-P13 subsystem disposition

| Subsystem                                     | Decision                  | Reason                                                                                          | Round 03 owner       |
| --------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- | -------------------- |
| JSON Game IR and stable semantic IDs          | keep                      | Inspectable, diffable authority is the AI-first foundation.                                     | P17 schema evolution |
| Deterministic Tick/hash/replay primitives     | keep                      | Required for tests, AI verification, and rollback.                                              | P18 runtime          |
| Project manager, locking, recent list, doctor | keep then extend          | Sound lifecycle base; creation model and settings are incomplete.                               | P15                  |
| Layered template composer                     | replace product role      | Reuse composition mechanics; replace genre-first defaults with capability presets and Examples. | P15                  |
| Core Game IR schema                           | extract domain vocabulary | Generic envelope remains; Tank and strategy components leave core.                              | P17/P18              |
| Rust runtime schedule                         | replace                   | Fixed ordering is useful, but compiled domain Systems are not.                                  | P18                  |
| wgpu snapshot projection                      | keep then modularize      | Renderer boundary is correct; logical palette is demo-specific.                                 | P19                  |
| Native winit player                           | keep then generalize      | Window/build path is reusable; input/HUD/title are not.                                         | P19/P20              |
| CLI/headless validation                       | keep                      | Primary machine-verification surface.                                                           | P18/P20              |
| Control protocol and structured diagnostics   | keep                      | Stable AI/human coordination boundary.                                                          | P16-P19              |
| Transactional ChangeSets, audit, undo/redo    | keep                      | Required AI safety primitive.                                                                   | P15-P19              |
| Engine MCP transport                          | keep                      | Correct semantic transport; commands must become registry-generated.                            | P19                  |
| Codex App Server sidecar                      | keep                      | Correct managed-agent boundary; UI is incomplete.                                               | P19                  |
| Provider-neutral asset broker                 | keep                      | Correct project job/provenance contract.                                                        | P19                  |
| Electron process/preload security boundary    | keep                      | Suitable desktop shell base.                                                                    | P15                  |
| Renderer Workbench                            | replace                   | It is a Tank/Tile test harness, not a general IDE.                                              | P15-P17              |
| Textarea file editing                         | replace                   | Insufficient for source development or diagnostics.                                             | P16                  |
| Release/build hashing and exclusion checks    | keep then generalize      | Reproducibility is correct; attribution/input assumptions are not.                              | P20                  |
| Tank Arena                                    | demo                      | Useful regression; never a core capability or creation preset.                                  | P17/P20              |
| P8-P13 implementation-derived acceptance      | replace                   | Technical evidence remains useful but cannot establish human usability.                         | P14/P20              |

## Enforcement

P17 closes only when the automated production-path scan reports zero domain
matches for Tank, Bullet, Brick, Pong, and Collectible. A match may be waived
only by moving it behind a declared example/extension boundary and documenting
that path here. Historical docs and named regression gates remain evidence, not
product dependencies.
