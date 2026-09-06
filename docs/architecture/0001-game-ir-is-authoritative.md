# ADR 0001: Game IR is the authority

Status: Accepted

## Decision

Versioned, schema-validated Game IR is the only authoring source of truth. ECS
storage, physics objects, GPU resources, caches, and editor views are derived
runtime projections that can be discarded and rebuilt.

Every authored object has a stable semantic ID. Runtime-native handles never
cross the public command, query, diagnostic, save, or audit boundaries.

## Consequences

- AI changes remain readable, diffable, reviewable, and migratable.
- Runtime libraries may be replaced without changing project meaning.
- Loading and compilation must report source locations and semantic IDs.
- Runtime state needs explicit snapshot and projection rules.
