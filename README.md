# ForgePilot · AI-native Game Studio

ForgePilot（铸航，原 AI Game Studio / AI Game Kernel）是面向 AI 协作的游戏开发工作室。
人类与 Agent 共享文件化项目、语义工具和可追溯的开发流程，覆盖场景、脚本、
素材生成、调试、测试及独立游戏打包。Tank 是示例，不是引擎限定的游戏类型。

ForgePilot 0.4.0 Preview is a file-native Electron game IDE built so a human
and Codex can operate the same project through the same semantic commands. It
contains general 2D/3D project descriptors and proof paths; Tank Arena is
retained only as an example and regression project.

Round 05 has been accepted by the product owner. Independent P33 no-coaching
validation is deferred, not passed. See [R5 acceptance](docs/rounds/ROUND-05-ACCEPTANCE.json)
and [delivery notes](docs/ROUND-05-DELIVERY.md). Historical AI Game Studio names,
package IDs and protocol namespaces are retained for compatibility. This
repository does not bundle local credentials, machine caches or binary releases.

The project name is a working product name, not a trademark clearance claim.
No new open-source license is granted by this naming or repository publication;
third-party components remain subject to their respective licenses.

## Product shape

- Frameless Electron project manager and multi-document workbench.
- Project Files and Scene hierarchy on the left; Inspector or Copilot on the
  right; diagnostics, tests, profiling, and Event Timeline below.
- File-backed Scenes, objects, Components, Prefabs, resources, TypeScript,
  Systems, Commands, Events, replays, tests, build settings, `AGENTS.md`, and
  project Skills.
- One command/capability registry shared by Studio UI, Engine MCP, tests,
  ChangeSets, audit, undo, and rollback.
- Sandboxed QuickJS project runtime and a generic wgpu standalone Windows
  player.

## Repository shape

- `studio/`: Electron shell, project manager, workbench, semantic commands,
  language service, runtime integration, build service, and Engine MCP server.
- `crates/player/`: generic standalone wgpu player used by Release builds.
- `crates/script-host/`: native sandboxed TypeScript/QuickJS host.
- `crates/engine-mcp/`: native launcher for the project Engine MCP server.
- `templates/`: neutral Empty, Empty 2D, Empty 3D, and platform layers.
- `examples/pong-2d/`: ordinary Empty 2D project.
- `examples/collect-room-3d/`: ordinary Empty 3D project.
- `examples/tank-arena/`: migrated ordinary project used for current regression.
- `examples/tank-legacy-regression/`: quarantined P0-P13 Game IR/Tank prototype.
- `lib/roadmap.ts`: version-controlled source for the human progress dashboard.
- `docs/rounds/ROUND-04-CHECKLIST.md`: authoritative current delivery state.

## Run from source

Requirements are Node.js 22.13+, npm, Rust 1.91+, and Windows C++ build tools.

```powershell
npm install
npm run studio:desktop
```

The project manager can create Empty, Empty 2D, or Empty 3D projects and open
existing project directories. The complete Round 03 gate is:

```powershell
npm run check
```

That command formats, lints, type-checks, exercises P14-P21, builds the
standalone player and script host, packages Studio, and runs clean-install,
update, and portable-uninstall lifecycle checks.

## Package Studio and games

```powershell
npm run package:studio:windows
npm run check:p20:installed
```

The current installed-style portable Studio candidate is written under
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-scene-ux-fix-win-x64`.
Game Release
builds contain `ai-game-player.exe`, the compiled project package, manifests,
licenses, and required assets. They exclude Studio, Codex, Node.js, Rust,
project source, tests, replays, credentials, cache, and audit state.

The current Preview 1 Studio ZIP SHA-256 is
`94b9c8b89a685e071690bef6c9783fbae4de8775714e1a04040dae9da54490e9`.
On Windows, Studio launches the bundled native `codex.exe app-server`
directly with a hidden window and inherited stdio pipes; opening a project no
longer surfaces a console window.
The real Empty 2D Tank acceptance project and its Development/Release evidence
are recorded in [the Tank completion increment](docs/TANK-COMPLETION-INCREMENT.md).

## Documentation

- [Studio user guide](docs/STUDIO_USER_GUIDE.md)
- [Project format](docs/PROJECT_FORMAT.md)
- [TypeScript API](docs/SCRIPT_API.md)
- [Engine MCP and Skills](docs/ENGINE_MCP_AND_SKILLS.md)
- [Capability and extension guide](docs/EXTENSION_GUIDE.md)
- [Round 03 migration](docs/MIGRATION_ROUND03.md)
- [Round 03 specification](docs/rounds/ROUND-03-GENERAL-AI-STUDIO.md)
- [Round 03 checklist](docs/rounds/ROUND-03-CHECKLIST.md)
- [Round 04 real game-authoring specification](docs/rounds/ROUND-04-REAL-GAME-AUTHORING.md)
- [Round 04 checklist](docs/rounds/ROUND-04-CHECKLIST.md)
- [Round 04 human observation board](docs/testing/ROUND-04-HUMAN-OBSERVATION.md)
- [Round 04 evidence index](docs/testing/ROUND-04-EVIDENCE-INDEX.md)
- [P27 Preview release evidence](docs/testing/P27-PREVIEW-RELEASE-EVIDENCE.md)
- [P20 release evidence](docs/testing/P20-RELEASE-EVIDENCE.md)
- [Tank completion increment](docs/TANK-COMPLETION-INCREMENT.md)
- [0.3.0 Preview 1 limitations](docs/RELEASE_LIMITATIONS-0.3.0-preview.1.md)

The P0-P13 Game IR documents remain as historical prototype references. Their
code and fixtures live under `examples/tank-legacy-regression/` and are not a
production dependency of Studio, Engine MCP, or the generic player.
