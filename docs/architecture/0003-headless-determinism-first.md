# ADR 0003: Headless determinism first

Status: Accepted

## Decision

Simulation advances through a fixed tick and explicit system schedule. Time,
randomness, commands, and external inputs enter through controlled interfaces.
The same initial world, ordered input log, protocol version, and seed must yield
the same observable snapshot hash.

Rendering consumes immutable render snapshots and cannot mutate simulation.

## Consequences

- Tests and Codex can run the full game loop without a GPU or window.
- Parallel execution is opt-in only after deterministic ordering is proven.
- Floating-point and platform-specific behavior require explicit policies and
  cross-platform replay fixtures.
