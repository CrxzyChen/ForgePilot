# ADR 0004: AI writes are transactions

Status: Accepted

## Decision

AI-originated changes use a `plan → validate → approve → apply → verify → commit`
pipeline. Planning and validation never mutate authoritative files. Apply is
atomic across all files, records an audit entry, and carries enough prior state
to roll back.

Shell and unrestricted filesystem access are implementation escape hatches, not
the normal game-authoring interface.

## Consequences

- Every tool declares read/write scope, input schema, output schema, and failure
  shape.
- The Studio can explain pending effects before requesting approval.
- A failed verification cannot leave a partially modified project.
