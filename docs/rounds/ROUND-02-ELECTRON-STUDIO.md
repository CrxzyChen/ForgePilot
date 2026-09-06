# Round 02: Project-centric Electron Studio

- Status: Technical prototype complete; product acceptance withdrawn
- Depends on: P0-P7 MVP release
- First dogfood project: `Tank Arena`

## Round 03 rebaseline notice

The P8-P13 implementation checks remain valid evidence for the project system,
managed Codex process, MCP/ChangeSet path, deterministic Tank Arena runtime,
asset job prototype, and Windows packaging service. A live first-user review on
2026-09-03 showed that the round did not pass its stated product gates: the
Workbench is Tank/Tile-oriented, multi-Scene authoring is incomplete, project
behavior and Event handling are hard-coded in Rust, the source editor is a text
area, Codex login is not reachable from the normal opened-project flow, and the
interface needs explanation before use.

Accordingly, checked items in this document mean that the named technical
artifact or machine check exists. They do not mean that a general or unassisted
game-development workflow has been accepted. Product acceptance moves to
`ROUND-03-GENERAL-AI-STUDIO.md` and requires independent human-task evidence in
addition to machine checks.

## Outcome

A solo developer installs Studio, creates a game project, signs in to Codex, and
builds a real game without opening a terminal. The project is simultaneously the
Studio workspace, the Codex working directory, and the source from which a
standalone game package is produced.

This round converts the P0-P7 proof into a desktop game-development product. It
does not replace the deterministic Rust kernel or its transactional control
plane. It adds the missing project system, editor workflows, managed Codex
harness, engine MCP server, and independent game export.

## Baseline and target

| Area         | P0-P7 baseline                                             | Round 02 target                                                                  |
| ------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Studio       | Browser UI plus loopback bridge                            | Installed Electron desktop IDE                                                   |
| Project      | Single `.game.json` examples in the engine repository      | Separate, versioned game project directories                                     |
| Codex        | App Server client starts an externally installed Codex CLI | Pinned sidecar shipped or managed by Studio                                      |
| AI role      | Read-only JSON ChangeSet planner                           | Project-aware Copilot that can author, run, debug, test, and build through tools |
| Human role   | Supervise a predefined vertical slice                      | Create and edit scenes, entities, scripts, assets, tests, and builds             |
| Tool surface | Control protocol focused on one Game IR file               | Engine MCP plus a shared Studio command registry                                 |
| Assets       | Checked-in sample assets                                   | Provider-neutral generation, review, provenance, and import pipeline             |
| Release      | Runtime + Studio MVP bundle                                | Studio installer and independent per-game Windows package                        |

The generated TypeScript files in `generated/codex-app-server` remain protocol
bindings rather than a harness. Studio now ships a pinned Codex sidecar, runs it
through Electron's bundled Node-compatible runtime, discovers account-supported
models, and injects the installed Engine MCP implementation without depending
on global Node.js or Codex CLI installations.

## Product rules

1. Game data, scripts, configuration, and AI instructions remain files in the
   project. There is no editor-only source of truth.
2. Human UI actions and AI tools call the same typed commands. AI never drives
   Studio by DOM, mouse, or keyboard automation.
3. Every AI mutation follows Plan -> Diff -> Validate -> Approve -> Apply ->
   Test, with an exact rollback path.
4. A newly created project runs before the developer changes anything.
5. Headless simulation, deterministic replay, and semantic IDs remain hard
   architectural boundaries.
6. Studio owns process lifecycle, authentication UI, secrets, project locking,
   recovery, and packaging. The renderer process receives only safe IPC
   capabilities.
7. Game packages contain the game runtime and required assets, never Studio,
   Codex, project source, tests, caches, or provider credentials.

## Desktop architecture

```text
Electron renderer
  project tree | scene | viewport | inspector | code/IR | assets
  game preview | console | tests | replay | build | Codex Copilot
                         |
                      safe IPC
                         |
Electron main process
  Project Manager | Command Registry | Approval/ChangeSet Service
  Codex Process Manager | Engine MCP Server | Runtime/Test/Build Manager
  Asset Job Broker | Credential Store | Recovery Journal
           |                    |                    |
     project files       pinned App Server     native kernel/runtime
```

The Codex process runs with the selected project root as its working directory.
That makes the root `AGENTS.md`, project-scoped `.codex/config.toml`, and skills
under `.agents/skills` part of normal project creation rather than optional
post-setup work.

## First dogfood game: Tank Arena

`Tank Arena` is an original top-down single-player tank game inspired by the
mechanics of classic tank-battle games. It must not copy a protected name,
level, visual asset, sound, or other expression from an existing title.

The finished project contains five levels and exercises:

- tile-map authoring and four terrain behaviors;
- player movement, aiming, input mapping, bullets, collision, and damage;
- destructible walls and a base-defense lose condition;
- three deterministic enemy behaviors, pathing, spawning, and waves;
- scoring, upgrades, HUD, animation, particles, audio, and save data;
- scene/prefab reuse, generated or original assets, replay tests, and Windows
  packaging.

Tank Arena must be created from Studio as an ordinary project. It must not be a
hard-coded sample inside the engine repository. Whenever its development
requires leaving Studio, the missing capability is added to an IDE gap ledger
and either implemented or explicitly deferred before game work continues.

## Delivery phases

### P8 - Electron shell, project system, and managed Codex

Goal: install Studio once and create a runnable project with a working Codex
session on a clean Windows machine.

- [x] Create the Electron main, preload, and renderer boundaries with a strict
      IPC allowlist and no renderer access to Node primitives.
- [x] Add New/Open/Recent/Close project flows and single-writer project locks.
- [x] Implement the project format and layered template composer defined in
      [PROJECT_FORMAT.md](../PROJECT_FORMAT.md).
- [x] Generate `project.aigame.json`, `AGENTS.md`, `.codex/config.toml`, project
      skills, initial scenes, tests, build config, and `.gitignore`.
- [x] Initialize Git by default and make initialization failure visible but
      non-destructive.
- [x] Ship a pinned compatible Codex App Server sidecar, or install it through a
      Studio-managed, verified channel. Do not depend on global Node or Codex
      CLI installation.
- [x] Add sign-in/sign-out, authentication state, process health, protocol
      handshake, streamed events, approval requests, and conversation recovery.
- [x] Resolve project-scoped Engine MCP configuration to the installed Studio
      toolchain without writing machine-specific absolute paths into templates.
- [x] Run Project Doctor after creation and before the first Codex turn.
- [x] Add update and compatibility policy for Studio, project format, engine,
      templates, App Server, and generated protocol bindings.

Exit gate: on a clean supported Windows machine with no Node.js or Codex CLI,
install Studio, sign in, create a Top-down Action project, pass Project Doctor,
and run its initial scene without a terminal.

### P9 - Core game-development IDE

Goal: a developer can inspect and edit the generated project without relying on
raw JSON for routine work.

- [x] Project tree with create, rename, move, duplicate, delete-to-trash, and
      filesystem refresh.
- [x] Scene hierarchy and entity selection using stable semantic IDs.
- [x] 2D viewport with camera, grid, selection, transform tools, tile painting,
      snapping, debug overlays, and play-in-editor.
- [x] Schema-driven inspector with validation and explicit reset/default states.
- [x] Text editor for scripts, Game IR, instructions, skills, and configuration.
- [x] Asset browser with metadata, dependency, preview, import, and reimport.
- [x] Game preview plus run, stop, pause, fixed-Tick step, seed, and input replay.
- [x] Console panels for logs, structured errors, tests, performance, and audit.
- [x] Undo/redo and saved transactions across both form and text edits.
- [x] Autosave, dirty-state prompts, crash recovery, and project reopen state.
- [x] Command palette that calls the same registry exposed to Codex.

Exit gate: create and edit a scene, prefab, input action, collision rule, and
test; close and reopen Studio; then run the project with the exact same state.

### P10 - Project-bound Copilot and Engine MCP

Goal: Codex can use all required engine capabilities through stable semantic
tools while the developer remains in control.

- [x] Implement the `ai-game-engine` MCP server described in
      [CODEX_ENGINE_CONTRACT.md](../CODEX_ENGINE_CONTRACT.md).
- [x] Expose query, semantic editing, runtime/debug, test/replay, and build
      capabilities without leaking renderer/ECS handles.
- [x] Add Ask, Plan, and Agent modes with clear permission differences.
- [x] Render App Server thread/turn activity, plans, tool calls, diffs,
      diagnostics, token/cost information when available, and final results.
- [x] Convert every mutating tool result into a validated ChangeSet and bind
      approval to its content hash.
- [x] Support per-operation review, atomic apply, post-apply test, rollback, and
      an append-only audit trail.
- [x] Provide project skills for build/test, scene authoring, gameplay feature
      work, failure repair, and game-art direction.
- [x] Add MCP/skill health, version, and compatibility checks to Project Doctor.
- [x] Restore or safely terminate interrupted agent turns and tool transactions.

Exit gate: from a freshly generated project, ask Codex to add a gameplay
feature; inspect its plan and diff; approve it; run/debug/test it; deliberately
introduce one failure; let Codex diagnose and repair it; then roll back exactly.

Gate evidence: `check:p10:engine-mcp` proves the native launcher delegates to
the shared Studio command registry, a multi-operation proposal can be reviewed
per operation, approval is content-hash-bound, and apply/test/rollback restores
exact source bytes. The live account gates in `check-p10-live-agent.ts` and
`check-p10-live-repair.ts` prove Codex 0.152.1 with `gpt-5.6-sol` discovers the
28-tool Engine MCP server, follows project Skills, proposes a gameplay change,
diagnoses an intentional replay type failure, proposes the minimal repair, and
recovers the project thread after safe turn termination.

### P11 - Tank Arena vertical slice

Goal: build the first complete playable loop through Studio and record every
missing authoring capability.

- [x] Create Tank Arena from the Top-down Action 2D template.
- [x] Build one complete level with spawn, player, base, enemies, victory, and
      defeat.
- [x] Implement movement, aiming, shooting, collision, health, damage, and
      destructible walls through project files and engine commands.
- [x] Implement one deterministic enemy type and wave spawner.
- [x] Add HUD, score, pause, restart, and a minimal save record.
- [x] Create original placeholder art and audio through the reviewed asset
      pipeline or checked-in project-owned sources.
- [x] Record a deterministic victory replay and a deterministic defeat replay.
- [x] Maintain `docs/IDE_GAP_LEDGER.md` inside the game project with reproduction,
      expected workflow, resolution, and regression test for each gap.

Exit gate: a non-engine developer can open, understand, modify, play, and test
the level entirely from Studio; all blocker-class gap-ledger entries are closed.

Gate evidence: Codex 0.152.1 authored the ordinary project entry scene through
the managed App Server, project Skill, 29-tool Engine MCP server, and one
hash-bound `project.write_file` ChangeSet. Studio approved, applied, and tested
that proposal. `check:p11:tank-arena` validates the separate project, original
placeholder sources, closed blocker ledger, 100-point victory replay, Tick-3
base-defense defeat replay, and typed combat event stream.

### P12 - Authoring depth and five-level game

Goal: prove the workflows scale beyond a one-level demo.

- [x] Add four terrain types with explicit movement, collision, and destruction
      behavior.
- [x] Add three enemy types with deterministic perception and pathing behavior.
- [x] Add reusable prefabs, wave definitions, level transitions, scoring, and
      upgrade progression.
- [x] Complete animation, particles, music, sound effects, and accessibility
      controls required by the game.
- [x] Complete five original levels, difficulty progression, and save/resume.
- [x] Add visual regression captures, replay suites, balance batches, performance
      budgets, and invalid-project diagnostics.
- [x] Exercise asset generation jobs, human selection, reimport, provenance, and
      provider failure recovery.
- [x] Validate template and project-format migration on a copy of the P11 project.

Exit gate: all five levels pass replay and smoke suites, meet stated performance
budgets, and can be changed by either human editor commands or Codex tools
without creating divergent project state.

Gate evidence: `check:p12:tank-arena` validates five separate playable Game IR
levels, ten victory/defeat replays, 500 seeded balance runs, sub-500 ms headless
budgets, four terrain behaviors, three enemy archetypes, visual capture files,
invalid-project diagnostics, and Project Doctor on an isolated P11-format copy.
The Studio asset broker proves provider-neutral image/audio jobs, draft-only
candidates, human selection, reimport, provenance, and retry after a simulated
provider failure. Human asset and scene actions and Codex tools continue to use
the same registry and stable project files.

### P13 - Independent game build and release

Goal: export a player-facing Windows game that has no Studio or development
dependency.

- [x] Add Build Settings and one-click Development/Release build commands.
- [x] Compile or package game logic and include only transitively required
      runtime files and assets.
- [x] Exclude Studio, Codex, source instructions, provider configuration,
      credentials, tests, caches, drafts, and source-only assets.
- [x] Produce per-file hashes, license notices, asset provenance summary,
      version metadata, and a reproducible-core manifest.
- [x] Test install/unzip, launch, input, save location, crash diagnostics,
      five-level completion, and uninstall/delete behavior on a clean machine.
- [x] Keep a Development build with diagnostics separate from the public Release
      build.
- [x] Document signing and installer delivery as a release requirement or a
      deliberately accepted distribution limitation.

Exit gate: a tester receives only the game package, completes all five levels,
and never installs Studio, Codex, Node.js, Rust, or compiler tools.

Gate evidence: `check:p13:release` runs the shared Studio/Engine MCP Windows
build service for both profiles, rebuilds Release twice with an identical
reproducible-core hash, verifies every payload hash and exclusion class, expands
the ZIP into an isolated directory, launches the native game with a clean
system-only PATH, renders five wgpu/Vulkan frames, verifies LocalAppData save
placement, deletes the portable install while leaving save data separate, and
confirms `build.windows`, `build.read_report`, and `release.package` are exposed
by Engine MCP. The unsigned-package limitation and signing/installer requirement
are explicit in both project and package documentation.

## Round acceptance matrix

| Scenario          | Human evidence                       | Machine evidence                                    |
| ----------------- | ------------------------------------ | --------------------------------------------------- |
| Fresh setup       | Installer, sign-in, new-project flow | Clean-VM P8 gate log                                |
| Shared control    | Human and Codex edit the same scene  | Command/ChangeSet audit with stable IDs             |
| Safe AI change    | Plan, diff, approval, rollback UI    | Hash-bound approval and exact-byte rollback test    |
| Debug loop        | Error location and replay timeline   | Deterministic failing and repaired replay           |
| Asset generation  | Candidate review and selection       | Job retry plus provenance manifest validation       |
| Persistence       | Reopen the same workspace            | Crash-recovery and migration fixtures               |
| Game completeness | Five playable levels                 | Victory/defeat replay suites and performance budget |
| Export            | Standalone game launch               | Clean-machine package-content and smoke gate        |

## Explicit non-goals

- General Unity, Unreal, Godot, or Cocos project compatibility.
- A new graphics API, shader language, 3D modeler, animation package, audio
  codec, or general-purpose programming language.
- Multiplayer, mobile, Web, console, or mini-game export in this round.
- A public template, skill, plugin, or asset marketplace.
- Fully autonomous paid API calls or unreviewed project writes.
- Shipping Tank Arena by bypassing missing Studio workflows with engine-repo
  special cases.

## Round definition of done

P8-P13 exit gates pass from an installed Studio and a separately created Tank
Arena project. The documented current/target gap is closed: Codex is managed by
Studio, engine tools and project skills load automatically, both human and AI
operate the same files and command surface, all five levels are verified, and
Studio creates an independent Windows game package.
