# P30 runtime observation evidence

- Date: 2026-09-05
- Gate: `npm run check:p30`
- Result: machine passed; independent human comprehension remains open

## Implemented boundary

`runtime.capture_frame` and `runtime.navigate_checkpoint` now return one
versioned observation containing stable session, generation, Scene, Tick,
checkpoint, camera and artifact identities. The artifact is an actual PNG
rendered by the native Player path, not a renderer metadata placeholder.

The same observation contains addressable Drawable, object, Component and asset
IDs; source and derived hashes; layer/order, bounds, pivot, scale, Atlas and
tint; fallback state; UI bounds/clipping/interaction reachability; and audio
event, Clip, Bus, volume, mute and playback diagnostics. Studio stores the
artifacts under `.aigame/local/runtime-observations/` and displays the latest
frame and concise diagnostics in the normal Game Runtime document.

## Deterministic evidence

The gate navigated the Tank project to six named checkpoints without screen
coordinates:

- `checkpoint:menu`
- `checkpoint:play`
- `checkpoint:pause`
- `checkpoint:win`
- `checkpoint:lose`
- `checkpoint:restart`

Two independent menu runs produced the same frame SHA-256:
`b289b1590c9871c9bffa185196148db5dde31f56fab78ec030e2c0052de4108a`.
The saved file had a valid PNG signature and could be loaded through the narrow
Studio preview bridge.

Persisted observation reads now fail closed. The gate accepts a valid captured
observation, rejects an incompatible `0.9.0` document with an explicit
migration-required diagnostic, rejects malformed JSON and a Drawable without
stable object identity, rejects invalid observation IDs and cross-checkpoint
comparisons, and rejects a frame whose bytes no longer match its recorded
SHA-256. Restoring the exact document and frame makes the same stable
observation readable again.

## Commands

- `node scripts/check-p30-runtime-observation.ts`
- `node scripts/check-p30-agent-observation-bridge.ts`
- `node scripts/check-p30-studio-observation-ui.ts`
- `npm run check:studio-ui-contract`
- `npm run check:p30`

All passed. The Electron gate activated the visible **捕获当前帧** control,
loaded a non-empty PNG data URL and verified contained geometry and the approved
Midnight Workshop surface grammar.

## Human boundary

This evidence proves the machine surface and real desktop interaction. It does
not claim that an uninvolved participant understood the diagnosis or accepted a
repair. That remains open in `ROUND-05-HUMAN-OBSERVATION.md`.
