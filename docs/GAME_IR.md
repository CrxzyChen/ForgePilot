# Game IR 1.0

> Historical P0-P13 prototype contract. Its schema and generated projection now
> live under `examples/tank-legacy-regression/`. Round 03 production projects
> use `PROJECT_FORMAT.md`, Scene 2.0, and project TypeScript.

`schemas/game-ir.schema.json` is the only authoritative shape for project data,
commands, events, snapshots, and change sets. Generated Rust and TypeScript
types are projections and must never be edited as an alternative source.

## Stable IDs

Every durable object uses `namespace:path`, for example
`demo:frontier/granary`. Namespaces are lowercase ASCII and identify the owner.
Paths use lowercase ASCII segments separated by `/`.

- Once an ID ships, rename its display name instead of its ID.
- IDs are globally unique within a project, including worlds and entities.
- References always store IDs, never array indexes or display names.
- A path may not contain empty, `.` or `..` segments.
- Component `type` values are protocol IDs; each entity may contain a given type
  at most once.

## Versions and migration

`schemaVersion` uses semantic versions. The loader accepts only the current
version after migration. Migrations are pure, ordered JSON-to-JSON transforms;
they never mutate input files. `kernelctl migrate` writes the migrated document
to standard output so a caller can review it before replacing a file.

## Strategy vertical-slice components

Gameplay remains composition over data rather than hidden editor state:

- `core:transform` places an entity on the integer tile map.
- `game:player-controlled` marks the unit addressed by local input.
- `game:mergeable` supplies faction and integer strength for merging/combat.
- `game:capture-site` supplies the minimum strength and runtime owner.
- `game:strategic-site` selects granary, armory, or factory behavior.
- `game:producer` supplies resource, amount, and fixed production cadence.
- `game:hostile-ai` supplies a deterministic movement cadence.
- `game:victory-target` turns capture into a persistent terminal outcome.

The stable schedule is Command → Movement → Production → Strategy →
Interaction → Victory. Snapshot `outcome` is omitted for legacy projects and is
`in-progress`, `won`, or `lost` for projects with a victory target.
