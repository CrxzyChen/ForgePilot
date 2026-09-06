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

1. Run `project.validate` through the `ai-game-engine` MCP server.
2. Run the narrowest relevant replay or test before the full project suite.
3. For interactive diagnosis, use `runtime.run`, `runtime.input`, pause/resume,
   one-Tick step, restart, state, trace, and stop; preserve the stable Session ID.
4. Read the returned `renderSnapshot` and `debugSnapshot` instead of guessing
   viewport state.
5. Report failures with stable code, file path, JSON pointer, Tick, system, and semantic entity ID when available.
6. Run the configured target build only after validation and tests pass.
7. Read the build report and verify that development-only files are excluded from Release output.
8. Discover tests with `test.list`; never infer success from an empty suite. Run
   a named test with `test.run`, then use source diagnostics, call stack, scopes,
   watches, and fixed-Tick stepping to explain failures.
9. Inspect `source_control.status` and Diff before version-control work. Commit
   only reviewed/staged files; preserve unrelated work through branch, Stash,
   conflict, and remote operations.
