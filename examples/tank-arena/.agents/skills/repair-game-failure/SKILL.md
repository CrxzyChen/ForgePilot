---
name: repair-game-failure
description: Diagnose and repair a structured validation, runtime, replay, test, or build failure.
---

# Repair a game failure

1. Reproduce the failure with the same project revision, seed, input log, checkpoint, and target.
2. Choose the narrowest evidence source: inspect files for durable authoring state; `runtime.read_trace` for behavior and lifecycle; `runtime.capture_frame` for drawable/resource/UI/audio presentation; tests and Replay for semantics; and build reports for package reachability.
3. Use `runtime.navigate_checkpoint` to reach menu, play, pause, win, lose, or restart without screen coordinates. Read the returned observation image and structured IDs together.
4. Identify root cause by stable code, Tick, phase, Scene, System, object, Component, asset/module ID, source line, and relevant state path. Never use DOM selectors, renderer handles, array indexes, or simulated mouse input as evidence.
5. Propose the smallest semantic ChangeSet that fixes the cause rather than hiding the symptom. Request approval; do not rewrite Scene or manifest JSON directly.
6. Capture a named before observation, apply the approved ChangeSet, capture a named after observation, and compare state/resource identity. Do not close the Plan step without linked before/after observation IDs and the ChangeSet ID.
7. Add a regression Replay/test with the failing Tick hash, run the narrow and affected suites, then use `runtime.compare_player` to verify the same checkpoint and input log in Studio and standalone Player.
8. Exercise exact ChangeSet rollback and confirm that the before diagnostic returns without changing gameplay or collision semantics.
