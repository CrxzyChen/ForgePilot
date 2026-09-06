# MVP product contract

## Outcome

A solo developer can ask the Studio to add or modify one feature in the sample
2D strategy game. Codex produces a structured change set, the human can preview
and approve it, the kernel applies it transactionally, headless tests verify it,
and the developer can run or roll it back.

## Required vertical slice

- Explore one finite 2D map with a player-controlled unit.
- Merge compatible neutral units into the player's force.
- Capture a granary, armory, and factory.
- Let captured sites produce resources or upgrade units automatically.
- Encounter simple hostile units and choose an exploration order.
- Reach and persist a deterministic victory state.
- Add one resource site through an AI request without editing Rust code.

## Required AI loop

1. Inspect project schema and current world.
2. Produce a typed `ChangeSet` without mutating files.
3. Validate references, invariants, and expected effects.
4. Present a human-readable and machine-readable diff.
5. Apply only after approval and record an audit event.
6. Run deterministic simulation and acceptance tests.
7. Explain failures by file, field path, tick, system, and semantic entity ID.
8. Commit or atomically roll back the entire change.

## Non-goals

- General-purpose Unity, Unreal, Godot, or Cocos compatibility.
- 3D rendering, skeletal animation, visual shader graphs, or multiplayer.
- A marketplace, asset store, mobile export, or collaborative cloud editor.
- Inventing a renderer, physics engine, audio codec, or general programming
  language.
- Letting AI drive a scene editor through mouse and keyboard automation.

## Release acceptance

- A clean machine reaches the first approved AI change within 30 minutes.
- One command runs formatting, type checks, unit tests, deterministic replay, and
  the vertical-slice smoke test.
- The Windows package contains Studio, runtime, sample project, and diagnostics.
- Repeating the same world, commands, and seed produces the same snapshot hash.
