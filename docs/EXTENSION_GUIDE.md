# Capability and extension guide — 0.2.0 Alpha

Round 03 separates neutral project semantics from dimension capabilities and
game-owned content.

```text
core project model
    ↓ registers
2D / 3D / UI capability metadata
    ↓ enables
project Components, scripts, Systems, Commands, Events and Skills
    ↓ demonstrates
Pong / Collect Room / Tank examples
```

Production Studio may depend on core and capability registries. Capabilities
may depend on core. A project/example may depend on both. Core and capabilities
must never import an example or contain its gameplay vocabulary.

## Project-defined extension

For Alpha, the supported no-engine-change extension surface is declarative:

1. Declare a namespaced Component in `capabilities/components.json`.
2. Add it to objects through the schema Inspector or
   `scene.component.add`.
3. Implement behavior or a stable query-based System in TypeScript.
4. Register the module/System and any typed Command/Event payload schemas in
   `scripts/runtime.json`.
5. Add project Skill guidance, a test, and a replay.

This is enough for ordinary gameplay logic. Pong uses `pong:*`, Collect Room
uses `collect:*`, and Tank uses `tank:*`; none require a production-core type.

## Engine capability registration

An engine capability descriptor supplies:

- ID and version;
- Component field schemas and defaults;
- Inspector, runtime, renderer, build, test, and migration metadata;
- picking and Gizmo support;
- MCP descriptions and Skill identity.

The built-in Round 03 descriptors are core, 2D, 3D, and UI. Tests must prove
that the descriptor appears identically through Studio and Engine MCP and that
human and AI authoring produce the same normalized Scene bytes.

## Compatibility

Use namespaced stable IDs and never persist UI coordinates, renderer handles,
VM object identities, or machine paths. Version project files and capability
metadata independently. Migrations must be typed ChangeSets with preview,
validation, and rollback.

## Alpha boundary

0.2.0 Alpha does not yet load arbitrary third-party native renderer/physics
plugins at runtime. Adding a new engine-level capability currently requires an
engine source contribution and tests. Project-defined Components and
TypeScript gameplay extensions do not.
