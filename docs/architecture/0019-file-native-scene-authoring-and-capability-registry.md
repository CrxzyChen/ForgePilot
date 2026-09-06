# ADR 0019: File-native Scene authoring and capability registry

- Status: Accepted
- Date: 2026-09-03

## Decision

Round 03 Scene files use `schemaVersion: 2.0.0-alpha.1` and contain a stable-ID
object hierarchy. Every object owns an ordered list of Components whose fields
come from one capability registry. The registry is the shared source for Scene
creation defaults, Inspector controls, validation, MCP discovery, Skills,
runtime/render adapters, tests, migrations, and build metadata.

Projects can register data-only Component schemas in
`capabilities/components.json`. Built-in and project Component type IDs cannot
collide. Unknown fields and values of the wrong scalar/vector type fail before
a transaction writes the Scene.

`SceneAuthoringService` materializes semantic Scene, object, Component, Prefab,
and resource mutations as before/after file states. `StudioCommandRegistry`
validates and commits them atomically to the same history used by UI edits.
Engine MCP exposes the same reads and commands; AI mutation tools create an
`awaitingApproval` ChangeSet and do not alter project authority.

Prefab files are reusable stable-ID object graphs. Instantiation assigns new
Scene object and Component IDs and records the source path. Apply writes
instance defaults back to the Prefab; revert restores source values while
retaining the instance marker. Resource reimport updates size and SHA-256 in
the asset manifest, and dependency inspection scans project references.

## Compatibility boundary

`WorkspaceSnapshot.worlds` remains a read-only projection of the active Round
03 Scene while P15/P16 UI and legacy tests migrate. It is not an authoritative
file format. The old Game IR/Tank runtime remains a legacy technical-prototype
path until P18 replaces the production runtime entry; it cannot satisfy the
Round 03 zero-domain-vocabulary exit gate.
