# P21 deterministic Scene transfer — 2026-09-05

## Follow-up: resumed same-Scene reload

The real Copilot Arena run reaches a loss at Tick 960, but a subsequent
`match-restart` queues/applies Scene loading while retaining the dead world.
The supervisor independently reproduces the engine bug with an isolated test:
mutate a runtime-only field at Tick 2, then reload the same Scene at Tick 3.
Continuous execution restores authored defaults; single-Tick resumed execution
incorrectly retains `damaged-live-world` and has a different state hash.

The cause is `ProjectScriptRuntime.run` replacing the authored Scene-library
entry with the resumed live world. Live state already has a separate `scene`
field in the native request. The fix keeps the Scene library authored and
loads a missing active fixture from its source path, while preserving the live
world exclusively in that separate field. No actual Tank game logic is changed.

The regression now verifies every continuous/resumed snapshot after damage,
same-Scene restart, return-to-menu and re-entry, while preserving explicit
volume/mute overrides and lifecycle audio events. The initial assertion failure
is retained in the task transcript. The targeted P21 transfer test and P30
bounded-advance test both pass after the fix. Complete `npm run check` and
`npm run check:p30` subsequently pass, including the installed/upgrade/recovery
gates. Windows ZIP SHA-256 is
`8798eef9e3248e6d0a5843c8955c616bde42c5ba879af7f707b1f091bff3e30f`;
all 287 content hashes match the canonical installed copy. The old executable
tree is recoverably retained in
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-pre-restart-backup-20260905-2004-win-x64`.
The original Studio Copilot session resumes on this version and acknowledges
the restart/inset-layout handoff. Its actual-game rerun remains separate from
the passed engine regression.

The fixed source also passes a read-only diagnostic copy of the actual Tank
project (UI SHA-256
`0f8078f5f8ef17552025c65ac6412f351226b7557d03746b8f69b82e8e22564a`).
Normal movement inputs and 200-Tick batches reach `lost`, elapsedTicks 780,
at checkpoint 800. A normal `match-restart` input followed by three Ticks now
restores authored player `tank:object/arena/player`, six enemies, score zero
and `playing`, elapsedTicks 2. Final state hash is
`bf29ff587c9fe708c0602253179e56fc68d6381b4cf4f5dcbb93e4c0eb11e15a`.
The copy is retained in `artifacts/r5-restart-review-Gw0yS2`; all checked actual
game source hashes are unchanged. This is not the still-pending installed
Copilot restart acceptance.

The installed original Copilot subsequently completes that actual-game retest.
Loss followed by `match-restart` at Tick 1613 yields Tick 1616: `playing`,
elapsedTicks 2, player alive / HP 5/5, six enemies and score zero. The UI state
retains `muted: true`, `volume: 80`; lifecycle emits `set-muted=true` at 1613.
State hash: `5adf631623a5d8779170f1cb94c95e731af553198e3a854630ba52bae9f7d81c`.
The supervisor checks actual runtime JSON and the 960x540 PNG:

- 960x540 observation `5599e9a1395bb65103bbfcd3`, PNG
  `9bfd97859a775978c2853bca508d268767cf5f27c9d0b03de1209a3966876674`;
- 1280x720 observation `ed8da4293ee16607314e4388`, PNG
  `f772fe1903e9ba11d6c0d64bc2e8e0312aa68aa090ca229406cd7744b432fdfc`.

The installed same-Scene restart defect is resolved, but bottom HUD decorative
border overlap, long Player parity, formal sound and P33 remain open.

## Original transfer implementation

The supervised R5 Tank proposal `c0fde8d7-2f68-42d2-bfe8-2c2cbcc22849`
stored volume/mute in a mutable module-level variable. It was rejected without
application: runtime requests can recreate modules, so continuous execution
alone cannot establish resumed/Player correctness. The supervisor changed the
engine and isolated fixtures, not the actual Tank project.

`loadScene(scene, { componentOverrides: [{ objectId, componentId, data }] })`
now shallow-merges selected data into the destination Scene before its behavior
lifecycle. Destination IDs and unmentioned fields are preserved. This is not a
global heap, a disk save, automatic persistence, or a project-file mutation.

`scripts/check-p21-scene-transfer.ts` first failed at transition Tick 1:
expected volume 0.4, actual authored default 0.8. With the engine implementation
it passes:

- menu → arena → arena restart → menu retains volume 0.4 and mute true;
- destination `onStart` emits the transferred audio values, not defaults;
- destination IDs/default fields and original project files remain unchanged;
- caller mutation after queuing cannot alter the copied transfer;
- single-Tick resumed requests match every continuous-run snapshot hash;
- ten repeated runs match snapshots and audio events;
- missing objects/components, duplicate targets and malformed options/data fail
  without committing a partial Scene switch;
- one-argument `loadScene` retains its original authored-default behavior.

The P21 SDK signature check was updated for the backward-compatible optional
argument. Both P21 test scripts pass; TypeScript checking and the four updated
gameplay Skill validators pass. Full `npm run check` passes against the isolated
`r5-scene-transfer-check` package output, including P20 clean packaging,
installed lifecycle, UI and crash-recovery checks. ZIP SHA-256:
`766d3897f55b98323f9f39ced3dc21477153991a3c6f87df60b6717dfff3da76`.
All 286 manifest-listed file hashes were verified before and after copying to
the canonical Studio installation. The previous installation was closed normally
and retained in `AI-Game-Studio-0.3.0-preview.1-r5-prefab-backup-20260905-0917-win-x64`.
The new installed Studio starts successfully. Actual-project adoption and audio
verification remain Copilot work; this file does not claim Tank audio is fixed.

## Bitmap audio-control glyphs

An actual R5 frame exposed the percent-sign fallback; audio help also uses
square brackets. A new Player unit test first failed for `%`, then all ten
Player unit tests pass after adding `%`, `[` and `]`. `check:p24:ui` passes its
menu/HUD/pause/win/lose projection and input checks. The game has temporarily
used `PCT`; no actual Tank source was modified by this engine repair.
