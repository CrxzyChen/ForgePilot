# Round 03: General AI Game Studio Alpha

- Status: Validation (P14-P20 machine implementation complete; independent unassisted human Gate open)
- Target release: AI Game Studio 0.2.0 Alpha
- Depends on: P0-P13 technical prototype
- Delivery horizon: 12 weeks for one human developer working with AI
- Operational checklist: `docs/rounds/ROUND-03-CHECKLIST.md`

## Why this round exists

P0-P13 proved a deterministic Rust runtime, file-based Game IR, managed Codex
App Server, Engine MCP, transactional ChangeSets, a Tank Arena dogfood project,
and a standalone Windows package. It did not prove that a developer can use the
Studio as a general game IDE. The shipped Workbench exposes a Tank- and
tile-oriented test surface, has no complete scene workflow, no project-authored
behavior runtime, no real source editor, and no independent human usability
gate.

Round 03 treats P0-P13 as a technical prototype, preserves the useful backend
contracts, and rebuilds the authoring product around real game-development
workflows.

## Product goal

A developer who has never seen the engine installs only Studio, creates an
Empty project, and—without opening the engine repository or another IDE—builds,
debugs, tests, and exports both a small 2D game and a small 3D game. Project
TypeScript defines behavior, lifecycle, Systems, Commands, and Events. Codex can
participate in every step through the same files, semantic commands,
diagnostics, tests, and build services used by the human interface.

Round 03 is complete only when an unassisted developer passes the user journey.
Passing implementation-specific unit tests is necessary but not sufficient.

## Implemented Alpha baseline

The `0.2.0-alpha.1` candidate now contains the general Electron Workbench,
Scene 2.0 authoring, Monaco project editor/language service, sandboxed project
TypeScript runtime, typed Systems/Commands/Events, minimum 2D/3D capability
descriptors, Engine MCP/Skills, generic wgpu player, and player-only Windows
Release builder. Pong 2D, Collect Room 3D, and Tank Arena are ordinary projects
generated from Empty presets; the former P0-P13 Game IR/Tank implementation is
quarantined under `examples/tank-legacy-regression/`.

P20 machine evidence, installed lifecycle checks, documentation, and remaining
limitations are linked from the execution checklist. The 3D Alpha player uses
an isometric primitive projection and does not claim a complete perspective/PBR
renderer. No phase is marked product-complete until the clean-profile,
unassisted participant protocol passes.

## Non-negotiable product boundaries

1. Studio is not a 2D product. 2D and 3D are capability modules loaded by a
   general project and scene model.
2. Tank Arena is an example and regression fixture. It is not a project type,
   startup choice, core schema vocabulary, or hard-coded editor mode.
3. The central surface is a multi-document workspace. Scene design is one
   document type beside Game, Code, Prefab, UI, Material, Diff, and Build
   Report.
4. Project files are authoritative, portable, inspectable, versionable, and
   editable from Studio. Opaque editor state cannot become gameplay authority.
5. AI is a complete second operator, not a chat widget. Every human authoring
   capability must have a machine-readable query, semantic command, validation,
   ChangeSet path, test path, and rollback path.
6. AI never needs to click Studio DOM or infer screen coordinates. Human UI,
   Codex, project scripts, migration tools, and automation share one command
   registry.
7. Global settings, versioned project settings, and secrets are different
   scopes. Secrets remain in the operating-system credential store.

## Definition of AI parity

A feature is incomplete until all of these statements are true:

- A human can discover and perform it in Studio.
- Codex can discover and perform it through Engine MCP.
- Its durable result is represented by documented project files.
- Input and output schemas use stable semantic IDs rather than UI coordinates
  or renderer handles.
- Diagnostics are structured and identify project path, object, component,
  script location, Tick, or System when applicable.
- A mutation produces a previewable ChangeSet and exact audit record.
- The result can be tested without opening the editor UI.
- The operation can be undone or rolled back without losing newer work.
- The project Skill explains when and how Codex should use the capability.

No phase may count a UI-only or AI-only operation as delivered.

## Product information architecture

### Frameless desktop shell

The Electron window uses a custom title bar with minimize, maximize/restore,
close, drag, double-click maximize, Windows resize, and snap behavior. Closing
handles unsaved documents, running games, builds, and Agent turns explicitly.

```text
Custom title bar: project | document | run controls | window controls
Activity bar + left side panel | central documents | right contextual panel
Bottom panel: Console | Problems | Tests | Profiler | Event Timeline
Status bar: source control | target | runtime | background jobs | Codex
```

### Left side panel

The activity bar switches Explorer, Search, Source Control, Assets, Tests,
Build, Extensions, and Settings. Explorer contains two independently resizable
and collapsible trees:

- Scene Outline: objects in the active Scene or Prefab.
- Project Files: folders and files on disk, including Git/diagnostic/AI status.

The project tree supports create, rename, move, duplicate, trash, drag/drop,
context menus, reveal, multi-select, file-type icons, error badges, and AI
activity indicators.

### Central document workspace

Central tabs open Project Overview, Scene 2D, Scene 3D, Game preview, source
files, Prefabs, UI documents, Materials/Shaders, animation documents,
ChangeSet/Diff, and Build Reports. Opening a file selects the appropriate editor;
no scene is assumed. Layout and open documents survive restart.

### Right contextual panel

Inspector and Copilot share the right dock and switch from a visible menu.
Inspector follows the selected project, scene, object, component, resource, or
script. Copilot shows login when unauthenticated and, after login, provides
conversation history above a persistent composer.

The composer supports text, files, selected objects, scenes, resources, logs,
screenshots, replays, and build reports as removable attachments. It exposes
model, reasoning effort, Ask/Plan/Agent/Goal mode, Plan visibility, permissions,
context scope, stop, retry, and additional Agent settings.

### Settings

Studio settings cover appearance, language, editor, shortcuts, layout, default
paths, autosave, updates, logging, privacy, runtime, rendering, asset import,
build platforms, Git, debugging, plugins, and experimental capabilities.

Agent settings cover models, reasoning, default mode, Goal and Plan behavior,
context, instructions, permissions, approvals, shell/network access, budgets,
and audit retention. AI Tools manages MCP servers, Skills, generation providers,
health checks, capability discovery, and credential references.

## General project model

Core production code understands projects, Scenes, objects, Components,
resources, Prefabs, Commands, Events, Systems, snapshots, and builds. It does
not understand Tank, Bullet, Brick, Pong, Collectible, or another game's domain
vocabulary.

```text
Project
├─ capabilities/     # enabled 2D, 3D, UI, physics, audio, and extensions
├─ scenes/           # Scene documents and composition
├─ prefabs/          # reusable object graphs
├─ scripts/
│  ├─ behaviors/     # object-level convenience lifecycle
│  ├─ systems/       # query-based deterministic project logic
│  └─ events/        # typed project Commands and Events
├─ assets/           # imported source and derived runtime artifacts
├─ settings/         # versioned project settings
├─ tests/            # unit, Scene, replay, and performance tests
├─ AGENTS.md
└─ .agents/skills/   # project-local Codex operating guidance
```

The Empty project is the primary start path. Empty 2D and Empty 3D are thin
capability presets, not game genres. Examples are opened or copied from a
separate Examples surface.

## Project-authored behavior runtime

TypeScript is the first project scripting language. The engine executes
validated project bundles through a sandboxed, versioned host API. The exact
embedding implementation is selected by an ADR and determinism spike before
production integration.

Object behavior offers approachable lifecycle hooks:

```text
onStart → onEnable → onFixedUpdate / onFrame / onInput / onEvent
        → onCollisionEnter / onCollisionExit → onDisable → onDestroy
```

- `onFixedUpdate` may mutate authoritative state at a fixed Tick rate.
- `onFrame` is presentation-only and cannot mutate authoritative simulation
  state.
- Systems process stable-ID-ordered queries and are preferred for large entity
  sets.
- Commands represent requested actions; Events are immutable facts emitted by
  execution.
- Event delivery is queued, typed, ordered, non-reentrant, traceable, and
  replayable.

The default deterministic schedule is explicit in project metadata and exposes
phases for input, pre-update, fixed update, physics, collision delivery,
gameplay event delivery, post-update, snapshot, and presentation projection.
Changing schedule order is a reviewable project mutation.

## Capability modules

Round 03 establishes a neutral core and two minimum rendering paths:

- 2D: Transform2D, orthographic Camera2D, Sprite/shape rendering, picking, and
  minimum Collider2D integration.
- 3D: Transform3D, perspective Camera3D, primitive Mesh, Material/color,
  directional light, picking, and minimum Collider3D integration.

2D and 3D Components register their schemas, inspectors, gizmos, render
adapters, runtime adapters, MCP descriptions, Skills, and tests through the
same capability registry. Advanced PBR, skeletal animation, production physics,
terrain, navigation, networking, mobile/Web export, and marketplaces are not
Round 03 requirements.

## Development phases

### P14 — Product rebaseline and contracts (W1)

Inventory every Tank/2D assumption, freeze core/capability/demo boundaries,
define the independent human task, select the script-host architecture, and
replace implementation-derived gates with user-journey gates.

Exit gate: each current feature is classified as reusable core, capability,
demo-only, replace, or remove; Round 03 contracts and baseline user test are
reviewable and versioned.

### P15 — Desktop shell and project experience (W2-3)

Build the frameless window, project manager, activity bar, resizable docks,
central document tabs, contextual right panel, bottom tools, status bar,
settings scopes, onboarding, and workspace restoration.

Exit gate: an unassisted user creates, opens, navigates, configures, closes, and
reopens an Empty project and can explain the purpose of every visible region.

### P16 — Source editor and project language service (W4-5)

Deliver a production source editor for TypeScript, JSON, WGSL, and text with
tabs, search, diagnostics, completion, definition/reference navigation,
formatting, save/conflict handling, Git state, and inline AI Diff.

Exit gate: the user creates and repairs a multi-file TypeScript feature entirely
inside Studio; an error jumps to the correct file and line.

### P17 — General Scene, object, Component, resource, and Prefab authoring (W6-7)

Remove fixed entry-Scene and Tank/tile assumptions. Implement multi-Scene
create/switch/duplicate/delete, object hierarchy, generic Component registry,
schema Inspector, Prefab workflow, assets, Scene/Game separation, and 2D/3D/UI
document routing.

Exit gate: a project creates and switches multiple Scenes, composes a Prefab,
adds a project-defined Component, reloads identically, and contains no
game-specific production vocabulary.

### P18 — Script lifecycle, Systems, Events, and debugging (W8-9)

Implement the sandboxed TypeScript host, fixed/frame boundary, typed Commands
and Events, project Systems, deterministic scheduling, script diagnostics,
state inspection, break/pause/step, Event Timeline, and replay integration.

Exit gate: project code implements one per-Tick behavior and one custom Event
producer/consumer; a failing replay is diagnosed to Tick, System, object, file,
and line.

### P19 — 2D/3D capabilities and complete AI parity (W10-11)

Register minimum 2D and 3D authoring/runtime capabilities. Generate or expose
MCP discovery and semantic tools from the same registries. Complete Copilot
login, conversations, attachments, model/mode controls, Goals, Plans, settings,
approvals, and recovery.

Exit gate: the human UI and Codex independently perform the same Scene, object,
Component, script, resource, run, debug, test, and build tasks with equivalent
durable project results.

### P20 — Independent user validation and Alpha release (W12)

Build 2D Pong and 3D Collect Room from Empty projects without engine changes.
Keep Tank Arena only as a regression example. Run clean-install, no-external-IDE,
AI parity, deterministic, performance, crash recovery, migration, and standalone
Windows release gates.

Exit gate: a new developer completes the canonical journey without coaching,
using only the installed Studio, and exports independent 2D and 3D player
packages.

## Required release artifacts

- AI Game Studio 0.2.0 Alpha Windows package.
- Empty, Empty 2D, and Empty 3D project presets.
- Versioned TypeScript Game SDK and generated project types.
- General engine capability registry and extension contract.
- 2D Pong project and standalone Windows player package.
- 3D Collect Room project and standalone Windows player package.
- Tank Arena regression project and standalone Windows player package.
- Engine MCP server and engine/project Skills covering every delivered action.
- Round 03 architecture decisions, user guide, API reference, migration guide,
  test evidence, human-task recording, and remaining-gap ledger.

## Canonical human acceptance journey

The evaluator receives only the installed Studio and written task, with no
engine checkout and no coaching. They must:

1. Create an Empty project and enable a capability.
2. Create, rename, switch, save, close, and reopen two Scenes.
3. Add objects, parent them, attach built-in and custom Components, and create a
   Prefab.
4. Write a TypeScript `onFixedUpdate` behavior and handle a custom Event.
5. Run Scene and Game views, pause, step, inspect state, and locate an injected
   script error.
6. Log in to Codex, attach current context, switch model/mode, create a Plan or
   Goal, and approve a multi-file ChangeSet.
7. Ask Codex to add a feature, generate its test, diagnose a failure, repair it,
   and demonstrate rollback without using UI automation.
8. Build a standalone Windows package and run it without Studio or development
   tools.

The journey is recorded. Every hesitation, missing affordance, unexplained term,
external escape, and manual workaround enters the gap ledger. A blocking gap
fails the phase regardless of machine-test status.

## Round definition of done

Round 03 is complete when the canonical human journey passes for both a 2D and
a 3D project; Tank Arena passes only as regression evidence; no Tank or fixed
2D vocabulary remains in production core/Studio paths; AI parity is proven for
every delivered authoring action; and the resulting player packages run without
Studio, Codex, Node.js, Rust, source files, tests, credentials, or engine
checkout.
