# Round 04: Real Game Authoring Loop

- Status: Validation — P22-P27 machine gates passed and 0.3.0 Preview 1
  candidate built; independent human exits remain open
- Target release: AI Game Studio 0.3.0 Preview
- Depends on: Round 03 architecture Alpha
- Delivery horizon: 10 weeks for one human developer working with AI
- Operational checklist: `docs/rounds/ROUND-04-CHECKLIST.md`
- Human observation board: `docs/testing/ROUND-04-HUMAN-OBSERVATION.md`

## Why this round exists

Round 03 proved the project format, semantic command registry, transactional
ChangeSets, Codex App Server integration, TypeScript script host, deterministic
headless execution, Electron shell, source editor, and Windows packaging path.
It did not prove that Studio is already a complete game-development tool.

The current Scene document is a DOM/CSS projection rather than the engine
renderer. Run executes a bounded script-host request and reports a snapshot
rather than maintaining a live playable session. Collider, Sprite, audio, light,
material, and several editor/provider settings have descriptors or files but do
not yet form end-to-end runtime capabilities. Minimum 3D is an isometric
primitive proof, not a perspective 3D renderer.

Round 04 closes that distinction. A feature counts only when its human UI,
durable project representation, native runtime, Codex tool path, diagnostics,
tests, undo/rollback, and clean-install human observation all agree.

## Product goal

A developer starts from Empty 2D, uses only the installed Studio and its
project-level Codex to build a small but real Tank Arena: imported sprites,
keyboard control, collision, project TypeScript, sound, UI, live play/pause/
step/reload, tests, and a standalone Windows package. The same Studio must also
create a small perspective 3D Collect Room with a camera, lit meshes, depth,
collision, input, and a standalone package.

Tank and Collect Room remain example projects. No Tank, Collectible, top-down,
or fixed-2D concept may enter the core protocol or Studio production boundary.

## Audited baseline

| Area                   | Reusable implementation                                                                            | Incomplete or placeholder boundary                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Project and AI control | Project create/open, files, schemas, semantic commands, ChangeSets, Codex sessions, MCP and Skills | Some visible settings are stored but not consumed by the services they describe                             |
| Scene authoring        | Stable objects, Components, hierarchy, Inspector mutations, Scene files                            | Central viewport draws generic DOM boxes and button-based transforms                                        |
| Runtime                | Sandboxed TypeScript hooks, fixed Tick, replay/hash, events and structured traces                  | Run is bounded execution, not a persistent playable process with continuous input                           |
| 2D                     | Shape/Text descriptors and basic native drawing                                                    | No complete texture/Sprite, physics collision, audio, camera, atlas, or asset lifecycle loop                |
| 3D                     | Transform/Camera/Mesh/Material/Light schemas and primitive proof path                              | No perspective camera, depth-tested mesh path, real light/material evaluation, or 3D physics                |
| Assets                 | Import, manifest, copy, dependency metadata, image preview                                         | Imported image/audio are not generally consumed by Player; generation uses placeholder providers            |
| IDE                    | Electron shell, Monaco, Diff, basic Git operations, Copilot, Problems and trace views              | Menus, tests, extensions, specialized editors, debugger, terminal, settings effects, and SCM remain partial |
| Release                | Windows portable directory and ZIP                                                                 | No installer/signing/updater or Web/mobile/mini-program targets                                             |

This table is the Round 04 baseline, not a claim that the reusable column is
production-complete. Each row is re-evaluated by the phase exit gates below.

## Required delivery slices

### 1. One runtime world, multiple projections

Project files remain authoritative. The script host advances one persistent
runtime world. That world publishes versioned `RenderSnapshot`, `AudioEvent`,
`DebugSnapshot`, and structured diagnostic messages. Studio Game view and the
exported Player consume the same messages and resource resolution rules.

The Scene editor may add editor-only overlays such as selection outlines,
handles, grid, and guides, but it must not maintain a second approximation of
the game's transforms, cameras, rendering, or collision state.

### 2. Persistent Play Mode

Run creates a long-lived runtime session with an explicit identity and state
machine:

```text
stopped -> starting -> playing <-> paused -> stopping -> stopped
                               |-> stepping -> paused
                               |-> reloading -> playing/paused
```

Input is timestamped against authoritative fixed Ticks. Pause keeps the same
world alive. Step advances exactly one fixed Tick. Hot reload either migrates
state under a documented compatibility rule or performs an explicit restart;
it never silently replays from Tick zero while presenting that as resume.

### 3. Complete minimum 2D capability

The minimum 2D slice includes:

- orthographic Camera2D and viewport scaling;
- textured Sprite2D with filtering, pivot, tint, layer, ordering, and atlas
  region support;
- stable keyboard/pointer input mapping;
- Collider2D and RigidBody2D backed by a replaceable physics adapter;
- collision/trigger enter, stay, and exit delivery at fixed-Tick boundaries;
- WAV/OGG playback, buses, volume, mute, loop, and one-shot events;
- Text/UI sufficient for score, start, pause, win, and lose states;
- resource import, runtime resolution, missing-reference diagnostics, and
  package inclusion based on dependency reachability.

Rapier 2D is the preferred initial physics adapter; image decoding and audio
use mature Rust libraries behind engine-owned interfaces. Their raw handles do
not cross the public project or MCP protocol.

### 4. Honest minimum 3D capability

The 3D slice includes a perspective Camera3D, depth buffer, transform hierarchy,
primitive and imported static meshes, material color/texture, one directional
light, Collider3D/RigidBody3D, picking, translation/rotation/scale gizmos, and a
playable first- or third-person input preset expressed as project files.

PBR, skeletal animation, terrain, navigation, networking, and a material graph
are explicitly outside this round. The product must label unavailable features
instead of presenting inert controls.

### 5. Effective IDE and AI settings

Every visible setting must have one of three states: effective and tested,
disabled with a reason, or absent. Persisting a value without consuming it is a
defect. This applies to autosave, locale, default Agent mode, Goal budget,
context scope, MCP/Skill enablement, capability routing, provider/model choice,
generation approval policy, credential reference, runtime, renderer, and build
settings.

Asset generation uses a provider adapter contract with health, capability,
cost estimate, configurable approval, cancellation, candidate review,
provenance, import, and secret redaction. Codex requests a media capability;
the project route selects OpenAI, Bailian, or another installed adapter, while
Electron main alone resolves credentials. The local placeholder remains
available only when visibly labelled as a test generator.

## AI participation contract

Every Round 04 capability must provide all of the following before completion:

1. Discoverable human operation in Studio.
2. Versioned and documented project files using stable semantic IDs.
3. Read/query response with current effective state.
4. Typed semantic command and structured diagnostics.
5. Engine MCP discovery and action tools generated from the same registry.
6. Engine or project Skill with examples, limits, and repair guidance.
7. Previewable ChangeSet for durable mutations.
8. Headless success, failure, migration, and determinism tests.
9. Undo or exact rollback that preserves unrelated newer work.
10. Explicit permission, secret, network, cost, and destructive-action policy.

Codex does not satisfy this contract by editing private Studio state, driving
screen coordinates, or guessing internal array indexes.

## Development phases

### P22 — Truthful baseline and executable contracts (W1)

Publish this specification, independent checklist, human observation board,
and a source-backed placeholder inventory. Define runtime-session, render-
snapshot, asset-reference, physics-event, audio-event, and preview-host
protocols before implementation. Add probes that fail while the DOM viewport,
synthetic collisions, placeholder provider, and ineffective settings remain.

Exit gate: the dashboard exposes the real baseline, every known placeholder has
an owner phase and executable failing probe, and no previous machine-only claim
is used as Round 04 completion evidence.

### P23 — Shared viewport and live Play Mode (W2–3)

Create the persistent runtime session and native preview host. Make Studio Game
view and standalone Player consume the same render/resource snapshots. Replace
DOM scene projection with an engine viewport plus editor overlays. Complete
play, pause, one Tick, stop, restart, state inspection, input routing, hot reload
policy, crash isolation, and session recovery.

Exit gate: a moving object has identical transforms and visible frames in
Studio Play Mode, headless replay, and exported Player; pause and step preserve
the same session and Tick; no production viewport renders generic DOM objects.

### P24 — Complete minimum 2D game loop (W4–5)

Deliver Sprite2D, Camera2D, texture/atlas import, 2D physics, collision and
trigger events, audio playback, minimum game UI, visual gizmos, picking, and
runtime asset packaging. Codex must be able to create, wire, run, inspect,
repair, test, and roll back each feature.

Exit gate: project-level Codex and a human independently complete the same
Tank mechanic from Empty 2D, and the packaged game is playable with sprites,
collision, sound, score, pause, restart, win, and lose states.

### P25 — Honest minimum 3D game loop (W6–7)

Replace the isometric proof with perspective/depth rendering, static mesh and
texture resources, light/material evaluation, 3D physics, camera/input, picking,
and transform gizmos. Reuse the same project, script, debug, AI, and build
contracts as 2D.

Exit gate: Collect Room is created from Empty 3D without engine changes, runs
the same in Studio and Player, and visibly proves occlusion, perspective,
lighting, collision, input, scoring, and standalone packaging.

### P26 — Complete daily IDE and provider workflows (W8–9)

Finish menu actions, test result explorer, debugger source locations and call
stack, terminal/task output, file watching, Inspector file/resource properties,
Prefab isolation, material preview, minimum animation timeline, Git commit/
history/conflict workflow, extensions/capability management, settings effects,
and one real asset-generation provider adapter.

Exit gate: a developer authors, debugs, tests, reviews source changes, generates
and approves one resource, commits, closes, reopens, and continues without
leaving Studio or encountering a visible inert control.

### P27 — Independent game completion and Preview release (W10)

Build Tank Arena and Collect Room from clean presets using only installed
Studio and project Codex. Run deterministic, replay, migration, performance,
crash, credential-leak, package-content, and clean-machine gates. Execute the
unassisted human observation protocol with a new participant and new profile.

Exit gate: the participant completes both games' prescribed modification,
debug, AI review, test, and standalone-build journeys without coaching or
external tools; no blocker remains open and all artifacts are attached.

## Required artifacts

- AI Game Studio 0.3.0 Preview Windows package and hash.
- Versioned runtime-session and projection protocols.
- Shared Studio/Player runtime-projection contract with explicit WebGL2 and wgpu
  adapters.
- Complete minimum 2D capability and example project.
- Honest minimum 3D capability and example project.
- Physics and audio adapters with deterministic boundary tests.
- Runtime asset manifest and reachability-based packager.
- Effective settings and provider-adapter conformance report.
- Engine MCP/Skills covering each delivered human operation.
- Automated evidence, human recordings, issue ledger, and retest records.
- Updated limitations document listing every intentionally deferred feature.

## Explicit non-goals

- Unity/Unreal/Godot project compatibility.
- Advanced PBR, skeletal animation, terrain, navigation, networking, consoles,
  mobile, Web, or mini-program export.
- A public marketplace or third-party native plugin ABI.
- Replacing mature rendering, physics, image, audio, or model-format libraries.
- Counting an example-specific shortcut as an engine capability.

## Round definition of done

Round 04 is complete only when both reference projects are made and modified
through installed Studio, Studio preview and standalone Player share runtime
behavior, all shipped controls are effective or explicitly unavailable, Codex
has semantic parity for every required operation, automated gates pass, and an
independent participant completes the human observation journey without
coaching. Source code, descriptors, screenshots, or machine tests alone cannot
close the round.
