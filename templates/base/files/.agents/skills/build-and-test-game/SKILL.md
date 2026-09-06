---
name: build-and-test-game
description: Validate, replay, test, or build this AI Game Kernel project.
---

# Build and test the game

When a Goal is active, call `completion.run_current` before starting work and
again after a Studio/Codex restart. Its Run ID, active Plan step, waiting
reason, linked Tool Calls/jobs/ChangeSets/runtime/tests/builds/packages,
checkpoint, and budget are the durable recovery authority. Resume the recorded
wait or next unfinished step; never repeat a provider call, ChangeSet, test,
build, or package merely because transient UI progress is absent.

When a script capability appears missing or the project predates the installed
Studio, call `script.api`. It returns the installed engine's canonical SDK and
whether `scripts/game-sdk.d.ts` matches it. Propose any declaration migration
through a reviewed ChangeSet; an old project declaration is not evidence that
the current runtime lacks an API.

## Executable tests

`test.run` executes structured `assertions` and/or replay `expectedHashes`.
Put explanatory prose in `documentation`, not in `assertions`. A run with no
assertions or hashes is a smoke check, not proof of the described behavior.
Assertion targets use the actual object and Component instance IDs from the
snapshot (not the Component type). For example, compare a paused player's
position against an earlier checkpoint:

```json
{
  "id": "assertion:player-stays-paused",
  "tick": 20,
  "target": {
    "objectId": "game:player",
    "componentId": "game:player/transform",
    "field": "position"
  },
  "operator": "equals",
  "compareTick": 10
}
```

Use `expected` instead of `compareTick` for a literal. Choose checkpoints
that the test actually executes; missing snapshots or targets fail. Test-file
`scene`, `ticks`, `seed`, and inputs are respected; a referenced replay supplies
its own defaults. For a regression, establish that the incorrect expectation
or unrepaired behavior fails before calling the repair verified. Keep
deliberately failing probes separate from the normal passing release suite.

For UI content clearance, use `fitsUiContent` when the installed `test.run`
descriptor exposes it. It is an assertion operator, not a separate tool or
project capability; an unchanged MCP transport version does not mean it is
absent. The descriptor provides the exact expectation format: text/button
semantic target, image/button container, fractional artwork `inset`, explicit
`viewport`, and pixel `minimumMargin`. Do not add `field` or `compareTick`.

Measure a conservative interior against the actual panel artwork and check
every required line/title/button at the supported resolutions and UI states.
Matching an authored anchor or layout size does not prove glyph containment.
Read `test.result` failure diagnostics (`state.uiContent`) for measured bounds
and four margins. Repair the layout rather than loosening artwork insets or
removing failing assertions. Passing geometry still requires real-frame review
for decorative borders, contrast and visual quality; never add fake measured
state to game Components just to make a test pass.

## Validation and release workflow

For a long deterministic checkpoint, use `runtime.navigate_checkpoint` to start
a bounded prefix and pause. Then read `runtime.read_state` and call
`runtime.advance_ticks` with its `sessionId`, `generation`, `tick` as
`expectedTick`, and a batch of 1–200 `ticks`. Each batch stays paused, preserves
the current world, queued inputs and seed, and returns every snapshot in that
batch. Capture/review the required resulting checkpoints. A stale checkpoint
fails instead of advancing twice; after an uncertain response, read current
state before deciding whether to continue. Project budgets and native execution
guards still apply to each batch. Reduce batch size for expensive scenes rather
than raising safety limits. `runtime.resume` starts live playback and is not a
deterministic batch-navigation substitute; `runtime.step_tick` remains one Tick.

At a successful paused checkpoint, call `runtime.export_input_log` with the
current `sessionId`, `generation`, and `expectedTick`. It retains initial Scene,
seed and consumed semantic inputs, commands and controls, including earlier
batches. Use the returned content-addressed `inputLogId` with
`runtime.compare_player`, a descriptive `checkpointId` and viewport. Do not
also override its ticks/inputs/seed. The tool independently runs Studio and the
packaged Player in batches of at most 200 Ticks (10000 total), checks the
recorded final state, and compares actual frame/resource/audio evidence.
The checkpoint name alone is only a label and cannot recover a route. Export
before restarting or closing a session. A changed project revision, incomplete
recording, corrupt log or unsuccessful batch requires a new recording or a
reported defect, not a fallback menu comparison. Local exported logs survive
Studio restart but are derived evidence, not approved game source; use a
ChangeSet when promoting a recipe into the project's release replays.

1. Run `project.validate` through the `ai-game-engine` MCP server.
2. Run the narrowest relevant replay or test before the full project suite.
3. For interactive diagnosis, call `runtime.run`, then use
   `runtime.read_state`, `runtime.input`, `runtime.pause`,
   `runtime.step_tick`, `runtime.resume`, `runtime.restart`, and
   `runtime.stop`. Preserve the returned `sessionId`; a single step must
   advance the paused world by exactly one Tick without replaying Tick zero.
4. Read `renderSnapshot`, `debugSnapshot`, diagnostics, state hash, generation,
   and sequence from the runtime result instead of guessing viewport state.
5. Report failures with stable code, file path, JSON pointer, Tick, system, and semantic entity ID when available.
6. Run the configured target build only after validation and tests pass.
7. Read the build report and verify that only reachable Scenes, Prefabs,
   scripts, images, audio, and fonts are packaged; inspect orphan diagnostics.
8. Run Player verification and compare projection protocol, state hash, input,
   physics, UI, and audio evidence with the Studio session.
9. Discover tests with `test.list`; never infer success from an empty suite. Run
   a named test with `test.run`, then use source diagnostics, call stack, scopes,
   watches, and fixed-Tick stepping to explain failures.
10. Inspect `source_control.status` and Diff before version-control work. Commit
    only reviewed/staged files; preserve unrelated work through branch, Stash,
    conflict, and remote operations.
