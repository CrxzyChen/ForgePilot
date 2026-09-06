# AI Game Project format — 1.0.0

An AI Game Project is a portable directory shared by Studio, Codex, Engine MCP,
the script host, tests, and the standalone builder. Files in the directory are
the authority; Studio layout and caches are not gameplay state.

## Required shape

```text
my-game/
├─ project.aigame.json
├─ AGENTS.md
├─ .codex/config.toml
├─ .agents/skills/*/SKILL.md
├─ .ai/{providers,tool-routing,budgets,permissions}.json
├─ capabilities/components.json
├─ scenes/*.game.json
├─ prefabs/*.prefab.json
├─ scripts/
│  ├─ game-sdk.d.ts
│  ├─ runtime.json
│  ├─ behaviors/*.ts
│  └─ systems/*.ts
├─ assets/asset-manifest.json
├─ input/actions.json
├─ settings/project.json
├─ tests/*.test.json
├─ replays/*.replay.json
└─ build/windows.{development,release}.json
```

`.aigame/`, `out/`, generated bundles, recovery locks, credentials, and window
layout are local or derived data and are ignored by source control.

## Manifest

`project.aigame.json` records stable project identity, engine/project format
versions, startup Scene, exact template lineage, build targets, capabilities,
and source paths. Serialized paths are project-relative and use `/`.

```json
{
  "schemaVersion": "1.0.0",
  "id": "local:my-game",
  "name": "My Game",
  "engine": {
    "version": "0.2.0-alpha.1",
    "projectFormat": "1.0.0"
  },
  "entry": { "scene": "scenes/main.game.json" },
  "templates": [
    { "id": "core:base", "version": "1.0.0" },
    { "id": "core:2d", "version": "1.0.0" },
    { "id": "core:empty", "version": "2.0.0-alpha.1" },
    { "id": "core:windows", "version": "1.0.0" }
  ],
  "targets": ["windows-x86_64"],
  "defaultTarget": "windows-x86_64",
  "capabilities": ["2d", "ai-changesets", "deterministic-replay"]
}
```

Empty is the neutral base. Empty 2D and Empty 3D only add dimension
capabilities; neither is a game genre. Examples are ordinary projects generated
from those presets.

## Scene 2.0

Each Scene declares `schemaVersion`, stable `id`, display `name`, `space`, and
an ordered `objects` array. An object has stable ID, name, parent ID, sibling
order, authoring visibility/lock, and Component instances. Components have
stable instance ID, registered type, enabled state, and schema-validated data.

The production core knows generic Scene/Object/Component semantics only.
Project domain types such as `pong:velocity`, `collect:pickup`, or `tank:health`
are declared in `capabilities/components.json` and remain project-owned.

## Script runtime

`scripts/runtime.json` is the versioned runtime manifest. It declares modules,
Systems, typed Commands and Events, deterministic phase order, resource
budgets, and hot-reload policy. Objects attach a behavior with `core:script`
and a project-relative `data.path`.

TypeScript source is compiled for the sandboxed host during run/test/build.
`scripts/game-sdk.d.ts` is generated editor support; it does not grant APIs
beyond the versioned host contract.

## AI operating files

`.ai/tool-routing.json` follows
`schemas/asset-tool-routing.schema.json`. It maps a stable media capability to
a provider, opaque named-credential reference, and model ID; Agent tools
normally send only the capability and generation brief. The credential's
secret and provider-specific connection fields, plus the user's generation
approval mode, are global Studio state and never belong in this file.
The canonical capability names are `image`, `video`, `music`,
`speechRecognition`, and `speechGeneration`; `audio` is retained as a legacy
read alias for `speechGeneration`.

- `AGENTS.md` defines project rules, quality gates, and authority boundaries.
- `.agents/skills/` teaches discoverable authoring, testing, release, repair,
  and dimension-specific workflows.
- `.codex/config.toml` enables the project Engine MCP launcher without embedding
  a machine-specific absolute path in authored content.
- `.ai/*.json` stores provider aliases, routing, budgets, and permissions.
  Secret values never belong in the project; only secure credential references
  may appear.

## Writes, ChangeSets, and recovery

Human UI actions call typed semantic commands. Codex proposes the same commands
through Engine MCP. Writes validate stable IDs, schemas, references, and path
containment before atomic replacement. AI mutations are durable ChangeSets:
preview, approve, apply, test, audit, and exact rollback are separate states.

Studio-local workspace state lives in `.aigame/local/workspace.json`. It may
restore open tabs, docks, and selection, but cannot override project files.

## Project Doctor and compatibility

Project Doctor checks the manifest, startup Scene, Scene 2.0 structure, stable
IDs, scripts/runtime, project Skills, Engine MCP handshake, build files, path
safety, provider references, writable local state, and interrupted transaction
recovery. Opening a newer unsupported project never silently downgrades it.

Round 03 projects use project format `1.0.0`, Scene/runtime
`2.0.0-alpha.1`, and engine `0.2.0-alpha.1`. The older root Game IR format is
historical and lives under `examples/tank-legacy-regression/`; migration is an
explicit project conversion, not a production fallback.

## Build authority

Development packages may contain diagnostic metadata. Release packages contain
only the generic player, compiled project package, transitive runtime assets,
manifest, license/provenance, and hashes. Release excludes Studio, Codex,
Node.js, Rust, TypeScript source/maps, tests, replays, cache, audit data, and
credentials.
