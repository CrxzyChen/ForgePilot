# Round 05: Copilot-Driven Game Completion

- Status: Owner-accepted and closed on 2026-09-06. P33 independent Journeys
  A–E deferred / NOT_RUN; see the owner closure amendment below.
- Target release: AI Game Studio 0.4.0 Copilot Preview
- Depends on: Round 04 machine-qualified runtime, authoring, provider, and
  packaging paths
- Delivery horizon: 9 weeks for one human developer working with AI
- Operational checklist: `docs/rounds/ROUND-05-CHECKLIST.md`
- Human observation board: `docs/testing/ROUND-05-HUMAN-OBSERVATION.md`
- Accepted authority decision:
  `docs/architecture/0024-round05-completion-authority.md`
- Gap/evidence ownership map: `docs/rounds/ROUND-05-GAP-MAP.md`

## Why this round exists

Round 04 established the individual parts of a real game-development loop:
Sprite2D, audio playback, physics, UI, project TypeScript, persistent Play Mode,
Engine MCP authoring commands, provider-neutral generation jobs, ChangeSets,
tests, Replay, and Windows packaging. It did not prove that project Codex can
coordinate those parts into a finished game from one product-level goal.

The P28 baseline Tank project is logically playable but its asset manifest is empty
and its visual presentation still relies on colored shapes. Image and speech
generation could reach real providers, but game sound and reviewed import were
incomplete. P29 now supplies explicit image, sound-effect, music, and speech
jobs, production image/game-audio adapters, inspectable candidates, human review,
and transactional ChangeSet import. Visual runtime verification and resumable
long-running completion remain owned by P30–P32.

Round 05 closes that orchestration gap. It does not create a separate AI-only
engine path. Codex must use the same stable project files, semantic commands,
runtime, diagnostics, approval gates, and build service as a human using Studio.

Round 04 independent human exits remain open. Round 05 development may start
from the machine-qualified baseline, but the 0.4.0 release cannot inherit an
unverified claim. Its stricter observation journey must cover or supersede every
Round 04 user-facing dependency used by the canonical completion run.

## Product goal

A developer opens the existing shape-based Tank project and gives Studio
Copilot one high-level goal:

> Upgrade this playable placeholder Tank project into a coherent, polished,
> standalone 2D game. Establish the art direction, generate and review the
> required assets, replace placeholder shapes, complete the menu/HUD/feedback,
> verify gameplay and visuals, fix failures, and build the Windows release.

Project Codex establishes a durable Goal and Plan, audits the project, creates
asset briefs, invokes configured generation capabilities, waits at the required
human gates, imports selected candidates, edits scenes/prefabs/scripts through
ChangeSets, runs and visually inspects the game, executes tests and Replay,
repairs failures, and produces a standalone package.

The human remains responsible for product intent, paid-call authorization,
subjective candidate choice, and ChangeSet approval. Those gates are part of the
workflow, not evidence that the AI path failed.

## Definition of the completed Tank game

The canonical Round 05 output is intentionally small but complete:

- one coherent top-down visual language recorded in a project art-direction
  Skill;
- distinct player, enemy, projectile, solid wall, destructible wall, ground,
  and impact/explosion presentation using imported resources rather than debug
  shapes;
- readable menu, controls/help, HUD, pause, win, lose, and restart states;
- firing, hit, destruction, UI, and match feedback with functional volume and
  mute behavior;
- existing movement, combat, enemy behavior, collision, score, and deterministic
  outcome preserved or deliberately improved with tests;
- no missing resource, script, collision, or package-content diagnostic;
- matching required behavior in Studio Play Mode and the standalone Windows
  player;
- Development and Release packages that start without Studio, Node.js, Codex,
  provider credentials, or network access.

This is a release-ready small game vertical slice, not a claim of commercial
content scale, store certification, or an extensible campaign.

## Audited starting boundary

| Area                    | Reusable starting point                                                                                                   | Round 05 gap                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Copilot connection      | Project Codex receives the authenticated `ai-game-engine` MCP server and project Skills                                   | No canonical long Goal has completed the full provider-to-package path                                                    |
| Asset generation        | Provider-neutral estimate, generate, list, cancel, retry, select; real OpenAI/Bailian image and Bailian TTS adapters      | Sound-effect/music execution, rich candidate inspection, and end-to-end approval recovery remain incomplete               |
| Credentials and routing | Named write-only credentials, provider API model discovery, per-capability project routes, main-process secret resolution | Agent-facing diagnostics must make an invalid route actionable without exposing secrets                                   |
| Asset lifecycle         | Stable asset manifest, runtime resource validation, Sprite2D and audio consumption                                        | Candidate import currently needs a stricter human-review and ChangeSet transaction boundary plus derived-asset provenance |
| Authoring               | Scene, object, Component, Prefab, resource, project text, input, collision, and capability tools                          | Codex has not yet transformed all placeholder render components and UI as one audited operation graph                     |
| Runtime feedback        | Run, pause, input, state, performance, trace, hot reload, tests, and Replay                                               | Codex needs addressable frame/audio/diagnostic evidence instead of inferring visual success from state alone              |
| Goal execution          | Goal/Plan status, tool-call transcript, stop controls, project-scoped conversations                                       | Long-running generation and review waits are not yet proven resumable and idempotent across Studio restart                |
| Release                 | Shared Studio/Player runtime and Windows build/package services                                                           | No generated-asset Tank package has passed a clean-machine Copilot completion observation                                 |

An interface, descriptor, model choice, or successful mock does not close a row.
Each row requires production execution, failure evidence, recovery, audit, and a
human-observed outcome.

## Canonical authority and control boundaries

### Project authority

Game IR, project TypeScript, resource manifests, asset briefs, art-direction
Skills, tests, and build profiles remain the durable source of truth. Runtime
handles, renderer resources, temporary candidates, Copilot transcript state,
and editor selections are derived or local state.

The completed project must remain understandable and buildable after the
conversation is removed. No essential game rule or resource mapping may exist
only in natural-language chat history.

### Agent authority

Codex may:

- read project structure, dependencies, references, diagnostics, runtime state,
  frames, tests, Replay, build reports, and asset-job state;
- establish and update a visible Goal and Plan;
- propose semantic game changes and project text changes as ChangeSets;
- request configured media capabilities without receiving provider secrets;
- cancel or retry its own addressable jobs under the configured policy;
- recommend one or more candidates and explain the evidence behind that choice;
- continue after an approved call, selected candidate, applied ChangeSet, or
  restored Studio session.

Codex may not:

- drive Studio through screen coordinates or DOM automation;
- call a provider directly or read/decrypt credentials;
- change global credential, network, outbound-data, cost, or approval policy;
- convert per-call approval into implicit consent;
- import a candidate before the required human review is recorded;
- bypass ChangeSet preview, validation, audit, or rollback for durable writes;
- claim visual/audio quality from file existence or a successful HTTP response;
- duplicate a paid request because a process, conversation, or Studio restarted.

### Human gates

Round 05 recognizes three distinct approvals:

1. **Provider execution** — authorizes a potentially paid outbound request under
   per-call, known-budget, or explicit pre-authorization policy.
2. **Candidate selection** — records the human-reviewed candidate that may enter
   the project. Codex may recommend; the policy decides whether explicit human
   selection is required.
3. **Project mutation** — applies a validated ChangeSet to authoritative project
   files with audit and rollback.

The UI and MCP response must identify which gate is waiting, what will happen,
its job/ChangeSet ID, provider/model, known or unknown cost state, and how to
continue or cancel.

## Required delivery slices

### 1. Game-completion Goal protocol

Define a durable, project-scoped completion run with stable IDs for Goal, Plan
step, tool call, generation job, candidate, approval, ChangeSet, runtime
session, test run, Replay, build, and package. Each step has an explicit state:

```text
pending -> running -> waiting_for_human -> completed
                    -> retryable_failure -> running
                    -> cancelled
                    -> terminal_failure
```

Studio restart, Codex restart, provider timeout, rejected candidate, failed
ChangeSet, or runtime crash must not erase the reason for the wait or repeat a
completed side effect. Resume reconciles durable state before issuing new work.

### 2. Agent-native media production

Replace the ambiguous `audio` generation kind with explicit capability routes
while retaining a documented migration alias:

- `image`;
- `soundEffect`;
- `music`;
- `speechGeneration`.

Video and speech recognition may remain configurable but are not required by
the Tank exit gate. Every delivered capability provides provider/model health,
parameter schema, cost/unknown-cost state, idempotency key, progress,
cancellation, retry classification, candidates, and provenance.

Copilot must receive inspectable candidate artifacts. Images have renderable
previews and dimensions; audio has playable output, duration, codec, waveform
or equivalent comparison metadata. Candidate identity never depends on array
position. Rejection and regeneration preserve the brief and prior audit trail.

### 3. Transactional import and resource wiring

A selected candidate enters the project through a previewable resource import
ChangeSet. The transaction includes:

- destination path and stable Asset ID;
- content hash and provider/model/job/candidate provenance;
- prompt/brief and art-direction Skill version hashes without secret content;
- import settings, transformations, atlas regions, and derived hashes;
- Scene/Prefab/Component references that replace the chosen placeholders;
- build reachability and license/restriction metadata;
- exact rollback that removes only transaction-owned writes and references.

Partial import is failure. A crash cannot leave a manifest entry without the
file or a file without its corresponding reviewed transaction.

### 4. Codex-observable game quality

Add semantic runtime evidence sufficient for Codex to verify presentation:

- capture one addressable frame from Scene or Game view at a known session,
  generation, scene, Tick, camera, and viewport size;
- return the frame as an inspectable artifact with a content hash;
- expose resolved drawables, missing/fallback textures, ordering, UI bounds,
  audio events, clipping, and runtime diagnostics;
- support deterministic scripted input to reach menu, play, pause, win, and lose
  checkpoints;
- compare required frame invariants without treating a pixel snapshot as game
  authority.

Codex uses these observations to identify invisible sprites, bad pivots, broken
references, unreadable UI, missing feedback, and Studio/Player divergence.
Subjective final art acceptance remains human-owned.

### 5. Tank transformation workflow

The project art-direction Skill defines palette, perspective, scale, silhouette,
lighting, outline, transparency, atlas, UI, and prohibited-style rules. Codex
derives a versioned asset brief and coverage plan before generating anything.

The canonical transformation must:

1. inventory every placeholder and required feedback state;
2. reuse existing suitable resources before requesting paid work;
3. batch compatible requests without making unrelated variants indistinguishable;
4. import reviewed assets and convert Shape2D/UI placeholders to resource-backed
   components;
5. preserve collider and gameplay semantics when changing presentation;
6. complete menu/HUD/help/pause/win/lose/restart presentation;
7. add and route sound effects/music appropriate to the declared scope;
8. run visual checkpoints, gameplay tests, Replay, resource diagnostics, and
   package inspection;
9. repair failures through new reviewable ChangeSets;
10. produce final build reports and a standalone package.

Tank-specific names remain project content. No tank, weapon, arena, or
top-down-game concept may enter the engine protocol.

### 6. Copilot execution surface

The Copilot panel must show the active Goal, ordered Plan, current step, tool
calls, waits, job progress, cost state, candidate review request, ChangeSet,
test/build result, and resumable failure. The user can stop execution without
deleting evidence and can separately remove a completed/cancelled Goal.

Attachments may become project briefs or references only through an explicit
project operation. The transcript must not turn a pasted image or arbitrary
host path into an undeclared project dependency.

## Development phases

### P28 — Completion contract and truthful baseline (W1)

Publish this specification, the independent checklist, the human observation
board, and executable contract checks. Record the current Tank asset/resource
baseline, current MCP generation surface, implemented adapters, direct-import
boundary, visual-observation boundary, and Goal recovery boundary.

P28 freezes the machine-readable contracts in
`schemas/completion-run.schema.json`,
`schemas/media-generation-job.schema.json`,
`schemas/generated-asset-review.schema.json`,
`schemas/generated-resource-import.schema.json`, and
`schemas/runtime-observation.schema.json`. Architecture decision 0024 separates
provider authorization, candidate review, and ChangeSet approval, while the gap
map assigns every audited starting limitation to an owner phase, failing probe,
evidence artifact, and human journey.

Exit gate: every required Round 05 outcome has a named owner phase, machine
probe, human journey, and evidence location; the dashboard does not infer
completion from Round 04 tools or mock-provider success.

### P29 — Agent-native media jobs and reviewed import (W2–3)

Deliver explicit image, sound-effect, music, and speech-generation capability
contracts required by the game. Add candidate artifact inspection, progress,
idempotency, policy-aware approval, failure classification, rejection,
regeneration, and transactional ChangeSet import. Keep secrets in Electron main
and make dynamic model compatibility executable rather than label-based.

Exit gate: project Codex requests an image and sound effect by capability only,
waits at the configured gates, presents comparable candidates, imports the
human selection through a ChangeSet, rolls it back, resumes, and does not expose
or duplicate provider work.

Machine status: `check:p29:media`, `check:p29:import`, `check:p29:agent`, the
Studio UI contract, and the real Electron quality gate pass. The phase remains
open until Journey B records a real person's paid-call approval, candidate
comparison, selection, ChangeSet review, and rollback without coaching.

### P30 — Visual runtime observation and repair loop (W4–5)

Expose addressable frame capture, resolved drawable/resource evidence, audio
events, scripted checkpoint navigation, and Studio/Player comparison through
Engine MCP and project Skills. Make diagnostics actionable back to stable Scene,
object, Component, asset, script, and Tick IDs.

Exit gate: Codex detects and repairs deliberately broken texture, pivot/layer,
UI-bound, audio-reference, and packaged-resource cases using only structured
tools, with visual/runtime evidence before and after each repair.

Machine status: `npm run check:p30` passes. Engine MCP, the project repair and
build Skills, native Player frame capture, semantic diagnostics/ChangeSets,
Studio/Player comparison, and the real Electron observation panel are wired.
The seeded machine run covers menu/play/pause/win/lose/restart and the specified
visual, UI, audio and package-resource failures. Independent Codex reasoning and
human comprehension remain open and are not inferred from this gate.

### P31 — Copilot-completed Tank game (W6–7)

Run the canonical Goal against the existing shape-based Tank project. Establish
art direction, produce and import the asset set, replace placeholders, polish
menu/HUD/feedback, preserve deterministic gameplay, and build Development and
Release packages. Record every human gate and every AI operation.

Exit gate: the finished project meets the completed-game definition, contains
no required debug-shape presentation, passes gameplay/resource/visual/audio/
Replay/package gates, and runs independently with matching Studio behavior.

Foundation status: `check:p31:foundation` passes. The machine fixture has a
versioned art-direction Skill, placeholder inventory, sixteen briefs, nine
controlled visual candidates, six reusable Prefabs, deterministic Prefab
runtime instantiation, destructible-wall feedback, and effective help/mute/
volume actions. The candidates remain outside project authority pending human
selection; audio production, reviewed imports, final presentation, package
evidence, and human play acceptance remain open at that fixture checkpoint.
The later supervised actual Tank run has nine provenance-backed images imported
and integrated; all nine hashes were reverified on 2026-09-06. Its applied
direction repair passes 18 actual-project tests / 127 assertions. UI refinement,
formal audio, new-revision recordings/packages and independent acceptance remain
open. Do not confuse the original fixture checkpoint with this actual run;
`docs/testing/P31-SUPERVISED-TANK-PROGRESS.md` retains their separate evidence.

### P32 — Durable Goal recovery, budgets, and quality gates (W8)

Interrupt the completion Goal during provider execution, approval wait,
candidate review, ChangeSet review, runtime execution, and build. Reopen Studio
and reconcile each state without duplicate billing or lost audit. Add bounded
retry/backoff, budget accounting, stop/cancel, rollback, and clean-profile
security/package gates.

Exit gate: every interruption point resumes or terminates honestly from durable
state; no paid idempotency key executes twice; stop does not delete evidence;
credentials never enter project, transcript, logs, Git, or packages.

### P33 — Independent Copilot completion and 0.4.0 Preview (W9)

Give a clean-profile participant only the installed Studio, the existing
placeholder Tank project, the canonical high-level task, provider test budget,
and observation instructions. Do not provide the engine checkout, terminal,
external IDE, direct JSON edits, DOM/screen automation, or verbal coaching.

Exit gate: the participant completes the entire provider-to-package journey,
all required human decisions are clear, no forbidden workaround occurs, no
blocker remains, and the signed artifacts, hashes, costs, recordings, audit,
project, and packages pass the evidence validator.

## Required artifacts

- Round 05 completion-run, media-job, candidate-review, frame-capture, and
  transactional-import schemas.
- Engine MCP tools and project Skills for every canonical Goal step.
- Provider-adapter conformance fixtures for image, sound effect, music, and
  speech generation used by the delivered game.
- Versioned Tank art-direction Skill, asset briefs, generated/imported resource
  provenance, and completed project.
- Automated success, failure, cancellation, idempotency, resume, rollback,
  visual, audio, Replay, security, and package evidence.
- Independent human observation record with issue ledger and clean-profile
  blocker retests.
- AI Game Studio 0.4.0 Copilot Preview Windows package, completed Tank
  Development/Release packages, and SHA-256 hashes.
- Updated limitations document naming every intentionally deferred capability.

## Explicit non-goals

- Generating or shipping a large campaign, multiplayer, backend service,
  monetization, store listing, or live operations.
- 3D character/model generation, skeletal animation, cinematic video, lip sync,
  or procedural world generation.
- Requiring video generation or speech recognition for the Tank exit gate.
- Removing human control of paid calls, candidate acceptance, or authoritative
  project mutations.
- Giving Codex provider credentials, a hidden direct-write route, renderer
  handles, or an automation-only Studio API.
- Treating generated media as automatically licensed or commercially safe.
- Claiming general game-completion quality from the one Tank reference project.

## Round definition of done

Round 05 is complete only when an independent participant can express the
canonical high-level goal inside installed Studio and project Codex carries it
through audited planning, provider-backed generation, human review,
transactional project mutation, runtime/visual inspection, tests, repair,
Replay, build, and standalone package without screen automation, external
development tools, secret exposure, duplicate billing, or undocumented manual
file repair.

The resulting Tank game must satisfy the completed-game definition in both
Studio and Player. Machine tests, attractive screenshots, generated files, a
successful provider response, or a developer-guided demonstration cannot close
the round without the signed human observation and durable evidence.

# Owner closure amendment — 2026-09-06

The product owner accepted the current R5 delivery and confirmed closing the
round with independent P33 acceptance deferred. `ROUND-05-ACCEPTANCE.json`
records the scoped decision. P33 journeys remain NOT_RUN; the original protocol
below remains the specification for a future independent study, not a blocker
on the owner-approved R5 closure. Do not reinterpret this as proof of unassisted
completion, clean-machine play, or public release qualification.
