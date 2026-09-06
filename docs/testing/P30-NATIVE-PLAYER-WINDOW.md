# P30 native Player window follow-up

Status: engine repair, full regression/P30 and verified Studio installation
complete at the scope recorded below. Actual-game direction/facing defects,
Copilot handoff and replacement game ZIPs remain open. This is supervised
engineering, not P33.

## Failure that the old gates missed

Actual Release ZIP `13011e00…` passed native simulation and PNG replay, but its
ordinary `Tank.exe` exits with status 101 before exposing a usable game window.
Captured stderr reports a wgpu validation failure: the render pass has a
Depth32Float attachment, while `generic-player-sprite-pipeline` declares none.
The primitive pipeline has the same mismatch. The software PNG observation
path does not execute these GPU render pipelines, so its matching hashes do not
establish a working surface/window. Neither does `--verify`.

After that mismatch is repaired, the real window exposes upside-down sprites:
texture V and the authored top-origin pivot were used as Y-up coordinates.
Normalized atlas regions were also divided by pixel dimensions a second time.

The original native key router also returns `None` for the project's P/H/O/M
and bracket bindings. The new isolated Rust regression first fails on KeyP:
actual `None`, expected `toggle-pause`. Semantic replay bypasses physical key
translation and therefore had not detected this defect.

A further live-window defect occurs after pressing P: combat freezes but no
pause overlay appears. Presentation-phase systems queue lifecycle changes
after post-update; each one-Tick host request discarded that queue. The same
problem kept Menu Help/Audio buttons visible on their detail pages. This is an
engine continuation defect, not an excuse to rewrite the actual game's logic.

## Repair and new required gate

- Match the depth attachment in both painter pipelines without enabling depth
  writes or changing the existing 2D/UI painter order; preserve 3D depth testing.
  This follows the [wgpu depth/stencil contract](https://docs.rs/wgpu/30.0.1/wgpu/struct.DepthStencilState.html).
- Route the missing UI keys and common letter/digit bindings to authored semantic
  actions. Do not intercept Q when a project binds it. Escape remains a game
  action, and generated package instructions no longer falsely describe it as
  forced exit.
- Add bounded `--smoke N` (1–120 presented frames) to the actual window path.
  Count successful surface presentations only after runtime startup; surface
  timeouts/occlusion do not count. Initialization/render/runtime errors, early
  close and a 30-second deadline fail instead of reporting success.
- Require five actual GPU-presented frames for every P20 example package,
  covering primitives, sprites and 3D meshes. Run Player unit tests as part of
  `check:p20:release`, not merely source-marker checks.
- Read back the actual swapchain frame under bounded `--smoke-capture`, failing
  explicitly on unsupported copy/format. A three-sprite asymmetric RGBA fixture
  checks ten real GPU pixels for normalized/pixel atlas crops, top/bottom
  orientation, a noncentral pivot and UI texture orientation. The dedicated
  `check:p30:window` gate runs in P30 and P20 (debug/release respectively).
- Carry `pendingLifecycle` through the host result, Studio session, native
  one-Tick Player and independent bounded Player comparison. Keep next-post-update
  timing and semantic payloads; stop/restart clears the queue. Require the queue
  in private Player continuation, and reject malformed queues. Add red/green
  native lifecycle tests (first failed: no returned queue, expected four entries),
  late Scene-switch/reset checks, a real PlayerApp step test and Studio
  split/continuous snapshot parity (`check-p30-lifecycle-continuation.ts`).

The 14 Player and 7 script-host unit tests pass after the continuation repair.
Studio 7-Tick execution split into `[1,1,2,3]` matches every continuous snapshot
and final state/queue; stop/restart checks pass. Typecheck passes. The ten-pixel
GPU gate is rerun successfully with frame
SHA `0c684bc5085c02ad5a37bcac4f92043f4c536ee2e7f5c0a5af050349637265c0`.
Its initial fixture omitted an explicit camera, placed the world samples outside
the default camera and failed; that failed capture is retained under
`artifacts/verification-temp/aigame-native-window-itvzBi`. The corrected fixture
declares its camera rather than weakening the pixel expectations.

The first repaired debug Player renders the unchanged actual Tank package for
five frames/six Ticks with zero stderr. It has 14 Menu drawables and reports
`renderer=wgpu-surface`. A separate diagnostic copy opens a real Menu; H enters
Help, Escape returns without exiting, O enters Audio and M displays MUTED.
The Help/Audio panel's text still touches the decorative top edge in this GPU
window before UV correction; final visual acceptance is not inferred from
these input checks. The corrected native Menu GPU frame is preserved as
`artifacts/r5-native-menu-gpu.png`; normal UI/gameplay/resize inspection remains.

After lifecycle repair, the unchanged actual package opens a normal Menu;
SPACE starts Arena, P displays PAUSED with resume/help/audio controls, H switches
to FIELD MANUAL with only its BACK control, and O switches to AUDIO with only
its BACK control. These are real keyboard/native-window observations, not
injected UI state or software screenshots. The Audio help line still crowds the
decorative frame; Copilot must review the actual layout after engine handoff.
This is not proof of formal audible SFX (the package still contains none).
M switches the icon and label to MUTED; bracket-left followed by M shows VOLUME
70% from 80%. Maximizing the native window preserves the rendered scene and
overlay without a surface error; Escape returns to Menu without exiting.

Read-only post-inspection identifies a separate actual-game integration risk:
`input-router.ts` maps move-up to negative Y although the native 2D render plane
is Y-up, and both movement/weapon systems use `atan2(y,x) + PI/2` for art whose
visible barrel is upward at zero rotation. The expected forward-art relation
is therefore suspect after texture correction. Copilot must verify four-way
screen movement, barrel facing and muzzle/projectile direction with real
runtime evidence, then propose any necessary game-only repair. This is not an
engine-coordinate redesign and has not yet been counted as a verified repair.
Any authoring change invalidates earlier log revisions; fresh recorded wins,
loss/restart and rebuilt actual ZIPs are required afterward.

The preceding full `npm run check` finished successfully for Studio ZIP
`b4c30e4d25c37d24ca19d2d81fc88c52a3129890be5762b8052eb781f5545b2d`
(288 content files; 100 Tank runs in 34,660.27 ms), before the new window gate.
It did not replace the running installation and cannot validate this repair.
An exploratory strict all-target Player Clippy run exposes existing broad
lint debt and does not pass; it must not be reported as successful.

The later full-regression/install record below supersedes the source-only
checkpoint. Still required: Copilot-created game repairs, replacement game ZIPs,
and their renewed verification. Formal SFX and P33 remain separate open gates.

## Full-regression candidate

`npm run check` now exits 0 with all new native/lifecycle tests and real GPU
launch checks. P20 runs each of Pong, collect-room-3d and Tank 100 times with
one state hash per example, then presents five real GPU frames from each
independent package. Tank's batch takes 36,370.69 ms. Release/debug asymmetric
texture checks share the ten-pixel frame SHA recorded above.

The separate candidate archive is
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-native-window-check-win-x64.zip`,
SHA-256 `81201a24477494c94c64ae356a12bf026c89687fe4b7bd333b346a07933481c4`.
All 287 content hashes (288 files including the build manifest) are verified.
Clean/updated installation, real Electron quality and crash recovery pass.
The full P30 phase gate also exits 0, including 551-Tick independently continued
Player/Studio parity, malformed/stale log rejection and the real Electron
observation panel. The original Studio is closed normally; its installation is
preserved as `AI-Game-Studio-0.3.0-preview.1-r5-pre-native-window-backup-20260905-win-x64`.
The verified candidate is copied to the canonical installation, all 287 hashes
are checked again and the new Studio is launched. Actual-game Copilot handoff,
game-only findings, fresh recordings and replacement archives remain open.

The first two helper-spawn attempts used `windowsHide: true` and left the
interactive Studio invisible; the second had an active broker listener but no
visible window. Only those known newly launched processes were stopped, with
no configuration/cache deletion. Normal interactive launch through the native
app launcher shows the verified Studio and its existing recent-project list.
The isolated startup profile `artifacts/verification-temp/r5-normal-start-xYJ7BD`
is retained; it contains no copied owner credential vault or game project.

## 22:10 isolated actual-game direction diagnosis

The supervisor's `artifacts/r5-direction-review.ts` copies the original project
without agent/local state, credentials or build output and verifies the copy
against project revision
`a33717f43878300f9615bfe02b187a8c12589b7814e448547bf141c5e03b2e8a`.
It runs the installed script host and Player; original authority has the same
revision afterward. There is no actual-game edit, injected Scene override,
synthetic win/loss, ChangeSet application, paid call or new Copilot turn.

Each five-Tick scenario starts the authored Menu with normal primary input,
presses one direction at Tick 2 and fires at Tick 4. Results and 1280x720 software
frames are retained under `artifacts/r5-direction-review-xyr0lE`.

| Input | World displacement | Screen displacement | Correct screen direction |
| ----- | ------------------ | ------------------- | ------------------------ |
| Up    | Y −0.25            | Down 0.25           | No                       |
| Down  | Y +0.25            | Up 0.25             | No                       |
| Left  | X −0.25            | Left 0.25           | Yes                      |
| Right | X +0.25            | Right 0.25          | Yes                      |

The inspected sprite art points upward at zero rotation. In all four scenarios
its transformed forward vector has dot product −1 with movement direction;
the projectile sprite forward vector also has dot product −1 with velocity.
Up/right frames visibly show the projectile behind the tank's illustrated
muzzle. This confirms the previously suspected game integration defect, not a
change to the engine's Y-up convention. The existing smoke assertion expecting
move-up to produce Y −1 encodes the wrong screen semantics; Copilot must update
that obsolete expectation with a documented direction correction and retain
combat/difficulty assertions. Current victory/restart logs must be regenerated
after the actual revision changes.

The initial six-Tick probe asserted a live projectile too late: the Tick 4
projectile naturally hit wall-8 and was removed at Tick 5. The failed result
remains in `artifacts/r5-direction-review-pzbAqd`; the revised five-Tick probe
observes the actual spawn before that collision, without disabling collision.

Current orchestration limitation: two attempts to capture/activate the returned
Studio window fail with `foreground window did not report a process id`.
Computer Use is stopped after its prescribed recovery. The compact original
Copilot snapshot is unchanged at revision 102/latest completed turn
`01a071b5-08db-7453-9d2c-3f8e461c4173`; no handoff was sent. The running main
process exposes an asset-only broker, not a supported conversation-control
endpoint, so no private UI/IPC injection or competing agent is used to bypass
this limitation. Prepared handoff: `R5-COPILOT-NATIVE-HANDOFF.md`.

Recovery update, 2026-09-06: after the owner closed Studio, audio follow-up
`aa63a769…` was safely installed with all 287 content hashes verified. Resetting
the stale Computer Use session restored current-window discovery. The original
Copilot received the handoff, independently reproduced the direction defect,
and applied its reviewed replacement `3700cba2…`. The supervisor verified nine
applied file hashes and the actual cardinal test; see
`P31-SUPERVISED-TANK-PROGRESS.md` for the rejected-test precision defect and
isolated red-to-green evidence. Actual after-frames, UI repair, new combat logs
and replacement game packages remain required; earlier paragraphs retain the
pre-recovery diagnosis and are not current orchestration status.
