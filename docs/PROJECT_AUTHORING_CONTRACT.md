# Project authoring contract 2.0 Alpha

Round 03 separates portable project authority from local editor state and
secrets. All JSON uses UTF-8, LF, deterministic key ordering when generated,
stable semantic IDs, project-relative forward-slash paths, and explicit schema
versions.

| Concern                                           | Authoritative location                    | Schema                                 | Scope               |
| ------------------------------------------------- | ----------------------------------------- | -------------------------------------- | ------------------- |
| Installed capability contract                     | `capabilities/*/capability.json`          | `schemas/capability.schema.json`       | engine/plugin       |
| Scene and object graph                            | `scenes/*.scene.json`                     | `schemas/scene.schema.json`            | versioned project   |
| Reusable object graph                             | `prefabs/*.prefab.json`                   | `schemas/prefab.schema.json`           | versioned project   |
| Behaviors, Systems, Commands, Events, schedule    | `scripts/runtime.json` plus `.ts` sources | `schemas/script-runtime.schema.json`   | versioned project   |
| Startup, Tick, capability and build configuration | `settings/project.json`                   | `schemas/project-settings.schema.json` | versioned project   |
| Tabs, layout, selection, editor view state        | `.aigame/local/workspace.json`            | `schemas/workspace-state.schema.json`  | local, non-gameplay |
| Studio/Agent defaults                             | operating-system application data         | settings service                       | global user         |
| Provider/API credentials                          | operating-system credential store         | credential reference only              | secret              |

Scenes use a flat, stable-ID object list with explicit parent IDs and ordering.
This makes hierarchy edits semantic and mergeable without embedding UI tree
state. Components have a generic envelope and capability/project-owned `data`
validated by the registered Component schema. Prefabs use the same object
contract and expose named property paths; Scene instances store a Prefab
reference and reviewable overrides.

TypeScript source is authoritative. A script-runtime manifest declares modules,
stable ordered Systems, typed Commands and Events, phases, and budgets. Generated
JavaScript, source maps, imported textures, shader binaries, and platform builds
are caches or outputs and may always be recreated from source plus locked tools.

Every schema mutation requires a migration, diagnostic code, headless test,
ChangeSet preview, exact audit record, and rollback. Unknown required capability
versions fail closed; unknown project content is preserved during a read/write
cycle and is never silently discarded.
