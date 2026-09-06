# Round 05 execution checklist

## Owner acceptance — 2026-09-06

- [x] Product owner accepted the current R5 delivery and confirmed closure.
- [x] Record P33 independent Journeys A–E as deferred, not passed.
- [x] Preserve unexecuted historical acceptance items below as unchecked.
- Decision: `ROUND-05-ACCEPTANCE.json`. This owner decision supersedes the
  previous requirement that P33 must finish before R5 can close. It does not
  constitute an independent participant run or change any NOT_RUN evidence.
- Accepted repair delivery: Studio `0520a5c0…`, Tank revision `27bc3a91…`,
  Release `ffffa361…`; see `../testing/R5-ACTIVITY-AND-TANK-FACING.md`.
- Closure verification: `npm run check` exited 0
  (`artifacts/r5-closure-full-check.log`); dashboard production build exited 0
  (`artifacts/r5-closure-board-build-final.log`); P28 and owner-closure checks
  pass. The isolated closure-check Studio archive is `79c7f9ff…`; it does not
  replace the owner-accepted repair package. Hosted Site lookup returned
  NOT_FOUND, so only the local board was updated, not the old hosted URL.

## Historical implementation and acceptance evidence

- Source of truth: `docs/rounds/ROUND-05-COPILOT-GAME-COMPLETION.md`
- Previous delivery baseline: Tank revision `d7ea102d…` passes 22 tests / 276
  assertions, three full game routes, six UI checkpoints and both game package
  audits. The complete source project is archived as `0868333e…`. Audio review
  is delegated and closed; no individual sound is awaiting the owner.
  Isolated source `f41d6c02…` produced clean 0.4.0 Studio `2ede62d7…`;
  full check, R5 specialist gates and the eligible role-separated kit pass.
  Independent P33 Journeys A–E have not started. See `../ROUND-05-DELIVERY.md`.
- Historical progression (not the current waiting state): P28–P30 and P32 machine gates passed; the original internal Copilot
  has integrated nine images and owner-accepted music, shot, hit, wall-break,
  navigation and confirmation audio. Revision `77be28e9…` passes 20 tests / 255 assertions,
  including exact original post-apply report audit `r5-hit-postapply-audit-7kaSNB`.
  The separately owner-accepted 100ms confirmation master passed isolated
  import/rollback and original Copilot applied it at `01e71668…`. Its
  contextual provenance supplement is now applied at
  `3993050d…`; confirm wiring `34648712…` passed exact rollback, 20 tests /
  255 assertions and 14 deterministic probes and was applied by the original
  Copilot at `cdffc27d…`. The actual audio-session report matches reviewed
  source/state/audio exactly (`r5-confirm-runtime-audit-9aWMDT`). A new 110ms
  UI back master passed technical checks and was separately owner-accepted.
  Native selection created import `4cda8196…`; exact isolated rollback and
  20 tests / 255 assertions passed and the supervisor approved it. Original
  Copilot applied the import at `a73d171b…`, supplemented provenance at
  `681e2748…`, and applied event wiring at `2dd834ff…`. Exact rollback, 21 tests /
  268 assertions, 24 deterministic probes and original test-report audit pass;
  all 16 then-imported provenance chains pass. Subsequently wall-hit, win and
  loss imports and the merged context supplement were applied by original
  Copilot at `1e75c91b…`; all 19 source chains pass
  (`r5-imported-provenance-audit-GouZvF`). The final audio wiring proposal was
  corrected after a malformed projectile assertion, reviewed and applied by
  original Copilot at `d7ea102d…`. All 22 actual tests / 276 assertions match
  the isolated review, including exact audio/state repeatability and three
  600-Tick exactly-once probes; all 19 provenance chains remain valid. See
  `P31-FINAL-AUDIO-WIRING-EVIDENCE.md`. No further user audio audition is required.
  Final-revision normal-entry victory is now also verified: 1008 Ticks,
  score 600, HP 2/5, and identical Studio/Player frames, state and all 106
  audio events at both resolutions (`P31-FINAL-PLAY-EVIDENCE.md`).
  The owner has now delegated
  subsequent test-project audio review to the supervisor, so per-sound user
  audition must not repeatedly block work; P33 independent acceptance remains separate.
  A read-only audit identified missing Skill/Brief links in three early audio
  imports. Original Copilot repaired only the manifest and three sidecars at
  `b6e76869…`; exact application/rollback and all 15 imported provenance chains
  pass (`P31-IMPORTED-PROVENANCE-AUDIT.md`). No audio or provider Job changed.
  A resource polling regression was reproduced and repaired: repeated WAV/MP3
  preview requests drop from five each to one in the real Electron gate. Image,
  lifecycle and P15 UI checks pass; full regression and actual installed package
  `87cb8897…` also pass, including 287 hashes and runtime parity. Evidence is in
  `P31-ASSET-PANEL-REFRESH.md` and `r5-polling-delivery-grO5uf`.
  Plan status and narrow-window clipping repairs pass eight state cases,
  seven geometry scenarios and full engine/installed-package qualification
  (`d632ef94…`); see `P32-PLAN-PRESENTATION-EVIDENCE.md`.
  Earlier revision `20eff586…` normal-entry
  mute/restart/return (84 Ticks), natural loss/muted restart (2233 Ticks) and
  subsequent victory (6202 Ticks) pass two-resolution Studio/Player audits,
  including correct audio buses, clip/frame hashes and no playback diagnostics.
  Frozen evidence is in `P24-AUDIO-CONTROL-BUS.md`. Full engine regression also
  passes. Reviewer UI `dbf2197c…` was owner-installed and is recoverably backed
  up by current repair `87cb8897…`; installed quality/recovery gates pass.
  Remaining audio-complete final recordings and
  Development/Release packages, final mixing/play and independent Journeys A–E
  remain open. Historical package receipts do not certify subsequently rebuilt
  archives; see `P31-PACKAGE-VERIFICATION.md`. Fixture and supervised checks are
  supporting evidence, not independent human acceptance or R5 completion.
- Human observation: `docs/testing/ROUND-05-HUMAN-OBSERVATION.md`
- First machine gate: `npm run check:p28:round05`
- P28 evidence: `docs/testing/P28-ROUND05-CONTRACT-EVIDENCE.md`
- P29 media evidence: `docs/testing/P29-MEDIA-JOB-EVIDENCE.md`
- P29 import evidence: `docs/testing/P29-TRANSACTIONAL-IMPORT-EVIDENCE.md`
- Rule: a tool name, UI control, mock response, generated file, or developer
  demonstration is not completion evidence.
- Rule: every checked implementation item requires a durable artifact and its
  named machine or human evidence.
- Rule: all AI writes retain preview, validation, human policy evaluation,
  audit, and exact rollback.

## P28 — Completion contract and truthful baseline

- [x] Publish the Round 05 development specification.
- [x] Publish this independent execution checklist.
- [x] Publish the Round 05 human observation board and recording protocol.
- [x] Define the canonical placeholder-Tank-to-package user journey.
- [x] Separate allowed human gates from coaching and manual workarounds.
- [x] Record the current media, import, runtime observation, Goal recovery, and
      package boundaries.
- [x] Add an executable contract check for the three Round 05 control artifacts
      and their required acceptance language.
- [x] Define the versioned completion-run state schema and stable IDs.
- [x] Define explicit image, sound-effect, music, and speech-generation job
      capability schemas plus the legacy `audio` migration.
- [x] Define candidate artifact, review decision, rejection, and regeneration
      schemas.
- [x] Define transactional generated-resource import and rollback schema.
- [x] Define addressable runtime frame/audio observation schema.
- [x] Map every starting gap to an owner phase, failing probe, evidence file,
      and human journey.

### P28 exit gate

- [x] The completion contract is reviewed without unresolved authority,
      approval, idempotency, provenance, or evidence ambiguity.
- [x] Every Round 05 implementation claim has both a machine gate and a human
      observation outcome.
- [x] The dashboard reports Round 05 as active planning, not as game completion.
- [x] No Round 04 machine result is presented as Round 05 human evidence.

## P29 — Agent-native media jobs and reviewed import

### Capability and provider routing

- [x] Replace new uses of ambiguous `audio` generation with explicit
      `soundEffect`, `music`, or `speechGeneration` capabilities.
- [x] Preserve a documented, tested migration for existing `audio` routes.
- [x] Publish parameter schemas and compatibility checks for each delivered
      provider/model/capability combination.
- [x] Return effective provider, named credential reference, model, endpoint
      class, parameters, and price/unknown-price state without returning secret
      values.
- [x] Make missing credential, unhealthy provider, unsupported model, invalid
      parameter, quota, rate limit, safety refusal, and transient failure
      distinct structured diagnostics.
- [x] Implement at least one production image adapter and one production
      sound-effect adapter, with machine-tested routing and failure handling.
- [x] Execute both production image and sound-effect adapters in the canonical
      Tank run: nine reviewed images plus formal ElevenLabs shooting/hit Jobs
      were generated, reviewed and imported. Music is also imported. See
      `P31-AUDIO-MASTER.md`; this does not close full sound coverage or P33.
- [x] Implement a production music adapter if background music is included in
      the completed-game scope; otherwise make the deferral visible and remove
      it from the canonical asset plan.

### Durable job execution

- [x] Assign stable job and idempotency IDs before an outbound request.
- [x] Persist queued, waiting-for-approval, running, awaiting-review, failed,
      cancelled, imported, and rejected states.
- [x] Stream or poll provider progress through the main-process broker.
- [x] Reconcile ambiguous timeouts before retrying a possibly billed request.
- [x] Apply per-call, known-budget, and explicit pre-authorization policy to
      every initial call and retry.
- [x] Prevent project prompts, Skills, MCP calls, and imported configuration
      from changing global approval policy.
- [x] Support cancellation with an honest final state when the provider cannot
      guarantee remote cancellation.
- [x] Record estimated and actual cost or an explicit unknown-cost result.

### Candidate inspection and review

- [x] Return every candidate through a stable ID and inspectable artifact.
- [x] Show image dimensions, format, transparency, hash, and renderable preview.
- [x] Show audio duration, codec, sample rate, hash, and playable comparison.
- [x] Correct the discovered production MP3 decoder/metadata gap: measured
      native decoding, invalid media/MIME/size negatives, legacy-job recovery,
      and WAV/MP3 packaged verification pass, along with full regression and
      isolated install checks (`P29-AUDIO-CODEC-FOLLOWUP.md`). Test audio is not
      a formal Tank asset or subjective listening acceptance.
- [x] Install the verified `aa63a769…` audio-repair candidate after the owner
      closes Studio normally: preserve a recoverable backup, verify all 287
      installed content hashes, rerun the installed MP3/WAV inspector and
      resume the original game Copilot. Turn `01a07243-0b04-73a0-b256-71d934d49fc6`
      is observed INPROGRESS in Studio. This is installation/handoff evidence,
      not completion of its newly assigned game repairs.
- [x] Let Codex compare candidates and provide a recommendation with stated
      evidence.
- [x] Record explicit human selection or the configured selection policy before
      project import.
- [x] Preserve rejected candidates and regeneration ancestry in local audit.
- [x] Keep temporary candidates outside authoritative project assets until
      selection.

### Transactional import

- [x] Propose candidate import as a previewable ChangeSet rather than mutating
      project authority directly.
- [x] Include file copy, Asset ID, manifest record, provenance, import settings,
      license/restriction fields, and reference updates in one transaction.
- [x] Record art-direction Skill, asset-brief, prompt, provider, model,
      parameters, source, candidate, and derived-content hashes.
- [x] Verify the selected candidate hash before and after import.
- [x] Roll back the imported file, manifest record, and only the references
      owned by the transaction.
- [x] Recover atomically after interruption between file, manifest, and Scene or
      Prefab mutation.

### P29 exit gate

- [x] Project Codex requests image and sound-effect capabilities without vendor
      or model names and the configured routes execute correctly.
- [x] Per-call approval visibly waits; budget and pre-authorized modes execute
      only within their configured authority.
- [ ] A human reviews candidates inside Studio and the selected asset enters the
      project through an approved ChangeSet.
- [x] Reject, regenerate, retry, cancel, rollback, and restart paths retain
      audit and never duplicate a paid request.
- [x] Credential redaction tests find no secret in project files, transcript,
      jobs, ChangeSets, diagnostics, logs, Git, build reports, or packages.

## P30 — Visual runtime observation and repair loop

### Addressable observations

- [x] Add `runtime.capture_frame` or equivalent Engine MCP operation with stable
      session, generation, scene, Tick, camera, and artifact identity.
- [x] Return an image artifact that Codex can actually inspect.
- [x] Report viewport size, projection, drawable IDs, asset IDs, source hashes,
      layers/order, atlas regions, pivots, tint, and fallback-resource state.
- [x] Expose UI bounds, text overflow/clipping, visibility, and interaction
      targets through stable IDs.
- [x] Correct text bounds to actual bitmap glyph widths and multiline layout;
      retain 14 native-frame checks for two viewport sizes, long/button labels,
      hidden/empty labels, CRLF and minimum font size (`check:p30`).
- [x] Preserve complete long-checkpoint history in a private bounded native
      buffer without increasing the gameplay heap or relaxing execution guards.
      Native completeness/privacy/reset/budget tests and all 260 actual-project-
      copy snapshots match the old host; P30 passes. The 287-hash-verified package
      is installed and actual Copilot resumed; independent actual-game
      acceptance remains open.
- [x] Add paused-only, checkpoint-guarded `runtime.advance_ticks` (1–200 Ticks),
      preserving complete snapshots and rejecting stale/duplicate requests.
      Continuous/batched parity, failure/restart, queued input and real MCP
      checks pass in both the full check and full P30; actual-project-copy
      diagnostic evidence does not substitute for the final game run.
- [x] Expose emitted audio events, resolved clips, buses, volume/mute state, and
      missing or failed playback diagnostics.
- [x] Add deterministic scripted input/checkpoint navigation for menu, play,
      pause, win, lose, and restart states.
- [x] Capture comparable Studio and standalone Player observations from the same
      project state and input log.
- [x] Close the newly exposed actual long-session gap: export the accumulated
      semantic input history after bounded stepping, replay that exact history
      in guarded Player batches, and reject a checkpoint label being silently
      treated as a fresh Menu request. The existing short explicit-log parity
      gate does not cover this path.
      Source now passes a 551-Tick native Player combat/recorded-log gate and
      missing/tampered/stale/override negatives. It also fixes missing packaged
      Prefab definitions discovered on the first shot. Full regression/P30 and
      the 287-hash-verified installed `19410ce9…` package pass. Actual Tank
      revised loss/muted-restart (977 Ticks) and victory (1175 Ticks) now match
      recorded/Studio/Player states and PNGs at both supported resolutions;
      victory's final 175 cross-host snapshots also match. Both current shipped
      ZIPs subsequently replay both logs with matching states/eight frames.
      Formal audio, final audio-complete release and independent human acceptance
      remain separate open gates.
- [x] Repair resumed same-Scene reload using authored defaults, with continuous/
      split regression and actual installed Copilot loss→restart proof: Tick
      1616, HP 5/5, six enemies, score zero, muted=true / volume=80. Full check,
      P30 and installed `8798eef9…` hashes pass; HUD inset polish stays open.

### AI diagnosis and repair

- [x] Add project Skill instructions for when to inspect files, state, trace,
      frame, audio, tests, Replay, and build reports.
- [x] Return every observation failure with stable Scene/object/Component/asset/
      script/Tick references where applicable.
- [x] Detect a missing texture, hash mismatch, fallback shape, invisible layer,
      bad pivot/scale, off-screen UI, missing audio, and unreachable packaged
      resource.
- [x] Make Codex propose repairs through semantic ChangeSets.
- [x] Require before/after evidence for a repair before closing the Plan step.
- [x] Preserve gameplay state and collision semantics while changing visual
      components.
- [x] Add success, failure, deterministic, migration, and rollback tests for
      every new observation and repair operation.

### P30 exit gate

- [ ] Close the subsequently discovered native-window gap: actual Release
      launch must present GPU frames without depth-attachment failure, preserve
      texture orientation/atlas/pivot, honor physical UI keys and preserve late
      lifecycle operations across single-Tick requests. New 14 Player/7 host,
      GPU-pixel and Studio split/continuous checks pass. Full check/P30 and
      installed candidate `81201a24…` (287 verified content hashes) pass;
      Copilot handoff has now been delivered in the installed `aa63a769…`
      audio follow-up; game direction/facing repair and replacement actual-game
      packages are pending. See
      `P30-NATIVE-PLAYER-WINDOW.md`.
      A read-only isolated-copy probe now confirms reversed Up/Down and four
      opposite art/velocity directions; original authority remains unchanged.
      Native access recovered after the owner closed Studio and the Computer
      Use session was reset (`R5-COPILOT-NATIVE-HANDOFF.md`). This actual-game
      exit remains open until the repairs and new packages are verified.

- [ ] Codex independently diagnoses and repairs all seeded visual, UI, audio,
      and package-resource defects using structured tools only.
- [x] Studio and Player reach the same required checkpoints and expose matching
      authoritative game state and resource identity.
- [x] No repair uses screen coordinates, DOM inspection, private renderer
      handles, direct JSON edits, or external development tools.
- [ ] Human observation confirms that evidence and suggested repair are
      understandable from Copilot and normal Studio panels.

## P31 — Copilot-completed Tank game

### Art direction and asset coverage

- [x] Create a versioned Tank art-direction Skill with palette, perspective,
      scale, silhouette, outline, transparency, atlas, UI, and prohibited rules.
- [x] Inventory every placeholder render/UI/audio state in the current project.
- [x] Create versioned asset briefs and a coverage matrix before generation.
- [x] Prefer reuse and batching when it preserves distinct asset identity.
- [x] Verify all nine prepared visual candidates against their brief, actual
      PNG metadata/hash, stable Agent job identity, and contained review path
      while leaving selection and project authority unset.
- [x] Load all nine current candidates in the real Electron Resource panel with
      preview, metadata, stable review controls, contained geometry, and no
      project-authority mutation from inspection.
- [x] Default the Resource panel to a counted `待审核` queue while preserving
      all 13 current and historical jobs behind explicit status filters.
- [ ] Produce reviewed resources for player, enemy, projectile, solid wall,
      destructible wall, ground, impact/explosion, and required UI.
- [x] Verify four actual-project imports (player, enemy, projectile,
      destructible wall), selected file hashes and Skill/Brief provenance in
      `P31-SUPERVISED-TANK-PROGRESS.md`; remaining asset coverage stays open.
- [x] Integrate those four images through internal-Copilot ChangeSets while
      preserving IDs, placement and colliders; inspect actual frames for the
      player, six enemies, spawned projectile and eight destructible walls.
      Remaining UI/effect placeholders and full-game acceptance stay open.
- [x] Integrate the fifth formal image as ground; fix its pre-existing rotated/
      undersized Transform after inspecting the actual frame. Verify the sixth
      image's complete solid-wall import provenance and stable-ID wiring;
      refine vertical crops and inspect the repaired actual boundary frame.
- [x] Import and wire the seventh image through a reusable VFX Prefab; verify
      six hit/destruction lifecycle and four impact assertions, and inspect
      fixture frames. Final actual-arena presentation remains open.
- [x] Import and wire menu background and UI atlas with full provenance. Replace
      world-space menu/HUD labels with registered UI Components through a reviewed
      internal-Copilot ChangeSet. Preserve old assertions and add eight UI checks;
      actual two-resolution frames expose overlap/unsupported-glyph defects, so
      final visual and interaction acceptance remains open.
- [x] Apply supervised muted/Help typography and HUD/button-separation repairs;
      verify 10 muted/Help, seven UI-safety and 13 UI-flow assertions, with actual
      menu detail frames. Actual end-screen defects are separately recorded and
      their reviewed repair does not yet count as visual completion.
- [x] Apply internal-Copilot pause/result bevel-spacing repairs with retained
      assertions; verify the post-layout 14-test / 96-assertion actual-project
      regression (`P31-SUPERVISED-TANK-PROGRESS.md`). All-state visual, audio and
      standalone-game acceptance remain open.
- [x] Fix the later shared HUD bottom inset and terminal SPACE restart defect
      through actual internal-Copilot ChangeSets. Preserve the failing terminal
      report, then verify lost/won SPACE and explicit R/ESC red-to-green checks;
      all 17 post-repair project tests / 107 assertions pass. This bounded repair
      does not replace the final revised-game recordings or independent human
      acceptance (`P31-SUPERVISED-TANK-PROGRESS.md`).
- [x] Reach and inspect actual Arena defeat and victory using internal-Copilot
      normal inputs (loss Tick 960; win Tick 2340, six enemies cleared, score
      600, HP 2/5). This does not close replay, restart or Player parity.
- [x] Add five actual UI-safety assertions; retain the initial failure and the
      targeted fix/rerun that clears hidden overlay labels without weakening tests.
- [x] Let actual Copilot adopt the canonical Scene-transfer SDK and implement
      twelve input/command transition assertions for volume/mute; verify the
      master-bus events as well as Component values. Verify a live one-Tick-per-
      request session matches the continuous checkpoint hash. Formal audible-
      output acceptance remains open.
- [x] Produce and route firing, hit, destruction, UI, and match audio required by
      the completed-game definition.
- [x] Verify the owner's named ElevenLabs credential through real internal-
      Copilot generation: one 10,032ms music candidate and one 522ms SFX source,
      each with one provider attempt and unknown cost preserved. Neither is
      selected or imported; see `P31-AUDIO-MASTER.md`.
- [x] Deliver bounded `asset.master_audio` through installed Studio and let
      original Copilot derive and inspect 200ms shooting and 10s music 48kHz
      PCM16 WAV candidates, preserving originals and exact processing provenance.
      Installed compiled-MCP review/import/rollback gates pass in isolation;
      these actual game candidates remain unselected and unimported.
- [x] Record the owner's explicit listening acceptance of the first music and
      shooting masters, select them in Studio, inspect/approve exact imports,
      and let original Copilot apply both; each isolated import passes 19 tests,
      246 assertions and rollback. No repeat provider calls; other SFX remain open.
- [x] Verify actual installed Studio candidate-card WAV/MP3 playback after the
      media CSP correction; check advancing playback clocks, contained geometry,
      blocked external media and unchanged candidate/project records. Full check,
      installation and owner-executable gate pass for `e3558835…`; this is machine
      UI acceptance, not independent listening (`P31-AUDIO-MASTER.md`).
- [x] Repair Scene replacement cleanup in the engine and verify the exact Copilot
      music/shot proposal against the installed host: 19 tests / 252 assertions,
      ordered entry/restart/exit audio events, retained preferences, deterministic
      replay and isolated rollback. Original Copilot subsequently applied the
      exact approved proposal and rechecked real playback/control events.
- [x] Record the owner's distinct acceptance of the 180ms hit WAV master
      `bfa2c741…`; retain its hash, source and measured metadata. Select it in
      Studio and let original Copilot apply the approved four-file import after
      19 tests / 252 assertions and isolated exact rollback.
- [x] Let original Copilot apply approved hit-event wiring `cd60a2db…`; verify
      real offensive/incoming/contact hit audio, five repeatable event replays,
      exact rollback, and all 19 post-apply reports / 252 assertions against the
      reviewed module/state/audio identities (`P31-AUDIO-MASTER.md`).
- [x] Record the owner's acceptance and native Studio selection of the 680ms
      wall-break WAV `1ccd17c3…`; approve exact import `4e986416…` only after
      19 tests / 252 assertions and isolated rollback
      (`r5-audio-import-review-1Dq6sl/summary.json`).
- [x] Record the owner's separate acceptance and native Studio selection of
      100ms UI-navigation WAV `2706693b…`; verify exact import `3a881629…`
      with 19 tests / 252 assertions and rollback before approval
      (`r5-audio-import-review-Rn16Ye/summary.json`). Original Copilot applied
      import and separately reviewed contextual provenance `e7371f19…` after
      owner Studio restart; exact applied files pass read-only audit.
- [x] Let original Copilot apply UI-navigation wiring `33af40be…` after exact
      transaction/rollback, 19 tests / 252 assertions and 11 deterministic
      runtime probes; verify reviewed revision `7a2364ff…` and actual module
      hash (`r5-ui-nav-wiring-applied-audit-aURXr7/summary.json`). This covers
      help/settings/pause/mute/volume, not all remaining UI or match sounds.
- [x] Let original Copilot apply the approved wall-break import and verify
      destruction-specific event wiring, retained playback controls and exact
      rollback. Candidate acceptance alone does not close sound coverage.
      The import and provenance are now applied; first wiring `4f6331a6…` was
      rejected after its new fixture failed at Tick 0. Structured reviewer
      feedback was consumed by original Copilot. Replacement `f1a02d7e…`
      passes 20 tests / 255 assertions, destruction/nonfatal/idle audio probes
      and exact rollback, then was applied by original Copilot. Actual revision
      `77be28e9…` and persisted runtime result match review
      (`r5-wall-wiring-decision-Nmlh4l`, `r5-original-ui-wall-reports-E9pwlT`).
- [x] Reproduce and fix custom AudioBus control in an isolated executable
      regression; continuous/split/restart/Scene cleanup, observation errors,
      legacy default and 12 invalid arguments pass (`P24-AUDIO-CONTROL-BUS.md`).
- [x] Install combined Bus/provider repair `ae576cfe…` after uninterrupted full
      regression and installation/upgrade/recovery gates; verify 287 content
      hashes, preserve the old installation, and pass the installed Tank-copy
      Bus probe without modifying original game files.
- [x] Let original Copilot apply the exact approved SDK/custom-Bus migration
      `5003f5bc…`; verify actual revision `20eff586…`, all 19 reports / 252
      assertions and source/state/audio identities against isolated review.
- [x] Revalidate actual loss/mute/restart observations: current-revision logs
      `f4df3d42…` (84 Ticks) and `07b9b5c3…` (2233 Ticks) pass both resolutions
      with zero failed/missing audio or diagnostics, matching full audio/frame
      identities and declared buses. Read-only audit `r5-runtime-audio-audit-UX50k7`
      also rejects an invalid-Bus negative (`P24-AUDIO-CONTROL-BUS.md`).
- [x] Store all selected and derived asset provenance in project authority:
      the original Copilot's 19 imports (nine images, ten audio masters) at
      `1e75c91b…` pass read-only source/candidate/review/import, Skill/Brief and
      mastering-chain checks (`r5-imported-provenance-audit-GouZvF`).
      Context annotations distinguish post-import linkage from provider inputs.

### Project transformation

- [x] Replace required Shape2D/debug presentation with Sprite2D or other
      resource-backed components.
- [x] Update reusable tank, projectile, wall, and effect Prefabs instead of
      duplicating Scene-local wiring.
- [ ] Preserve stable object, Component, collider, command, event, and test
      identity where semantics did not change.
- [x] Complete menu, controls/help, HUD, pause, win, lose, and restart
      presentation.
- [x] Add visible and audible firing, hit, destruction, scoring, and match-state
      feedback.
- [x] Make volume and mute controls effective: normal-input short-flow event
      sequence and state checks pass at `d7ea102d…`, including 80→70→80,
      mute/unmute and retained settings after returning to Menu
      (`r5-final-checkpoint-audit-A6qL3A`).
- [ ] Remove required fallback shapes, missing references, dead resources, and
      placeholder copy from the release path.

### Verification and packaging

- [x] Add executable semantic-ID snapshot assertions and reject prose-only
      assertions; prove wrong expectations and missing targets fail in an
      isolated runtime fixture (`check:p31:assertions`).
- [x] Deliver `fitsUiContent` through the installed Engine MCP and have the
      actual Copilot author two-resolution glyph/interior assertions for Tank.
      Source, compiled MCP and 21 runtime cases / nine malformed cases pass;
      full regression, packaged-runtime tests and all 287 owner-install content
      hashes pass for `383d6b45…`; the owner installation re-passed the probe.
      Copilot authored 76 containment checks. After rejected overflow/timing
      proposals, ae7 passes isolated 19 tests / 244 assertions and sixteen frame
      reviews for containment; spacing polish remains separate. Engine correction
      `6c4d0ffc…` passed full check, package/upgrade/recovery, 287 install hashes
      and 28 installed-runtime / nine malformed cases plus compiled MCP calls.
      Original Copilot applied ae7 and ran all 19 real-project tests / 244
      assertions, including all 76 containment assertions. The read-only audit
      verifies eight approved file hashes and fresh durable results at revision
      `aff3a275…`: `artifacts/r5-applied-ui-audit.json`.
- [x] Apply the independently reviewed row-spacing follow-up through the
      original Copilot and verify actual fresh tests. The five-file 5820 batch
      passes 19 tests / 246 assertions at `17ae462e…`, retaining 76 containment
      assertions (`artifacts/r5-applied-spacing-audit.json`). The isolated
      red/green row-gap audit measures Menu 8.96 / 6.72px and result score to
      actions 8.8 / 6.6px at 1280 / 960. Six changed frames were inspected;
      ten unchanged frame hashes match the prior review. Updated actual battle
      logs are verified below; full audio and independent acceptance remain open.
- [x] Deliver durable MCP test feedback to the owner installation, excluding
      scene fixtures from runnable discovery and preserving historical outcomes
      after reload. See `P31-TEST-REPORT-FEEDBACK.md`.
- [x] Deliver current-revision ZIP verification to both Copilot and the Build
      panel, with trusted Player startup, native PNG receipt and negative gates.
      See `P31-PACKAGE-VERIFICATION.md`.
- [x] Run project validation and missing/dependency reference scans: final
      `d7ea102d…` source passes Doctor and entry-scene validation on an isolated
      copy; both actual build reports have all 19 assets / six Prefabs reachable
      with no orphaned assets. See `P31-COMPLETED-PROJECT-HANDOFF.md` and the
      full package/replay evidence for the scope of these checks.
- [x] Run movement, firing, collision, damage, friendly-fire, score, win, lose,
      pause, restart, and scene-transition tests: all 22 actual tests / 276
      assertions pass at `d7ea102d…`, with exact read-only report audit
      `r5-final-audio-runtime-audit-8y05cB`.
- [x] Replace descriptive-only game assertions with executable state checks;
      prove a deliberately wrong pause/UI expectation fails the test gate.
      Actual failed report `83197d48e98fdfc1fc5c75af` and recoverable fixture
      cleanup `59f82829-e10e-43a3-89bb-7e319e0aa02b` are documented in the
      supervised Tank evidence. Final full-game regression remains open.
- [x] Run deterministic Replay and repeated-state-hash gates after visual/audio
      changes: all 22 reviewed tests repeat identically in state and audio;
      three terminal/impact probes remain exactly once through 600 Ticks,
      with original post-apply reports matching (`r5-final-audio-wiring-review-wRNIdM`).
- [x] Capture and review required menu/game/pause/win/lose frames and audio
      evidence: three long routes plus six short-flow checkpoints at the final
      revision; see `P31-FINAL-PLAY-EVIDENCE.md`.
- [x] Compare required Studio and Player checkpoints: all nine checkpoints
      pass both resolutions with identical frames, state, drawables and full
      audio, not only matching clip IDs. Final Dev/Release identities pass
      `r5-final-package-identity-7P3Z4Y`.
- [x] Build and run Development and Release packages without Studio:
      final audio-complete `d7ea102d…` archives pass independent extraction,
      68/26 content hashes, 19 assets, native startup and all three normal-entry
      long replays in both profiles. State, both viewport PNGs, drawables and
      full audio match pinned original Player observations
      (`r5-recorded-package-review-JHDlG8`, `P31-FINAL-PLAY-EVIDENCE.md`).
      Network-isolated and independent human play remain separate gates.
- [x] Verify the current pre-audio Development/Release ZIPs independently:
      extract actual archives, validate all 50/16 content hashes, six Prefabs
      and nine formal images, and replay normal-entry victory (952 Ticks), loss
      (1312 Ticks) and muted restart (1320 Ticks) at revision `17ae462e…`.
      Both profiles match all recorded states and both viewport PNGs without
      Node/Codex/provider environment; each passes native five-frame GPU
      startup. Evidence: `artifacts/r5-recorded-package-review-or8dUZ/summary.json`
      and `P31-SUPERVISED-TANK-PROGRESS.md`. The final audio-complete package gate
      above supersedes this earlier proof; neither claims isolated-network or human play.
- [ ] Verify resource reachability, licenses/restrictions, provenance, secret
      absence, and offline startup in package contents.

### P31 exit gate

- [ ] One high-level Copilot Goal produces the completed Tank definition with a
      visible Plan and uninterrupted audit chain.
- [ ] The game is visually coherent and no required gameplay object remains a
      debug rectangle or missing-resource fallback.
- [ ] Required controls, gameplay, UI, sound, win/lose, and restart work in
      Studio and standalone Player.
- [ ] All automated tests, Replay, resource, visual/audio checkpoint, and
      package gates pass.
- [ ] A human plays the complete loop and accepts the selected art/audio.

## P32 — Durable Goal recovery, budgets, and quality gates

- [x] Persist stable relationships between Goal, Plan step, tool call, job,
      approval, candidate, ChangeSet, runtime session, test, build, and package.
- [x] Reconcile durable state before resuming an interrupted Goal.
- [x] Preserve explicit Plan states, per-message boundaries and automatic Goal
      turn identity; unchanged stream events do not rewrite checkpoints or
      inflate attempts (`check:p32:progress`).
- [x] Restrict explicit owner-paid-generation grants to their exact project,
      thread, active Goal and linked Completion Run; preserve default policy
      for old jobs, other projects, expiry and revocation.
- [x] Expose approved-only `change.apply` to MCP with content-hash and
      duplicate-application protection; do not expose `change.approve`.
- [x] Exclude Windows root-directory Git/local-state notifications from
      authoring refresh, preserve atomic ChangeSet reads during replacement,
      and keep Goal controls usable with 2,000 transcript messages
      (`check:p32:progress`, `check:p32:changeset`, installed P15 quality).
- [x] Return compact ChangeSet/test discovery with explicit full-evidence
      reads; make failed tests visible as MCP errors, keep earlier test reports,
      and reject false `tested` ChangeSet outcomes (`check:p32:agent`,
      `check:p32:changeset`).
- [x] Complete the desktop rejection-reason workflow and version-bound atomic
      feedback, including legacy supplementation, conflict draft recovery and
      live review-list refresh without authoring/Git refresh. Full `npm run check`,
      `check:p32`, real P15 quality and isolated installed lifecycle pass for
      candidate `dbf2197c…`; all 287 content hashes match. Owner delivery and
      original Copilot consumption remain separate evidence.
      See `P32-CHANGESET-REVIEW-FEEDBACK.md`.
- [x] Deliver the reviewer UI candidate to the owner installation and verify
      the original Copilot reads the wall rejection feedback, proposes a passing
      repair and applies only approved game content. Archive `dbf2197c…`,
      287-file identity and 20-test runtime parity: `r5-review-feedback-owner-check-2gRhYr`;
      actual installed P15/P32 UI: `r5-installed-review-ui-DI96Ov`.
      Old installation is recoverably backed up; P33 remains open.
- [x] Hydrate 20 summary turns at a time, resume without full history, and
      explicitly load older conversation pages; verify retry, deduplication,
      latest Plan preservation and zero eager clones for 2,000 invalidations
      (`check:p32:progress`, P15 real Electron history-control assertions).
- [x] Relink an approved and applied replacement import only after validating
      candidate, review decision, manifest and file hashes; preserve rollback
      and prevent unapproved proposals from becoming imported (`check:p29:import`).
- [x] Resume after Studio/Codex restart during provider execution.
- [x] Resume while waiting for provider approval.
- [x] Resume while waiting for candidate selection.
- [x] Resume while waiting for ChangeSet approval.
- [x] Resume after runtime crash, test failure, and build failure.
- [x] Stop an active Goal without deleting jobs, audit, costs, or applied
      project changes.
- [x] Remove only completed/cancelled Goal presentation without deleting project
      or audit authority.
- [x] Bound retries and backoff; distinguish retryable and terminal failures.
- [x] Reject duplicate provider idempotency keys and duplicate ChangeSet apply.
- [x] Keep budget totals stable across retry, cancellation, rejection, and
      restart.
- [x] Verify unrelated concurrent human edits survive repair and rollback.
- [x] Run clean-profile credential, network, outbound-data, crash, package,
      migration, and performance gates.

### P32 exit gate

- [x] Every named interruption point resumes or terminates with an honest,
      actionable state.
- [x] No provider request, import, ChangeSet, test, build, or package side effect
      is repeated because of restart.
- [x] Stopping and removing Goal UI cannot erase required evidence.
- [x] Security inspection finds no credential or private provider response in
      authoritative project or release artifacts.

## P33 — Independent Copilot completion and 0.4.0 Preview

- [x] Preserve the owner checkout while fixing a byte-identical isolated source
      snapshot; reject stale/dirty/wrong-version archive bindings and verify
      the exact second clean checkout. See `P33-RELEASE-SOURCE-PROCESS.md`;
      actual snapshot `f41d6c02…` is qualified as documented below.
- [x] Build the signed or hash-pinned Studio candidate from a clean checkout:
      `2ede62d7…`, 289 files, full check, applicable R5 gates and source-bound
      eligible kit pass. See `P33-CLEAN-CANDIDATE-EVIDENCE.md`, including the
      separate nine-PNG foundation test inputs and retained missing-input failure.
- [x] Prepare a role-separated participant package and observer evidence kit.
- [x] Assemble the local candidate delivery with Studio, completed project,
      both game archives, hash manifest, source bundle, external test inputs
      and machine logs: `artifacts/r5-delivery-0.4.0-preview.1-6Pcp3b`.
      This is not public release or independent human acceptance.
- [ ] Use a clean Windows profile and a participant who did not implement Round 05.
- [ ] Provide only installed Studio, placeholder Tank project, canonical task,
      test budget, and written observation instructions.
- [ ] Execute Journey A: Goal/Plan and tool-state comprehension.
- [ ] Execute Journey B: media generation, approval, comparison, selection,
      transactional import, and rollback.
- [ ] Execute Journey C: complete Tank transformation, verification, and repair.
- [ ] Execute Journey D: interruption, restart, resume, cancellation, and budget
      integrity.
- [ ] Execute Journey E: standalone build, clean-machine play, package/security
      inspection, and close/reopen continuation.
- [ ] Record every hesitation, wrong turn, forbidden workaround, human gate,
      coaching event, cost, job ID, ChangeSet ID, test/build ID, and artifact
      hash.
- [ ] Fix every blocker and repeat the affected journey with a new clean profile.
- [ ] Publish the limitations, evidence index, Studio package, completed Tank
      packages, and SHA-256 hashes.

### P33 exit gate

- [ ] The participant completes the canonical high-level goal without coaching,
      terminal, external IDE, engine checkout, direct file repair, DOM access,
      or screen-coordinate automation.
- [ ] Human activity is limited to product direction, configured provider/cost
      approval, candidate review, ChangeSet review, normal play, and explicit
      stop/cancel decisions.
- [ ] The finished project and both standalone packages pass the completed-game
      definition and evidence validator.
- [ ] No blocker remains open in the Round 05 human observation board.
- [ ] Every checked implementation item links to machine or signed human
      evidence.

## Per-capability completion record

Use this record for every capability introduced or completed in Round 05:

- [ ] Human operation and wait state are discoverable and effective.
- [ ] Project/local authority boundary is documented and versioned.
- [ ] Query result reports effective state with stable semantic IDs.
- [ ] Agent action is available through Engine MCP and a project Skill.
- [ ] Durable mutation uses ChangeSet preview, validation, audit, and rollback.
- [ ] Provider/network/cost/idempotency behavior is explicit where applicable.
- [ ] Success, failure, cancellation, retry, restart, and migration tests pass.
- [ ] Runtime and visual/audio evidence prove the claimed outcome.
- [ ] Secrets, private responses, and unreviewed candidates remain outside
      project authority.
- [ ] Required clean-profile human observation passes without coaching.
