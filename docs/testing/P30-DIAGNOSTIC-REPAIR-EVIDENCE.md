# P30 diagnostic and repair evidence

- Date: 2026-09-05
- Gate: `node scripts/check-p30-runtime-observation.ts`
- Result: passed

## Seeded defects

The gate copied the Tank project to a disposable workspace, seeded each defect,
captured a named before observation, applied an approved semantic ChangeSet,
captured an after observation, then rolled the ChangeSet back and confirmed the
diagnostic returned.

| Defect                     | Structured diagnostic                  | Stable target                             | Repair command                |
| -------------------------- | -------------------------------------- | ----------------------------------------- | ----------------------------- |
| missing texture / fallback | `RUNTIME_RESOURCE_REFERENCE_MISSING`   | `tank:player/sprite`                      | `scene.component.update`      |
| changed texture bytes      | `RUNTIME_RESOURCE_HASH_MISMATCH`       | `tank-arena-example:asset/tank-sprite-v1` | `resource.reimport`           |
| bad pivot                  | `RUNTIME_DRAWABLE_PIVOT_OUT_OF_RANGE`  | `tank:player/sprite`                      | `scene.component.update`      |
| sprite behind arena        | `RUNTIME_DRAWABLE_FULLY_OCCLUDED`      | `tank:player/sprite`                      | `scene.component.update`      |
| off-screen start UI        | `RUNTIME_UI_BOUNDS_OVERFLOW`           | `tank:ui/start`                           | `scene.component.update`      |
| missing fire Clip          | `RUNTIME_AUDIO_CLIP_MISSING`           | `tank-arena-example:asset/fire-v1`        | `resource.repair_reference`   |
| omitted package asset      | `RUNTIME_PACKAGE_RESOURCE_UNREACHABLE` | `tank-arena-example:asset/tank-sprite-v1` | rebuild/reachability evidence |

`resource.repair_reference` was corrected to include asset, audio, input, test
and Replay text manifests; the first gate run exposed that its earlier scan
scope could diagnose an audio manifest defect but could not repair it.

All AI-authorable repairs crossed proposal, approval, apply, audit and exact
rollback. No repair used DOM state, screen coordinates, renderer/ECS handles,
array positions, external IDE state or direct Scene JSON replacement. Project
Skills now require linked before observation, after observation and ChangeSet
IDs before a repair Plan step may close.

The gate compared the original and repaired player/enemy Collider, Rigidbody,
unit, enemy-state and weapon Components byte-for-byte. Gameplay and collision
semantics were preserved.

## Remaining human evidence

The deterministic harness proves diagnostics and semantic repair behavior, not
independent Codex reasoning or participant comprehension. Those exit rows remain
open for the P31/P33 Completion Run and Round 05 observation.
