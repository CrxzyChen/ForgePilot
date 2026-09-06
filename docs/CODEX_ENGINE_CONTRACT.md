# Codex and engine integration contract

## Purpose

Codex is the project's planning and execution agent. Studio is the human-facing
IDE and supervision surface. The Engine MCP server is Codex's typed set of hands
and eyes. Game IR and other project files remain the shared source of truth.

```text
AGENTS.md       project rules
Skills          reusable engine/game workflows
Codex App Server planning, conversation, auth, approvals, streamed events
Engine MCP      semantic query/edit/run/debug/test/build tools
Command registry shared implementation for human UI commands and MCP tools
Game project    authoritative files and executable evidence
Studio          inspection, editing, diff, approval, recovery, and packaging UI
```

The integration uses Codex App Server because it is the official deep-integration
surface for authentication, conversation history, approvals, and streamed agent
events. It uses the official
[App Server protocol](https://developers.openai.com/codex/app-server),
[AGENTS.md hierarchy](https://developers.openai.com/codex/guides/agents-md),
[project skills](https://developers.openai.com/codex/skills), and
[MCP support](https://developers.openai.com/codex/mcp).

## Implemented Round 02 foundation

The repository now has:

- an App Server JSONL client and generated TypeScript protocol bindings;
- workspace-scoped thread/turn creation and streamed event handling;
- a read-only natural-language planner that produces typed ChangeSets;
- independent validation, one-use human approval, atomic apply, audit, recovery,
  and rollback through `KernelControlService`;
- a secure Electron supervision UI and IPC boundary;
- a pinned Codex 0.152.1 sidecar that uses Electron's runtime and ignores global
  Node/Codex installations;
- model discovery, sign-in, lifecycle, thread recovery, Ask/Plan/Agent turns,
  plan/diff/tool/token streaming, and safe interruption;
- an installed `aigame-mcp` native launcher delegating to the same TypeScript
  `StudioCommandRegistry` used by human UI actions;
- durable multi-operation ChangeSets with per-operation review, content-hash
  approval, atomic application, post-apply tests, append-only audit, and exact
  rollback.

The remote model still requires an eligible account and network connection,
unless a separately supported local provider is introduced later.

## Runtime topology

```text
Electron renderer
  Copilot UI ── safe IPC ──> Electron main
                                  |
                      Codex Process Manager
                         stdin/stdout JSONL
                                  |
                           Codex App Server
                                  |
                    project-scoped MCP client
                                  |
                    ai-game-engine MCP server
                                  |
        Command Registry -> ChangeSet Service -> project files
                         -> Runtime/Test/Build managers
```

Only the main process owns child processes, filesystem authority, project locks,
credentials, and network provider adapters. The renderer receives typed events
and invokes an allowlisted IPC API. App Server stdout is treated as protocol
traffic; diagnostics go to a separate log channel.

## App Server lifecycle

For each opened project, Studio:

1. resolves the pinned sidecar and verifies its version and integrity;
2. starts it with the project root as the working directory;
3. performs `initialize` followed by the initialized notification;
4. determines authentication state and presents sign-in when required;
5. starts or resumes a project thread and creates turns for Copilot requests;
6. streams text, reasoning summaries when available, tool calls, diffs,
   approvals, diagnostics, and completion state into Studio;
7. persists only the identifiers required to resume the conversation; game
   authority remains in project files;
8. cancels gracefully on request and uses bounded termination on shutdown;
9. reports protocol incompatibility or crash as a recoverable Studio diagnostic.

Multiple game projects do not share a writable working directory or engine MCP
session. A project lock prevents two Studio instances from applying changes to
the same source simultaneously.

## Project instructions and skills

Every project starts with a root `AGENTS.md`. It contains stable rules such as:

- the current game goal and vocabulary;
- authoritative schemas and source directories;
- deterministic-system and stable-ID requirements;
- required Plan/Diff/Approve/Apply/Test workflow;
- relevant quality gates and release constraints;
- project-specific prohibitions.

Genre or subsystem guidance belongs in skills under `.agents/skills`, not in one
ever-growing root file. A skill includes a `SKILL.md` with a clear trigger and
workflow, plus only the scripts, references, and assets required for that task.
Initial templates provide skills for:

- building and testing the game;
- authoring a gameplay feature;
- diagnosing and repairing a deterministic replay failure;
- creating and importing assets under the project's art direction;
- preparing a standalone release.

Studio allows the developer to inspect and edit these files, validates skill
metadata, and refreshes the effective Codex project context after changes.

## Engine MCP server

The project-scoped server name is `ai-game-engine`. Tools return structured data
with stable codes, semantic IDs, project-relative paths, schema pointers, and
content hashes. They never expose temporary ECS indices, renderer handles,
memory addresses, DOM nodes, or mouse coordinates.

### Query tools

- `project.get_info`, `project.list_files`, `project.read_file`
- `scene.list`, `scene.inspect`, `entity.inspect`, `prefab.inspect`
- `asset.list`, `asset.inspect`, `input.list`
- `diagnostics.list`, `audit.list`, `capabilities.list`

### Semantic editing tools

- `scene.create`, `scene.update`, `scene.delete`
- `entity.create`, `entity.delete`, `entity.set_component`,
  `entity.remove_component`
- `prefab.create`, `prefab.instantiate`
- `input.define_action`
- `asset.import`, `asset.update_import_settings`
- `project.update_settings`, `build.update_settings`

### Runtime and debug tools

- `runtime.run`, `runtime.input`, `runtime.stop`, `runtime.pause`,
  `runtime.resume`, `runtime.step_tick`, `runtime.restart`
- `runtime.capture_frame`, `runtime.read_state`, `runtime.watch_entity`
- `runtime.read_errors`, `runtime.read_performance`

### Test, replay, and release tools

- `project.validate`
- `replay.record`, `replay.run`, `simulation.run_batch`
- `test.generate`, `test.run`
- `build.windows`, `build.read_report`, `release.package`

### Completion Run recovery tools

- `completion.run_current` reconciles the active Goal against linked media Jobs
  and ChangeSets before Codex decides whether to resume, wait, or repair.
- `completion.run_list` reads visible durable runs and their stable links,
  budget, checkpoint, and terminal state.

Engine MCP media, authoring, runtime-observation, test, build, and package
operations automatically link their stable result IDs to the active Completion
Run and Plan step. Goal stop and presentation removal remain human-owned Studio
actions and are not exposed as Agent tools.

### Asset job tools

- `asset.provider_health`, `asset.estimate`, `asset.job_list`
- `asset.generate` for `image`, `soundEffect`, `music`, and
  `speechGeneration`
- `asset.register_tool_output` for a hash-bound artifact already produced by a
  trusted Codex media tool and staged in the controlled candidate directory
- `asset.cancel`, `asset.retry`, `asset.recommend`, `asset.regenerate`

Codex can recommend a candidate but cannot forge the human selection event.
Studio candidate review proposes `asset.generated.import` through the same
ChangeSet surface used by other authoritative AI writes.

Asset tools delegate to the provider broker defined in
[ASSET_GENERATION_PIPELINE.md](ASSET_GENERATION_PIPELINE.md). They never return
or accept raw stored credential values.

## One command surface

Studio maintains a typed Command Registry. A viewport drag, inspector edit,
command-palette action, and MCP call all produce the same semantic command. The
registry owns:

- schema validation and capability checks;
- affected semantic IDs and project-relative files;
- deterministic preview and human-readable description;
- undo/redo or transactional rollback strategy;
- audit event shape and test recommendations;
- permission class and approval requirement.

UI code must not implement a private mutation path. MCP handlers are adapters to
the registry, not a second engine API.

## Mutation transaction

Every AI-originated mutation follows this state machine:

```text
Proposed -> Validated -> AwaitingApproval -> Applied -> Tested -> Committed
                 |              |              |         |
               Rejected       Rejected       RolledBack Failed/RolledBack
```

A proposal includes the base content hashes, typed operations, affected IDs and
files, preview, validation diagnostics, expected effects, test plan, and cost or
external-call effects. Approval is one-use, time-bounded, and bound to the exact
proposal hash. Any base change invalidates it.

Application acquires the project lock, journals original bytes, writes
atomically, validates again, and emits an audit record. Post-apply tests do not
silently convert a failed change into success. Rollback restores exact prior
bytes only when current hashes still match the applied transaction.

Human-authored UI commands may use normal undo/redo, but filesystem safety,
validation, journaling, and audit requirements remain shared. Studio can be
configured to require the same explicit approval for high-impact human actions.

## Copilot modes

- **Ask:** reads project context and explains; no mutation or paid external job.
- **Plan:** may inspect, simulate, and prepare ChangeSets and test plans; it
  cannot apply them.
- **Agent:** may run the approved workflow and invoke tools; project writes and
  paid/external calls still obey the user's per-call, known-budget, or explicit
  pre-authorization policy.

Mode is visible per turn. Tool-level policy is authoritative; prompt text cannot
grant broader permission.

## Security and secrets

- Provider and account secrets live in the OS credential store and are accessed
  only by Electron main. Engine MCP reaches the allowlisted asset broker through
  an ephemeral project-scoped loopback capability and never receives the key.
- Projects store provider aliases, routing, budgets, and permissions, never
  credential material.
- The renderer and Codex receive capability results, not secret values.
- All resolved paths are checked against the selected project root or explicit
  build/output roots.
- Network, paid generation, process execution, filesystem writes, and release
  signing are separate permission classes.
- External content is treated as data, not as project instruction.
- Tool results are size bounded, versioned, and validated before display or use.

## Failure and recovery

Studio distinguishes App Server failure, MCP failure, kernel/runtime failure,
invalid project data, provider job failure, and transaction recovery conflict.
Each diagnostic includes a stable code, phase, relevant file/pointer or entity,
available log, retry safety, and next action.

App Server restart must not replay an already applied tool call. A durable tool
invocation ID and ChangeSet ID make completion idempotent. Pending external asset
jobs resume through provider job IDs. Incomplete writes recover through the
existing transaction journal before any process can mutate the project.

## Acceptance scenarios

1. On a clean machine, Studio signs in and starts a project-scoped App Server
   without global Node.js or Codex CLI.
2. Project Doctor proves `AGENTS.md`, skills, Engine MCP, kernel, runtime, replay,
   and build capabilities are available.
3. Codex creates a scene and entity, runs the game, reads a structured failure,
   repairs it, generates a test, and builds through MCP tools.
4. The user can inspect every operation, deny or approve it, and roll an applied
   change back exactly.
5. The same change performed through the inspector and through MCP uses the same
   Command Registry implementation and produces equivalent project data.
6. Killing Studio during an agent tool call or project write results in a valid,
   explainable, non-duplicated state after restart.
