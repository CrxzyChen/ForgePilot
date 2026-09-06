# AI Game Studio user guide

## Start a project

Open Studio and choose **New Project**. `Empty` enables no rendering capability;
`Empty 2D` and `Empty 3D` add only their respective capability. Tank Arena is
under **Examples** and is never a project type. Choose a parent folder, name the
project, and create it. Existing projects open through the system folder picker
or the Recent list.

Pong, Collect Room, and Tank Arena are examples, not startup templates. Start a
new game from Empty/2D/3D; use Examples only to learn or run regressions.

## Understand the workspace

- The top title bar contains project menus, run controls, and native window
  controls. Drag its unused area to move the window and double-click to toggle
  maximize.
- The narrow Activity Bar switches Explorer, Search, Source Control, Assets,
  Tests, Build, Extensions, and Settings.
- Explorer places the active Scene object outline above the disk-backed project
  file tree. Each section collapses independently; dock edges resize.
- Central tabs contain project overview, Scenes, Game preview, source, Prefabs,
  materials, Diff, and reports.
- The right dock switches between the contextual Inspector and Codex Copilot.
- The bottom dock displays Console, Problems, Tests, Profiler, and Event
  Timeline. The status bar summarizes Git, target, runtime, diagnostics, and
  Codex state.

Use **Help** in the title bar for the same map inside Studio.

## Author Scenes and Prefabs

Open a Scene from the project tree. Explorer's **Scene and Objects** section
switches Scenes, creates or renames them, changes the startup Scene, and shows
the current parent hierarchy. Add an object with **+ Object**. Drag an object
onto another object to reparent it, or onto the Scene root to detach it. Eye
and lock controls change authoring visibility and editability.

Selecting an object opens its Inspector. Name, enabled state, parent, sibling
order, visibility, lock, and Component fields are editable there. Ctrl/Cmd
selects multiple objects while the most recent selection remains the primary
Inspector target. **Add
Component** is populated from the project's enabled capabilities and
`capabilities/components.json`; unavailable or unknown fields are rejected.
Every change is a semantic transaction and can be undone.

Use **Create Prefab** on a selected object subtree, then **Instantiate Prefab**
in any Scene. Prefab roots expose **Apply to Prefab** and **Revert Instance**.
Opening the `.prefab.json` file shows its object graph beside the authoritative
source. Opening an imported image shows a preview, versioned import settings,
incoming/outgoing dependencies, and **Reimport**. The Assets panel scans
missing references and replaces them through an undoable semantic transaction.

Running a project opens a separate **Game Runtime** document; it never turns
the Scene editor into live authority. Runtime Problems navigate to source,
while Profiler and Event Timeline expose Tick, lifecycle, System, Event,
memory, operation, breakpoint, and watch data.

## Files and settings

Right-click a project file to rename/move, duplicate, or move it to the project
trash. Drag a file onto a folder to move it. Local tab, dock, selection, and
layout state restores from `.aigame/local/workspace.json` and should not be
committed.

Studio and Agent settings are user-local. Project settings are stored under
`settings/` and may be reviewed by Codex. AI provider secrets are entered only
through **Settings → AI Tools → Manage secure credentials**. Studio encrypts
them with the operating-system store and exposes only `ref:<id>` metadata; the
secret cannot be read back through the renderer API.

## Copilot

Switch the right dock to Copilot. If Codex is signed out, Studio shows the login
action. Once signed in, select Ask, Plan, Agent, or Goal; attach the active file
or document; choose a model; and send. Project `AGENTS.md`, `.agents/skills/`,
`.codex/config.toml`, and Engine MCP explain the engine and its semantic tools.
Writes are reviewable ChangeSets rather than hidden UI automation.

An executing Goal and its current Plan stay visible directly below the project
conversation selector, including step and Goal state. **Stop** interrupts the
active turn and changes the Goal to paused; **Continue** reactivates it; and
**Remove** clears the Goal from the Codex thread after interrupting any active
turn. Blocked, usage-limited, budget-limited, and completed states arrive from
the Codex app-server rather than being inferred by the UI.

## Test, build, and run independently

Use the left Tests panel to run the project's declared smoke test and replay.
Problems opens structured failures at their project file, line, and column.
Use Build to select Development or Release and open the resulting Build Report.

Development retains diagnostic metadata. Release creates a player-facing
directory/ZIP under the project's `out/` directory. Close Studio and launch
`ai-game-player.exe` from the Release directory to verify independence. A
Release package must not contain project TypeScript, source maps, tests,
replays, `.ai` secrets, `.aigame`, Studio, Codex, Node.js, Rust, or engine
checkout files.

## Safe close and recovery

Closing Studio checks dirty documents, a running game, active build, and active
Agent turn. If any exists, Studio names the risk before allowing exit. Window
bounds and maximized state restore at next launch. Atomic workspace/settings
writes leave the previous file intact if the process is interrupted before the
rename.
