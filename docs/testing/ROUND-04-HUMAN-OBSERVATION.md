# Round 04 human observation board

- Product: AI Game Studio 0.3.0 Preview
- Protocol status: Release candidate ready for independent execution
- Latest independent run: Not started
- Latest internal observation: 2026-09-04 product-owner pass and complete gate
  sweep found delayed Scene transforms, rejected Game input, a creation-anchored
  script deadline, an incomplete Empty 3D input template, and ineffective
  browser-native text prompts behind `+ 对象`, incomplete document-tab close
  affordances, oversized title-menu typography, and incomplete/high-latency
  Scene navigation, collapsed source/Inspector styling, missing TypeScript
  token colors, browser-default Source Control surfaces, and oversized
  Inspector file metadata, generation typography/native buttons, and native
  test/debug/capability/conflict/credential/approval controls, plus a right-dock
  separator drawn 4px inside the dock that let internal rules cross it; all have
  machine-verified fixes awaiting clean-profile human retest where applicable
- Release decision: Not eligible — all machine gates pass, but independent
  human acceptance has not started
- Development source: `docs/rounds/ROUND-04-REAL-GAME-AUTHORING.md`
- Checklist source: `docs/rounds/ROUND-04-CHECKLIST.md`

This is the human-readable observation source of truth. Automated UI scripts,
unit tests, screenshots, and developer demonstrations may provide supporting
evidence, but they do not fill participant-result fields or close an unassisted
human gate.

## Current observation dashboard

| Journey                           | Build                | Participant  | Status                                                     | Blockers | Major | Minor | Evidence                           |
| --------------------------------- | -------------------- | ------------ | ---------------------------------------------------------- | -------: | ----: | ----: | ---------------------------------- |
| P22 baseline comprehension        | development checkout | project team | machine baseline passed; downstream human retests assigned |        — |     — |     — | `P22-ROUND04-BASELINE-EVIDENCE.md` |
| P23 workspace and live Play Mode  | 0.3.0-preview.1 ZIP  | not assigned | machine gate passed; Journey A remains unobserved          |        — |     — |     — | `P23-RUNTIME-VIEWPORT-EVIDENCE.md` |
| P24 Empty 2D to Tank mechanic     | 0.3.0-preview.1 ZIP  | not assigned | machine gate passed; Journey B remains unobserved          |        — |     — |     — | `P24-COMPLETE-2D-EVIDENCE.md`      |
| P25 Empty 3D to Collect Room      | 0.3.0-preview.1 ZIP  | not assigned | machine gate passed; Journey C remains unobserved          |        — |     — |     — | `P25-HONEST-3D-EVIDENCE.md`        |
| P26 daily IDE/provider workflow   | 0.3.0-preview.1 ZIP  | not assigned | machine gate passed; Journey D remains unobserved          |        — |     — |     — | `P26-DAILY-WORKFLOW-EVIDENCE.md`   |
| P27 clean-install release journey | 0.3.0-preview.1 ZIP  | not assigned | machine-qualified candidate; human journey not started     |        — |     — |     — | `P27-PREVIEW-RELEASE-EVIDENCE.md`  |

Blank severity counts mean that no qualifying observation has occurred; they do
not mean zero defects.

## Candidate under observation

- ZIP: `artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-midnight-workshop-win-x64.zip`
- SHA-256: `145908c2662fbe7042eeb95f4b2157b5cfa3fdd7f39c82f72d5b2ef4dbacd412`
- Machine evidence: `docs/testing/P27-PREVIEW-RELEASE-EVIDENCE.md`
- Release limitations: `docs/RELEASE_LIMITATIONS-0.3.0-preview.1.md`
- Role-separated handoff:
  `artifacts/round04-human-acceptance/0.3.0-preview.1-145908c2662f`
- Participant task sheet: `docs/testing/ROUND-04-PARTICIPANT-TASKS.md`
- Observer run record: `docs/testing/ROUND-04-OBSERVER-RUN-RECORD.md`
- Structured result template:
  `docs/testing/ROUND-04-OBSERVATION-RESULT.template.json`
- Offline evidence gate: `scripts/validate-round04-human-evidence.ps1`
- Machine result: P22-P27 passed; placeholder closure `openCount: 0`
- Human result: not started; `R4-OBS-001` remains open

## Required participants and environment

Use at least one developer who did not implement the tested phase and has not
been coached on its current UI. P27 requires a participant who has never used
this Studio build.

Provide only:

- a clean Windows profile or clean test machine;
- the versioned Studio package and SHA-256 sidecar;
- the written task for the selected journey;
- test-provider credentials only for the provider journey, entered by the
  participant through Studio's credential flow.

Do not provide the engine checkout, terminal instructions, another IDE,
private MCP calls, direct JSON edits, or verbal guidance. With informed consent,
record the screen, voice, build identity, display scale, start/end time, output
projects, package hashes, logs, and observation notes.

## Journey A — Workspace comprehension and Play Mode

Task shown to participant:

> Create an Empty 2D project. Identify Project Files, Scene Outline, central
> Scene/Game/Code documents, Inspector/Copilot, Console/Problems/Tests, and the
> runtime controls. Create a Scene and one object, run it, pause it, advance one
> Tick, inspect the object state, resume, stop, and reopen the project.

Pass conditions:

- participant names or correctly explains every used region without help;
- Scene and Game views are not confused with project templates or game genres;
- pause and one-Tick step preserve the same runtime session and state;
- reopening preserves files, layout, open documents, and runtime history;
- no terminal, external editor, or manual file workaround is used.

## Journey B — Complete 2D mechanic with Codex

Task shown to participant:

> From Empty 2D, create a small arena with a player and wall. Import a player
> texture and collision sound, create input actions, add Sprite2D and physics,
> write project TypeScript movement, display a score, and make collision play
> sound and change the score. Run and debug it. Ask project Codex to add a
> moving target and a test, review its Plan and ChangeSet, apply the change,
> deliberately introduce one script error, repair it from Problems, undo and
> reapply the repair, then build and run a standalone Windows game.

Pass conditions:

- imported image and audio are visible/audible in both Studio and Player;
- collisions originate from the physics world, not prerecorded test input;
- Codex uses documented semantic tools and project Skills;
- human and AI changes appear in the same files, Diff, tests, audit, and undo;
- standalone behavior matches Studio for required input, visuals, sound, and UI.

## Journey C — Honest minimum 3D

Task shown to participant:

> From Empty 3D, create a room with a perspective camera, floor, wall, light,
> controllable object, and collectible. Give the objects visible materials and
> collision. Run the project, move behind an occluding wall, collect the item,
> inspect the score event, ask Codex to add a second collectible and test, then
> build and run the standalone Windows game.

Pass conditions:

- perspective, depth occlusion, lighting, material, input, and collision are
  visibly demonstrated;
- the participant does not mistake an unavailable advanced feature for a
  working editor;
- Studio and Player use semantically identical Scene and resource files;
- the Codex change is reviewable, testable, reversible, and package-safe.

## Journey D — Daily IDE and asset provider workflow

Task shown to participant:

> Find a symbol, rename it, run one test, create a source breakpoint, inspect
> the call stack and a variable, fix the failure, inspect Diff, commit it, and
> view history. Add named OpenAI/Bailian credentials in Credential Management,
> verify each supplier-specific form keeps endpoint/region/workspace beside its
> write-only API key, create a second profile for one provider, then select
> provider, credential, and an API-discovered model for the image route. Switch generation
> approval between per-call and budget mode. Ask project Codex for an image
> without naming a provider or model; confirm the resolved route, estimate or
> unknown-price state, and approval result. Generate two candidates, cancel one
> job, review/import one candidate, close Studio, reopen, and confirm the
> project still works without exposing the credential.

Pass conditions:

- every visible control performs its labelled action or explains why disabled;
- tests report real discovery and per-test results;
- debugger navigation reaches the correct project source;
- provider health, capability routing, configurable approval, cancellation,
  review, provenance, and import work;
- credentials do not appear in project files, Git, logs, ChangeSets, or builds.

## Observation rubric

Record each event with timestamp, journey step, visible UI state, participant
expectation, actual result, recovery, assistance, severity, owner phase, and
evidence link.

Severity is outcome-based:

- **blocker** — cannot safely finish without coaching, external tools, data
  loss, credential exposure, false success, or an unavailable required feature;
- **major** — finishes only through a non-obvious workaround, repeated failure,
  misleading model, or loss of expected control/state;
- **minor** — finishes independently but creates measurable hesitation,
  avoidable rework, inconsistent wording, or visual friction.

Any coaching converts the affected step to failure. A participant discovering
and using visible contextual help does not count as coaching.

## Per-run record

| Field                                     | Value |
| ----------------------------------------- | ----- |
| Observation ID                            |       |
| Journey / task version                    |       |
| Participant / experience / consent        |       |
| Studio version / commit / package hash    |       |
| Windows version / profile / display scale |       |
| Project preset / project output hash      |       |
| Start / end / active time                 |       |
| Completed steps / total steps             |       |
| Questions / hesitations / wrong turns     |       |
| Contextual help used                      |       |
| Coaching or external escape               |       |
| AI tools and ChangeSet IDs                |       |
| Runtime session / replay / package hashes |       |
| Crash / recovery / data-loss result       |       |
| Credential and package-content result     |       |
| Blocker / major / minor issue IDs         |       |
| Final pass / fail                         |       |
| Observer and participant sign-off         |       |

## Gap ledger

Add a row for every finding; do not overwrite closed rows.

| ID         | Journey / step                 | Observation                                                                                                                                                                           | Severity | Owner | Status                  | Fix evidence                       | Clean-profile retest |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- | ----------------------- | ---------------------------------- | -------------------- |
| R4-OBS-001 | Not yet observed               | Independent Round 04 observation has not started                                                                                                                                      | blocker  | P27   | open                    | pending                            | pending              |
| R4-OBS-002 | Journey A / Scene transform    | Object remained stationary during drag and changed only after pointer release                                                                                                         | blocker  | P23   | fixed; machine verified | `P23-RUNTIME-VIEWPORT-EVIDENCE.md` | pending              |
| R4-OBS-003 | Journey B / Game input         | Space input could carry a stale renderer Tick and be rejected before starting Tank                                                                                                    | blocker  | P23   | fixed; machine verified | `P23-RUNTIME-VIEWPORT-EVIDENCE.md` | pending              |
| R4-OBS-004 | Machine gate / long Tank run   | Persistent QuickJS deadline was anchored at host creation and could expire during later runs                                                                                          | blocker  | P24   | fixed; machine verified | `P24-COMPLETE-2D-EVIDENCE.md`      | pending              |
| R4-OBS-005 | Machine gate / Empty 3D        | Empty 3D did not initialize the required input action manifest, so its first workspace snapshot failed                                                                                | blocker  | P22   | fixed; machine verified | `ROUND-04-CHECKLIST.md`            | pending              |
| R4-OBS-006 | Machine gate / 3D authoring    | P17 still looked for the retired Workbench perspective-grid marker after 3D rendering moved to EngineViewport                                                                         | major    | P17   | fixed; machine verified | `P25-HONEST-3D-EVIDENCE.md`        | not human-facing     |
| R4-OBS-007 | Journey A / add object         | `+ 对象` and related text-input commands depended on an unreliable browser-native prompt and could appear inert                                                                       | blocker  | P23   | fixed; machine verified | `P23-RUNTIME-VIEWPORT-EVIDENCE.md` | pending              |
| R4-OBS-008 | Daily IDE / document tabs      | Project Overview lacked a close affordance; document tabs had no right-click close-right/others workflow; title menus inherited oversized browser typography                          | major    | P26   | fixed; machine verified | `P15-UI-QUALITY-EVIDENCE.md`       | pending              |
| R4-OBS-009 | Journey A / Scene navigation   | Scene lacked conventional 2D pan/zoom, tool shortcuts and clear gesture help; transform release could remain coupled to durable command latency                                       | major    | P23   | fixed; machine verified | `P23-RUNTIME-VIEWPORT-EVIDENCE.md` | pending              |
| R4-OBS-010 | Project manager / open         | Opening a project could spend a long time indexing and starting Codex without acknowledging the click or exposing progress                                                            | major    | P15   | fixed; machine verified | `P15-UI-QUALITY-EVIDENCE.md`       | pending              |
| R4-OBS-011 | Daily IDE / source + Inspector | A missing conflict banner left Monaco in an auto-sized empty grid row, while file Inspector actions fell back to browser-default gray button presentation                             | major    | P15   | fixed; machine verified | `P15-UI-QUALITY-EVIDENCE.md`       | pending              |
| R4-OBS-012 | Daily IDE / TypeScript         | Monaco loaded TypeScript diagnostics and completion but omitted the TypeScript tokenizer, leaving every visible TS token in the same foreground color                                 | major    | P16   | fixed; machine verified | `P15-UI-QUALITY-EVIDENCE.md`       | pending              |
| R4-OBS-013 | Daily IDE / Source Control     | Git toolbar, commit composer, changed-file rows and staging controls inherited browser-default gray surfaces and inconsistent sizing instead of the Studio UI                         | major    | P15   | fixed; machine verified | `P15-UI-QUALITY-EVIDENCE.md`       | pending              |
| R4-OBS-014 | Daily IDE / Inspector          | File metadata labels and values inherited Chromium's roughly 16px definition-list text and appeared oversized beside the rest of the compact Inspector UI                             | minor    | P15   | fixed; machine verified | `P15-UI-QUALITY-EVIDENCE.md`       | pending              |
| R4-OBS-015 | Daily IDE / tool surfaces      | Generation and test panels inherited 16px text and gray outset buttons; the same raw control path remained in debug, capability, conflict, credential and approval surfaces           | major    | P15   | fixed; machine verified | `P15-UI-QUALITY-EVIDENCE.md`       | pending              |
| R4-OBS-016 | Daily IDE / right dock         | The visible right separator was drawn 4px inside the dock, so Inspector/Copilot horizontal rules crossed the apparent double divider from the central work area                       | minor    | P15   | fixed; machine verified | `P15-UI-QUALITY-EVIDENCE.md`       | pending              |
| R4-OBS-017 | Daily IDE / Agent generation   | MCP exposed generation but could not resolve Electron-owned encrypted credentials; Agent also had to choose vendor/model and every paid call used a fixed approval stop               | blocker  | P26   | fixed; machine verified | `P26-DAILY-WORKFLOW-EVIDENCE.md`   | pending              |
| R4-OBS-018 | Daily IDE / provider setup     | Credentials, provider connections, and model choice were duplicated; remote model choices were mixed with a short hard-coded list instead of being visibly API-sourced                | major    | P26   | fixed; machine verified | `P26-DAILY-WORKFLOW-EVIDENCE.md`   | pending              |
| R4-OBS-019 | Daily IDE / provider migration | Existing Bailian region/workspace fields remained in hidden legacy settings, while a dynamic OpenAI image route was mislabeled unavailable when its project provider entry was absent | major    | P26   | fixed; machine verified | `P26-DAILY-WORKFLOW-EVIDENCE.md`   | pending              |

## Release sign-off

Round 04 human acceptance passes only when:

- all four journeys have qualifying recordings and durable artifacts;
- both standalone projects run on a clean machine without Studio or development
  dependencies;
- there are no open blockers and every fixed blocker passed a new clean-profile
  retest;
- no required step used coaching, terminal, another IDE, engine checkout,
  direct private-file manipulation, or DOM automation;
- the observer and participant sign the final run record.
