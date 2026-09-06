# Round 03 unassisted human acceptance protocol

## Participant and environment

Use a developer who has not seen the current Studio. Give them a clean Windows
profile, the versioned portable Studio ZIP and its SHA-256 sidecar (or a signed installer
when release signing is available), and only the task below. Do not provide the
engine checkout, terminal instructions, another IDE, or verbal coaching. Record
screen, voice, build identity, profile identity, start/end time, and final
artifacts with informed consent.

## Canonical task shown to the participant

> Create a new Empty 2D project named Bounce Lab. Create and switch between
> Menu and Arena Scenes, make Arena the startup Scene, create a reusable Ball
> Prefab, and add a project-defined Speed Component. In Studio, write TypeScript
> that moves the Ball every fixed Tick and emits `bounce-lab:scored`; handle that
> Event in a separate System. Run, pause, step, inspect state, and repair the
> injected script error using Problems. Log in to Codex, attach the Scene and
> failing diagnostic, select a model and Plan or Goal mode, review and approve
> its multi-file fix, then undo and reapply it. Build a standalone Windows game,
> close Studio, and run the game. Reopen Studio and confirm both Scenes, the
> Prefab, scripts, layout, and history are intact.

Repeat the authoring, AI, debug, persistence, and standalone-build portions with
an Empty 3D project containing a lit room, controllable primitive, and
collectible object.

## Observation rubric

Record every region the participant cannot name, question, wrong turn, hidden
control, unexplained term, unavailable command, disabled action without reason,
misleading success, error without remediation, terminal/external escape,
manual-file workaround, AI/human parity mismatch, unexpected cost/permission,
crash, data loss, nondeterminism, or performance interruption.

Severity is outcome-based:

- blocker: task cannot finish safely without coaching or external tools;
- major: task finishes only through a non-obvious workaround or loses expected
  state/control;
- minor: task finishes independently but creates measurable hesitation or
  avoidable rework.

The task passes only when there are no blockers, no external escapes, both
standalone packages run without development dependencies, all durable artifacts
match the expected semantic files, and every human mutation has equivalent MCP,
Skill, ChangeSet, test, diagnostic, audit, and rollback evidence.

## Recording template

| Field                              | Value |
| ---------------------------------- | ----- |
| Tester / consent record            |       |
| Studio build and installer hash    |       |
| Clean profile / OS / display scale |       |
| Start / end / active time          |       |
| 2D result / package hash           |       |
| 3D result / package hash           |       |
| Questions and wrong turns          |       |
| External escapes                   |       |
| AI parity differences              |       |
| Recovery and persistence result    |       |
| Blocking / major / minor gap IDs   |       |
| Final pass/fail                    |       |
