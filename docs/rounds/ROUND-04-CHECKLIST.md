# Round 04 execution checklist

- Source of truth: `docs/rounds/ROUND-04-REAL-GAME-AUTHORING.md`
- Status: Validation — P22-P27 machine gates passed and Preview candidate built;
  independent human exits remain open
- Human observation: `docs/testing/ROUND-04-HUMAN-OBSERVATION.md`
- P22 evidence: `docs/testing/P22-ROUND04-BASELINE-EVIDENCE.md`
- P23 evidence: `docs/testing/P23-RUNTIME-VIEWPORT-EVIDENCE.md`
- P24 evidence: `docs/testing/P24-COMPLETE-2D-EVIDENCE.md`
- P25 evidence: `docs/testing/P25-HONEST-3D-EVIDENCE.md`
- P26 evidence: `docs/testing/P26-DAILY-WORKFLOW-EVIDENCE.md`
- P27 evidence: `docs/testing/P27-PREVIEW-RELEASE-EVIDENCE.md`
- Evidence index: `docs/testing/ROUND-04-EVIDENCE-INDEX.md`
- Rule: implementation, UI, AI parity, automated evidence, and required human
  observation are separate checks; one cannot imply another.
- Rule: an item is checked only after its named durable artifact and evidence
  exist in the repository.

## P22 — Truthful baseline and executable contracts

- [x] Publish the Round 04 development specification.
- [x] Publish this independent execution checklist.
- [x] Publish the Round 04 human observation board and recording protocol.
- [x] Rebaseline the human dashboard around real game-authoring outcomes.
- [x] Record the current reusable and placeholder boundaries by subsystem.
- [x] Publish the source/line-backed Round 04 placeholder inventory.
- [x] Define the persistent runtime-session protocol and lifecycle state machine.
- [x] Define versioned render, audio, debug, input, and physics messages.
- [x] Define stable asset references and runtime dependency resolution.
- [x] Initialize the shared input action manifest in every Empty project preset.
- [x] Define the Studio native preview-host boundary and crash recovery policy.
- [x] Add failing probes for DOM viewport rendering, synthetic collision-only
      execution, placeholder providers, and ineffective settings.
- [x] Link every probe to an owner phase and closure evidence location.

### P22 exit gate

- [x] Every known placeholder has source evidence, severity, owner, test, and
      retest requirement.
- [x] Protocol review proves that Studio and Player cannot silently implement
      different runtime worlds.
- [x] The dashboard contains no Round 04 completion inferred from Round 03
      machine gates.

## P23 — Shared viewport and live Play Mode

- [x] Implement a persistent runtime process/session with stable session ID.
- [x] Implement start, play, pause, one fixed Tick, stop, and restart semantics.
- [x] Route timestamped keyboard and pointer input into fixed-Tick processing.
- [x] Publish versioned RenderSnapshot, DebugSnapshot, and runtime diagnostics.
- [x] Make Studio Game view and exported Player consume the same snapshots.
- [x] Replace the production DOM/CSS Scene projection with the engine viewport.
- [x] Add editor grid, selection, picking, camera, and transform gizmo overlays.
- [x] Replace unreliable browser text prompts with keyboard-accessible Studio
      dialogs and verify object creation through the real Electron UI.
- [x] Preview Transform movement in memory on animation frames and persist only
      one semantic transaction on pointer release.
- [x] Add standard Scene navigation and selection: left-click pick, blank-click
      clear, middle/right or Space+left pan, wheel zoom, Home reset, Q/W/E/R
      tools, visible zoom/tool state, and frame-coalesced pointer rendering.
- [x] Keep pointer release non-blocking while serializing optimistic transform
      commits per authoritative Scene and visibly reporting pending persistence.
- [x] Route live keyboard/pointer input through a lightweight IPC and allocate
      its Tick from the authoritative Runtime Session.
- [x] Implement explicit hot-reload migration or restart reporting.
- [x] Isolate preview crash and restore Studio without project loss.
- [x] Expose all session controls and observations through Engine MCP and Skill.
- [x] Add visual parity, lifecycle, input, crash, and determinism tests.

### P23 exit gate

- [x] Studio, headless replay, and Player report identical authoritative state
      for the same project, seed, inputs, and Tick count.
- [x] Pause and step retain the same live world rather than replaying from zero.
- [x] Scene drag feedback appears before pointer release without writing the
      Scene file, and one drag creates one history transaction.
- [x] Real Electron interaction proves Scene pick/clear, shortcut switching,
      pan, zoom, reset, sub-200 ms preview, and sub-200 ms release latency.
- [x] Live input does not depend on a stale renderer Tick or trigger a project
      file/Git scan before entering the Runtime queue.
- [x] No production Scene or Game view renders generic DOM game objects.
- [ ] A clean-profile participant can find Run, Pause, Step, Stop, Game, Scene,
      Console, Problems, and current Tick without coaching.

## P24 — Complete minimum 2D game loop

- [x] Implement Camera2D and viewport scaling.
- [x] Implement Sprite2D texture, pivot, tint, filtering, layer, and ordering.
- [x] Implement image decode, texture upload, atlas region, caching, and release.
- [x] Implement project input actions and stable keyboard/pointer mapping.
- [x] Integrate Collider2D and RigidBody2D through the physics adapter.
- [x] Deliver collision/trigger enter, stay, and exit events deterministically.
- [x] Implement WAV/OGG playback, buses, volume, mute, loop, and one-shot audio.
- [x] Implement sufficient UI for menu, HUD, score, pause, win, and lose states.
- [x] Package only reachable image, audio, Scene, Prefab, and script assets;
      font assets are explicitly deferred in the Preview limitations.
- [x] Emit precise diagnostics for missing, invalid, unsupported, or orphaned
      resources.
- [x] Expose 2D create/edit/run/debug/test/build parity through MCP and Skills.
- [ ] Complete the Tank mechanic from Empty 2D through human UI and Codex.

### P24 exit gate

- [ ] Tank is playable in Studio and standalone Player with matching input,
      sprites, collision, sound, UI, scoring, pause, restart, win, and lose.
- [x] A collision generated by physics identifies both stable object IDs,
      Collider IDs, phase, normal/contact data, and authoritative Tick.
- [ ] One human and one Codex implementation produce semantically equivalent
      project files and pass the same headless/replay tests.

## P25 — Honest minimum 3D game loop

- [x] Implement perspective Camera3D and depth-tested rendering.
- [x] Implement transform hierarchy and translation/rotation/scale gizmos.
- [x] Implement primitive and imported static mesh resources.
- [x] Implement material color, texture, and one directional light.
- [x] Implement 3D picking and viewport navigation.
- [x] Integrate Collider3D and RigidBody3D through the physics adapter.
- [x] Implement project-defined first- or third-person input without core game
      vocabulary.
- [x] Expose the complete 3D slice through the shared capability/MCP/Skill path.
- [x] Add render-contract, occlusion, collision, determinism, and
      package-content tests; independent visual observation remains open.
- [x] Build Collect Room from Empty 3D without game-specific engine code.

### P25 exit gate

- [ ] Collect Room visibly proves perspective, occlusion, lighting, collision,
      input, scoring, restart, and standalone execution.
- [x] Studio and Player use the same camera, mesh, material, resource, physics,
      and script contracts.
- [x] Unsupported advanced 3D features are labelled unavailable rather than
      represented by inert controls.

## P26 — Complete daily IDE and provider workflows

- [x] Replace title-bar shortcuts with complete File/Edit/View/Project/Run menus.
- [x] Keep every central document tab closable and provide tab-context actions
      for close current, close right, close others, and close all; render the
      title-bar dropdown on the shared compact dark UI scale.
- [x] Implement real test discovery, per-test progress, results, output, rerun,
      and source navigation.
- [x] Implement source breakpoints, call stack, scopes, watches, and stepping.
- [x] Add an integrated terminal/task-output surface with explicit permissions.
- [x] Add filesystem watching, conflict handling, and external-change refresh.
- [x] Complete file/resource Inspector properties and missing-reference repair.
- [x] Normalize Inspector file-metadata labels and values to the compact Studio
      type scale and enforce their computed sizes in the real Electron gate.
- [x] Align the visible center/right separator to the real dock boundary while
      retaining an 8px drag target; contain all Inspector/Copilot dividers.
- [x] Lock the approved Midnight Workshop Studio language in a project Skill,
      versioned machine-readable tokens, root Agent routing, and a CI gate.
- [x] Replace native generation/test buttons and audit debug, capability,
      conflict, credential, and Copilot approval controls for the same compact
      dark presentation.
- [x] Complete Prefab isolation and override visualization.
- [x] Deliver minimum material preview and animation timeline editors.
- [x] Complete Git commit, history, branch, conflict, stash, and remote workflow.
- [x] Complete capability/extension enable, disable, health, and configuration.
- [x] Make locale, autosave, runtime, renderer, build, Agent, Goal, context, MCP,
      Skill, provider, and credential-reference settings effective and tested.
- [x] Integrate one real generation provider with health, cost estimate,
      cancellation, candidate review, provenance, import, and redaction.
- [x] Route Agent image/speech-generation requests through project-owned
      provider/model choices, including OpenAI GPT Image 2, without exposing
      credentials; retain `audio` as a legacy route alias.
- [x] Keep credentials in one management surface: provider-specific named
      profiles, multiple profiles per provider, and write-only secrets.
- [x] Give every generation capability separate provider, credential, and
      model controls; discover OpenAI/Bailian models through their APIs with a
      clearly separate manual-ID mode and honest execution-adapter status.
      Remote dropdowns contain only API-returned models; built-in models remain
      isolated to the local deterministic test provider.
- [x] Migrate legacy provider endpoint/region/workspace fields into their named
      credential, remove duplicate global keys, repair older schema 2 projects
      missing a bundled provider, and keep UI readiness aligned with the
      broker's dynamic adapters.
- [x] Make paid-generation approval a global human setting with per-call,
      known-budget, and explicit pre-authorized modes; re-evaluate retries.
- [x] Forward Codex MCP generation through an authenticated, project-scoped
      Electron-main bridge and prove capability-only invocation in the gate.
- [x] Clearly label and isolate the local placeholder generator as test-only.
- [x] Remove or disable every visible inert control.

### P26 exit gate

- [ ] A participant completes author, debug, test, resource generation, Diff,
      commit, close, reopen, and resume entirely in Studio.
- [x] A settings-effect matrix proves every visible value is consumed, disabled
      with a reason, or absent.
- [x] No secret enters project files, ChangeSets, logs, builds, replays, or Git.

## P27 — Independent game completion and Preview release

- [ ] Build Tank Arena from a clean Empty 2D preset using installed Studio.
- [ ] Build Collect Room from a clean Empty 3D preset using installed Studio.
- [ ] Use project Codex for at least one feature, test, diagnosis, and repair in
      each project without DOM automation or private-state guessing.
- [x] Pass deterministic, replay, migration, performance, crash, and recovery
      gates.
- [x] Pass credential-leak, dependency-reachability, and package-content gates.
- [ ] Build and run standalone Development and Release packages on a clean PC.
- [ ] Execute the complete human observation protocol with a new participant.
- [ ] Enter every observed gap, assign severity/owner, fix blockers, and retest
      from a new clean profile.
- [x] Publish the 0.3.0 Preview limitations and evidence index.
- [x] Package AI Game Studio 0.3.0 Preview and publish its hash.
- [x] Generate a role-separated acceptance kit, structured observation result,
      and offline evidence validator that rejects incomplete or coached runs.

### P27 exit gate

- [ ] The independent participant completes both prescribed journeys without
      coaching, terminal, external IDE, engine checkout, or manual workaround.
- [x] Studio preview and standalone packages have matching required behavior in
      the automated runtime, input, physics, rendering, audio, and package gates;
      independent visual observation remains open.
- [ ] No blocker remains in the Round 04 observation board.
- [x] Every checked item links to automated or human evidence.

## Per-feature completion record

Use this record for every capability introduced or completed in Round 04:

- [ ] Human UI is discoverable and effective.
- [ ] Durable file representation is documented and versioned.
- [ ] Query API reports effective state with stable IDs.
- [ ] Semantic mutation returns structured diagnostics.
- [ ] MCP and Skill expose the same supported operation.
- [ ] ChangeSet preview and audit record exist for durable mutations.
- [ ] Success, failure, migration, and deterministic tests pass.
- [ ] Undo/rollback preserves unrelated newer work.
- [ ] Permission, secret, cost, network, and destructive behavior is explicit.
- [ ] Required clean-profile human observation passes.
