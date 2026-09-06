# Round 04 placeholder inventory

- Baseline date: 2026-09-03
- Owner round: Round 04 / P22-P27
- Executable probe: `scripts/check-p22-placeholders.ts`
- Rule: an entry closes only when its replacement works through Studio, Player,
  Engine MCP/Skill, automated evidence, and the named human retest.

Line references identify the audited baseline. The executable probe uses stable
source signatures so ordinary line movement cannot silently hide an open gap.

## Severity definitions

- **blocker**: prevents a required real 2D/3D game or produces false success.
- **major**: required workflow exists only as a partial shell or external
  workaround.
- **minor**: workflow completes but remains confusing or unnecessarily limited.

## Inventory

| ID         | Boundary and source evidence                                                                                                                                                           | Why it is incomplete                                                                     | Severity     | Owner        | Probe / closure evidence                                          | Human retest |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------ | ------------ | ----------------------------------------------------------------- | ------------ |
| R4-INV-001 | `studio/electron/renderer/Workbench.tsx:182-194,2934-2964` constructs a fixed 32×18 world and renders Scene objects as DOM buttons containing a generic `Box` icon                     | Scene view is an approximation, not engine output                                        | blocker      | P23          | `R4-PROBE-DOM-VIEWPORT`; shared viewport visual parity            | Journey A    |
| R4-INV-002 | `studio/electron/renderer/Workbench.tsx:258-273,2974-2992` reduces transforms to X/Y and exposes ± axis buttons                                                                        | No direct manipulation, rotation, scale, camera, or true 3D gizmo interaction            | major        | P23/P25      | `R4-PROBE-DOM-VIEWPORT`; picking/gizmo tests                      | Journeys A/C |
| R4-INV-003 | `studio/workspace/studio-command-registry.ts:818-838,1378-1380` synchronously runs a request with a default 60-Tick bound                                                              | Run is not a persistent playable session                                                 | blocker      | P23          | `R4-PROBE-BOUNDED-RUNTIME`; session lifecycle gate                | Journey A    |
| R4-INV-004 | `studio/workspace/studio-command-registry.ts:888-916` marks pause in metadata and implements step by rerunning from Tick zero through current Tick + 1                                 | Pause/step do not retain one live VM/world                                               | blocker      | P23          | `R4-PROBE-REPLAYED-STEP`; same-session assertion                  | Journey A    |
| R4-INV-005 | `studio/electron/renderer/Workbench.tsx:2775-2830` renders Tick/hash/memory/event summaries rather than a playable Game surface                                                        | Game document is a runtime report                                                        | blocker      | P23          | `R4-PROBE-RUNTIME-REPORT`; frame/input observation                | Journey A    |
| R4-INV-006 | `studio/workspace/studio-command-registry.ts:1399-1403` forwards supplied collision arrays and `crates/script-host/src/lib.rs:513` dispatches those entries                            | Collision lifecycle accepts synthetic fixtures but computes no contacts                  | blocker      | P24/P25      | `R4-PROBE-SYNTHETIC-COLLISION`; physics contact tests             | Journeys B/C |
| R4-INV-007 | `crates/player/src/main.rs:441` sends `"collisions": []` on each Player script-host request                                                                                            | Native Player does not own a physics collision world                                     | blocker      | P24/P25      | `R4-PROBE-PLAYER-NO-PHYSICS`; real contact evidence               | Journeys B/C |
| R4-INV-008 | `studio/capabilities/capability-registry.ts:112` registers Shape2D but no runtime Sprite2D component; `crates/player/src/main.rs:854-893` only projects shapes and bitmap text         | Imported image assets cannot generally appear as game sprites                            | blocker      | P24          | `R4-PROBE-NO-SPRITE-AUDIO`; textured Tank package                 | Journey B    |
| R4-INV-009 | `crates/player/Cargo.toml` has no image/audio runtime dependency and Player contains no audio mixer path                                                                               | Imported audio cannot become audible game output                                         | blocker      | P24          | `R4-PROBE-NO-SPRITE-AUDIO`; audio device/headless event tests     | Journey B    |
| R4-INV-010 | `crates/player/src/main.rs:819-842` manually maps 3D coordinates to 2D rectangles                                                                                                      | 3D proof has no perspective projection, depth-tested mesh path, or real light evaluation | blocker      | P25          | `R4-PROBE-ISOMETRIC-3D`; perspective/occlusion golden scene       | Journey C    |
| R4-INV-011 | `studio/workspace/studio-asset-job-broker.ts:195-205` accepts only `local-placeholder` and `test-fixture`; other providers return `ASSET_PROVIDER_NOT_CONNECTED`                       | Provider-neutral types exist, but no real external provider adapter is connected         | major        | P26          | `R4-PROBE-PLACEHOLDER-PROVIDER`; provider conformance suite       | Journey D    |
| R4-INV-012 | `studio/electron/renderer/Workbench.tsx:366,2293-2297` stores a settings search query without using it to filter settings                                                              | Search control is visible but ineffective                                                | major        | P26          | `R4-PROBE-INEFFECTIVE-SETTINGS`; settings-effect matrix           | Journey D    |
| R4-INV-013 | `studio/electron/renderer/Workbench.tsx:2368-2560` persists locale, autosave, Agent defaults, context, MCP/Skill and provider values; consumers are absent or partial outside the form | Persistence is presented as effective configuration                                      | blocker      | P26          | `R4-PROBE-INEFFECTIVE-SETTINGS`; per-setting effect tests         | Journey D    |
| R4-INV-014 | `studio/electron/renderer/Workbench.tsx:3931-3933` renders View/Project/Run buttons without handlers                                                                                   | Main menu contains inert controls                                                        | major        | P26          | `R4-PROBE-INERT-MENUS`; command/menu parity tests                 | Journey D    |
| R4-INV-015 | `studio/workspace/studio-command-registry.ts:1354-1380` defaults Tests to one Tick when `tests/smoke.test.json` is absent                                                              | “Run all tests” can report success without discovering a test                            | blocker      | P26          | `R4-PROBE-FALSE-TEST-SUCCESS`; empty-suite must fail/declare zero | Journey D    |
| R4-INV-016 | `studio/electron/renderer/Workbench.tsx:2275-2290` lists capabilities as buttons with no enable/disable/configure action                                                               | Extensions panel is read-only decoration                                                 | major        | P26          | `R4-PROBE-INERT-EXTENSIONS`; capability lifecycle gate            | Journey D    |
| R4-INV-017 | `studio/electron/renderer/Workbench.tsx:3020-3110` uses source-style Prefab content and generic routing for material/animation documents                                               | Specialized Prefab, material, and animation workflows remain partial                     | major        | P26          | editor-specific interaction tests                                 | Journey D    |
| R4-INV-018 | `studio/workspace/studio-command-registry.ts:552-630` covers stage/unstage/restore but no commit/history/branch/conflict/stash/remote service                                          | Source control is useful but not a complete daily workflow                               | major        | P26          | SCM workflow integration test                                     | Journey D    |
| R4-INV-019 | `docs/RELEASE_LIMITATIONS-0.2.0-alpha.5.md` limits release to unsigned Windows portable output                                                                                         | Installer/signing/updater and other platforms are unavailable                            | minor for R4 | P27/deferred | clean Windows package evidence and updated limitations            | P27 release  |
| R4-INV-020 | `docs/testing/ROUND-04-HUMAN-OBSERVATION.md` has no independent completed run and keeps `R4-OBS-001` open                                                                              | Product usability and no-external-tool completion are unproven                           | blocker      | P27          | signed recordings, artifacts, gap fixes and clean-profile retest  | All journeys |

## Dependency order

```text
R4-INV-003/004 runtime session
        ↓
R4-INV-001/002/005 shared viewport
        ↓
R4-INV-006..010 real 2D/3D capabilities
        ↓
R4-INV-011..018 daily production workflow
        ↓
R4-INV-019/020 independent release decision
```

Closing a downstream UI symptom does not close an upstream runtime gap. For
example, drawing a Sprite in the DOM does not close Sprite2D; it closes only
when the same asset reference is resolved by Studio preview and Player, is
package-reachable, produces diagnostics, and passes Journey B.

## Machine closure status — 2026-09-03

- R4-INV-001–005: replacement implementation and P23 machine probes passed;
  Journey A remains open.
- R4-INV-006–009: real 2D physics, Sprite, audio, UI and Player paths passed P24
  gates; Journey B remains open.
- R4-INV-010: perspective/depth/WebGL2/wgpu/static OBJ/material/light/3D physics
  replacement passed P25; Journey C remains open.
- R4-INV-011–018: daily workflow replacements passed `npm run check:p26`.
  The settings search placeholder was removed, all shipped settings now have a
  consumer or disabled reason, menus/extensions/tests/editors/Git are active,
  and the Bailian adapter passed cost/cancel/review/import/redaction
  conformance. Journey D remains open.
- R4-INV-019 is an explicit deferred distribution limitation.
- R4-INV-020 remains the Round blocker until independent signed observation.

Machine closure means the baseline source signature is gone and its automated
replacement test passed. It does not replace the Human retest column.

## Deferred rather than hidden

Advanced PBR, skeletal animation, terrain, navigation, networking, Web/mobile/
mini-program export, consoles, and a public extension marketplace are explicit
Round 04 non-goals. Their controls must be absent or visibly marked unavailable;
they must not appear as enabled placeholders.
