# P24 complete minimum 2D evidence

- Date: 2026-09-03
- Engineering status: machine gate passed
- Human exit status: open; Journey B has not been executed by an independent participant
- Command: `npm run check:p24`

## Delivered runtime slice

The same versioned project files now drive the persistent Studio session,
headless runtime, and native Player:

- `render:camera2d` supplies the orthographic world camera and viewport scale;
- `render:sprite2d` supplies texture, size, pivot, tint, nearest/linear filter,
  layer ordering, and optional atlas region;
- PNG, JPEG, WebP, and static SVG decode to RGBA and upload through wgpu, with
  snapshot-keyed caching and release when a resource is no longer reachable;
- `physics:collider2d` and `physics:rigidbody2d` produce deterministic AABB
  enter/stay/exit records with object IDs, Collider IDs, normal, contact point,
  sensor flag, and Tick;
- semantic keyboard/pointer actions come from `input/actions.json` and UI
  buttons emit those same actions;
- versioned AudioEvents drive HTMLAudio in Studio and rodio in Player, including
  WAV/OGG decode, buses, volume, mute, loop, one-shot, pause, resume, and stop;
- `ui:text`, `ui:image`, and `ui:button` cover menu, HUD, pause, win, lose, and
  restart states in the fixed 1280×720 UI coordinate space;
- the Windows packager walks reachable Scenes, Prefabs, scripts, and manifest
  resources, excludes orphans, and reports structured orphan diagnostics.

Static SVG support uses the pure-Rust `resvg` pipeline at package runtime; it
does not ask the browser or Studio DOM to render Player sprites.

## Tank Arena proof

`examples/tank-arena` is no longer the Round 03 color-block demo. Its project
files now contain a primary Camera2D, manifest-backed tank Sprite2D resources,
three moving enemies, a player with a direction and fire cooldown, runtime-
spawned projectiles, physical trigger contacts, score/armor state, menu/HUD/
pause/win/lose/restart UI, SFX/UI buses, and project TypeScript behaviors.

`check:p24:tank` proves:

- initial menu and semantic Start button projection;
- project pause freezes enemy simulation and shows the Pause UI;
- three physical projectile contacts remove three enemies and produce score
  300, `YOU WIN`, and seven audio events;
- an unattended enemy reaches the base trigger and produces `GAME OVER`;
- two complete runs produce state hash
  `42c703a9d77addfdd31f490050469f15377bee83dcb6c2b3b68b02bc4d10b44b`;
- a 250 + 310 Tick segmented run matches the continuous 560 Tick run;
- the persistent QuickJS host resets its 25-second safety deadline for every
  run instead of inheriting a deadline from process creation; a timeout is now
  reported as `SCRIPT_HOST_TIMEOUT` rather than an opaque host failure;
- a missing Sprite2D asset returns `RUNTIME_RESOURCE_REFERENCE_MISSING` with
  the missing texture reference in structured details;
- the Development package contains exactly the four reachable Tank resources;
- native Player verification decodes one SVG, loads four script modules, and
  consumes projection protocol `3.0.0-preview.1` without external dependencies.

The checked-in demo resources record their generated source, prompt hash,
candidate hash, `reviewedBy: codex`, and review timestamp. The built-in local
generator remains test-only; this evidence does not claim completion of P26's
external provider requirement.

## Gate results

| Probe               | Result | Key proof                                                                          |
| ------------------- | ------ | ---------------------------------------------------------------------------------- |
| `check:p24:physics` | passed | enter/stay/exit; continuous = segmented hash; no injected collision                |
| `check:p24:sprite`  | passed | native decode/upload, pivot/tint/filter/layer/atlas, cache/release, orphan pruning |
| `check:p24:audio`   | passed | six AudioEvent actions, HTMLAudio + rodio, Player decoded WAV                      |
| `check:p24:ui`      | passed | menu/HUD/pause/win/lose projection and Studio/Player pointer paths                 |
| `check:p24:tank`    | passed | playable loop, deterministic package, per-run QuickJS deadline reset               |

## AI-operability evidence

The capability registry exposes Camera2D, Sprite2D, Collider2D, RigidBody2D,
UI, and Audio Source fields to the Inspector and `component.types`. Engine MCP
provides project/Scene/component mutation, persistent runtime input and state,
asset generation and explicit candidate recommendation plus reviewed ChangeSet
import, test, Diff, audit, and Windows
build operations. The initialized `author-2d-scene`,
`author-gameplay-feature`, and `build-and-test-game` Skills explain stable
resource IDs, real physics events, semantic input, versioned audio, UI, runtime
inspection, deterministic tests, and reachability verification.

## Open human evidence

This machine gate does not close P24. Journey B still requires a developer who
did not implement this phase to start from Empty 2D and independently complete
the same mechanic through Studio UI and project Codex, review/apply/undo its
ChangeSet, repair a deliberate error, and run the standalone game. Interactive
Player audio and Studio/Player visual parity must be observed and recorded.
