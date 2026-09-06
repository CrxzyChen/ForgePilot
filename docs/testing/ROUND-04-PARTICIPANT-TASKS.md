# AI Game Studio Round 04 participant tasks

You are evaluating `AI Game Studio 0.3.0-preview.1`. This sheet intentionally
contains tasks rather than product instructions. Work from what is visible in
Studio and say your expectation aloud when something is unclear.

Candidate SHA-256:
`94b9c8b89a685e071690bef6c9783fbae4de8775714e1a04040dae9da54490e9`

## Rules

- Use a clean Windows profile or clean test computer.
- Use only AI Game Studio and the standalone games it creates.
- Do not use a terminal, another IDE, the engine source checkout, direct JSON
  editing, DOM automation, or instructions from the observer.
- Visible contextual help inside Studio is allowed.
- If you cannot continue, describe what you expected to find, what you tried,
  and where you stopped. Do not ask the observer how to proceed.
- For the provider task, enter only the supplied test credential through
  Studio's credential interface. Never place it in a project file or prompt.

## Task A — Understand the workspace and Play Mode

Create an Empty 2D project. Identify Project Files, Scene Outline, the central
Scene/Game/Code documents, Inspector/Copilot, Console/Problems/Tests, and the
runtime controls. Create a Scene and one object, run it, pause it, advance one
Tick, inspect the object state, resume, stop, close Studio, and reopen the
project.

## Task B — Build and debug a complete 2D mechanic

From Empty 2D, create a small arena with a player and wall. Import a player
texture and collision sound, create input actions, add Sprite2D and physics,
write project TypeScript movement, display a score, and make collision play
sound and change the score. Run and debug it.

Ask project Codex to add a moving target and a test. Review its Plan and
ChangeSet before applying the change. Deliberately introduce one script error,
repair it from Problems, undo and reapply the repair, then build and run a
standalone Windows game.

## Task C — Build an honest minimum 3D game

From Empty 3D, create a room with a perspective camera, floor, wall, light,
controllable object, and collectible. Give the objects visible materials and
collision. Run the project, move behind an occluding wall, collect the item,
and inspect the score event.

Ask project Codex to add a second collectible and a test. Review and apply the
change, then build and run the standalone Windows game.

## Task D — Use the daily IDE and asset-provider workflow

Find a symbol, rename it, run one test, create a source breakpoint, inspect the
call stack and a variable, fix the failure, inspect Diff, commit it, and view
history.

Configure the approved image provider and credential reference, check estimated
cost, generate two candidates, cancel one job, approve one candidate, and
import it. Close Studio, reopen it, and confirm the project still works without
exposing the credential.

When finished, leave the created projects and standalone packages in the folder
chosen by the observer. The observer will collect them without asking you to
modify their contents.
