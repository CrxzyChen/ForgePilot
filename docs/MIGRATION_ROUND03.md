# Migrating the P0-P13 prototype to Round 03 projects

P0-P13 used a root Game IR, Tank-aware Rust kernel/runtime, and fixed 2D build
path. Round 03 does not load that format as a production fallback.

## New boundary

- Old Rust crates, Game IR schema/generated type, fixtures, server adapters,
  and top-down template moved to `examples/tank-legacy-regression/`.
- `examples/tank-arena/` is a normal Empty 2D project with project-owned
  `tank:*` Components and TypeScript.
- Production Studio, Engine MCP, project script host, and player contain no
  Tank/Pong/Collect gameplay behavior.

## Conversion steps

1. Create Empty 2D or Empty 3D in Studio.
2. Recreate each level as a Scene 2.0 file with stable object and Component IDs.
3. Move domain fields into namespaced project Component declarations.
4. Move update logic into TypeScript behaviors/Systems and declare typed
   Commands/Events in `scripts/runtime.json`.
5. Convert input names to `input/actions.json`.
6. Import assets into `assets/asset-manifest.json` with dependency and
   provenance records.
7. Convert authoritative input logs to project replay files and record expected
   per-Tick hashes.
8. Run Project Doctor, runtime, replay, test, and Release build before removing
   the old source.

There is intentionally no silent one-click migration for arbitrary prototype
Game IR: its Tank-specific Systems do not map mechanically to general project
TypeScript without design decisions.

## Regression commands

The current general project suite is `npm run check`. Historical Game IR/Tank
coverage remains available as `npm run check:legacy:tank`. It proves the old
prototype still runs while preventing it from becoming a dependency of the new
product path.
