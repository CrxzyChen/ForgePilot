# P25 honest minimum 3D evidence

- Date: 2026-09-03
- Automated gate: `npm run check:p25`
- Result: passed
- Human Journey C: not observed

## What is implemented

Studio and Player consume the same `render.snapshot` contract for perspective
Camera3D, world-composed Transform3D, static meshes, material color/texture and
a directional light. Studio renders the snapshot with WebGL2; Player renders it
with wgpu/WGSL. Both paths use a depth buffer and back-face culling. The editor
layer adds stable-ID projected picking, selection outlines, wheel zoom,
middle-drag pan, right/Alt-drag orbit, and semantic move/rotate/scale edits.

The Player resolves reviewed Wavefront OBJ and image references from the
package root, rejects escaping/missing/unsupported mesh paths, triangulates the
OBJ, uploads its vertex buffer, decodes the material texture, and samples it in
the lit mesh shader. Studio resolves the same asset references and performs the
same resource-class operations through its preview boundary.

`examples/collect-room-3d` is now a playable project-file implementation with:

- perspective camera, directional light, textured floor and occluding wall;
- primitive player/room meshes and three imported OBJ collectibles;
- Collider3D/RigidBody3D integration and stable enter/stay/exit contacts;
- project-defined input, collision-driven scoring, HUD, win and restart UI;
- a parented marker that exercises hierarchical world transform composition;
- Development Windows packaging with only reachable OBJ and texture assets.

## Reproducible result

The P25 gate drives the player around the wall and collects all three items at
fixed Tick boundaries. The accepted run completed at Tick 260 with state hash
`fe0261dc53ad5072c682af67380cfc70f3220b8cf7e9d23dab9e1172b6055bb5`.
It produced three unique 3D collectible enter contacts, each with stable object
and collider IDs, a 3D normal, contact point and authoritative Tick. An
identical rerun and a 140+120 Tick segmented run produced the same final hash.

The emitted snapshot contained seven 3D drawables, one perspective camera, one
directional light, three imported mesh references, one material texture
reference and the world-composed child position `[2.39, 1.7, 0.84]`. Player
package verification reported 11 projected drawables, one decoded image, one
parsed OBJ, no external dependencies and renderer
`wgpu-runtime-render-snapshot`.

## Commands

```powershell
npm run check:p25
cargo test --locked -p ai-game-player
npm run typecheck
npm run build:electron
```

## Honest boundary

Automated state, shader, package and source-contract evidence is complete. A
Windows graphics-capture attempt could not target the launched Player window
in the current automation session, so no synthetic screenshot is substituted.
Journey C must still be performed by an independent participant and must
visibly confirm perspective, texture, lighting, occlusion, input, scoring,
restart and Studio/Player parity before the P25 human exit or Round 04 release
gate can close.
