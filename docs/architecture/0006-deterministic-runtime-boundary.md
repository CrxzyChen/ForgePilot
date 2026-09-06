# ADR 0006: Deterministic runtime boundary

- Status: Accepted
- Date: 2026-09-02

## Decision

The headless simulation owns authoritative runtime state. It uses integer tile
coordinates, a fixed tick clock, SplitMix64 seeded randomness, stable ID-sorted
storage, an explicit system schedule, and canonical JSON SHA-256 snapshots.
Commands for a tick are validated as a batch before any mutation. Rendering,
wall-clock time, file iteration order, threads, and native object handles are
outside the deterministic boundary.

## Consequences

Every run can be reproduced from a Game IR revision, input log, seed, and tick
count. Failures carry tick, system, and entity context. A schedule, RNG, numeric
representation, or snapshot-shape change is a protocol change and must ship with
updated replay fixtures.
