# ADR 0005: Schema-first Game IR

- Status: Accepted
- Date: 2026-09-02

## Decision

JSON Schema Draft 2020-12 is the source of truth for durable game data and tool
protocol values. Rust uses generated types at compile time, TypeScript bindings
are generated into a checked-in file, and runtime validation is performed by the
Rust kernel. Semantic constraints that JSON Schema cannot express clearly are
reported by a second validation pass.

## Consequences

AI changes are plain JSON edits with stable paths and deterministic validation.
No scene database or editor-only object graph can become authoritative. Schema
changes require a version and a pure migration fixture. Generated files are
never hand-edited.
