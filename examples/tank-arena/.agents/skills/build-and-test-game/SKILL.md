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
   viewport state. Use `runtime.navigate_checkpoint` for a named deterministic
   state and `runtime.capture_frame` for an inspectable image plus stable
   Drawable, resource, UI, audio, and diagnostic identities.
5. Report failures with stable code, file path, JSON pointer, Tick, system, and semantic entity ID when available.
6. Run the configured target build only after validation and tests pass.
7. Read the build report and verify that only reachable Scenes, Prefabs,
   scripts, images, audio, and fonts are packaged; inspect orphan diagnostics.
8. Run Player verification and use `runtime.compare_player` to compare
   projection, authoritative state hash, input log, Drawable/resource identity,
   UI, and audio evidence with the Studio session.
9. Discover tests with `test.list`; never infer success from an empty suite. Run
   a named test with `test.run`, then use source diagnostics, call stack, scopes,
   watches, and fixed-Tick stepping to explain failures.
10. Inspect `source_control.status` and Diff before version-control work. Commit
    only reviewed/staged files; preserve unrelated work through branch, Stash,
    conflict, and remote operations.
11. For a repair, require named before/after observations linked to one approved
    semantic ChangeSet; verify rollback before accepting the fix.
