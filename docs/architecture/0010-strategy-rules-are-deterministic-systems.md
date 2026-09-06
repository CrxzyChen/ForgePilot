# ADR 0010: Strategy rules are deterministic systems

- Status: Accepted
- Date: 2026-09-02

## Decision

The vertical slice adds gameplay as three fixed systems after the original
Command, Movement, and Production schedule: Strategy, Interaction, and Victory.
All systems iterate stable Game IR IDs through ordered maps. Strategy selects a
nearest player by Manhattan distance and ID, then advances on X before Y.
Interaction resolves same-faction merging, opposing-faction combat, and site
capture. Victory reads only the captured owner of an explicit victory target.

Strategic sites are ordinary combinations of `game:capture-site`,
`game:strategic-site`, and `game:producer`. Unowned strategic producers are
inactive. A granary accumulates grain; an armory transfers its production into
unit strength; a factory transfers twice its production. Legacy producers
without a strategic-site component retain their P2 behavior so the original
golden replay stays byte-for-byte compatible.

The native runtime embeds the same Game IR fixture used by headless tests. In
interactive mode, a movement key or Space advances exactly one Tick. Rendering
continues to consume immutable snapshots and cannot affect the simulation.

## Consequences

The complete campaign can be played, saved as a canonical snapshot, replayed,
and batch-tested without a GPU. A JSON ChangeSet can add a site or tune
production without recompiling Rust. The P6 gate runs 100 consecutive seeds,
validates the golden victory hash, applies and rolls back an approved site edit,
and confirms all required gameplay events.
