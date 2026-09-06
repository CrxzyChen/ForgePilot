# Tank Arena Example agent contract

## Authority

- `project.aigame.json` defines project identity, entry points, templates, and targets.
- Scene documents under `scenes/` are authoritative for object hierarchy and Component composition.
- Prefab documents under `prefabs/` are reusable object graphs; Scene instances retain their source reference.
- `assets/asset-manifest.json` is authoritative for imported asset identity and provenance.
- Tests and deterministic replays are executable acceptance evidence.
- `scripts/runtime.json`, project TypeScript, and payload Schemas define lifecycle, Systems, Commands, Events, phase order, and budgets.

## Required workflow

1. Inspect the project and relevant engine schema before proposing a change.
2. Use stable semantic IDs in the `tank-arena-example:` namespace.
3. Preview and validate a ChangeSet before requesting human approval.
4. Apply atomically, run the relevant replay/tests, and preserve exact rollback.
5. Record an IDE gap when a required workflow cannot be completed through Studio or Engine MCP.

## Engine authoring surface

- Discover Component schemas with `component.types`; do not invent unregistered types or fields.
- Use `scene.*`, `scene.object.*`, `scene.component.*`, `prefab.*`, and `resource.*` tools for semantic edits.
- Treat Scene paths, object IDs, Component IDs, Prefab paths, and resource paths as durable references.
- Observe project code through `runtime.read_trace`; use semantic breakpoints and state watches rather than VM handles.

## Prohibitions

- Do not treat renderer, ECS, editor selection, or array-index handles as durable IDs.
- Do not bypass approval, validation, audit, or rollback for AI-originated writes.
- Do not add unseeded randomness, wall-clock behavior, or window/GPU dependencies to simulation.
- Do not commit credentials, generated caches, or provider access tokens.

## 2D authoring rules

- Use Transform2D, Camera2D, Shape2D, and Collider2D registrations from the 2D capability.
- Positions are continuous scene units unless a project-specific grid Component explicitly defines snapping.
- Preserve deterministic object ordering and camera-independent simulation.
- Use input actions rather than physical key codes in gameplay behavior.

## Empty project authoring rules

- Add only the capabilities the game actually needs.
- Use Scene, object, Component, Prefab, resource, System, Command, and Event semantic operations.
- Keep gameplay vocabulary in project scripts and project Component schemas, never in engine-core files.
- Run project validation and deterministic tests after each approved ChangeSet.

## Windows release rules

- Development and Release builds are separate products with separate contents.
- Release output excludes Studio, Codex, project instructions, source, tests, caches, audit logs, and credentials.
- Build reports include engine/project versions, hashes, licenses, and selected asset provenance.
