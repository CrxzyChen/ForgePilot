# Windows MVP quick start

> Historical P0-P13 package instructions. For AI Game Studio 0.2.0 Alpha, use
> `STUDIO_USER_GUIDE.md` and the installed package under
> `artifacts/studio-windows/`.

The release package is designed for a solo developer to reach an approved AI
change in well under 30 minutes.

## Use the packaged MVP

Requirements: 64-bit Windows 10/11 and Node.js 24.11.1 or newer. Install Codex
CLI 0.152.1 when natural-language planning is required; the game and structured
control API run without it.

1. Compare the ZIP with the adjacent `.sha256` file, then extract it.
2. Run `Start-Game.cmd`. Move with WASD or arrow keys, wait with Space, toggle
   IDs with F3, and capture the capital to win.
3. Run `Start-Studio.cmd`. The first run installs locked npm dependencies, starts
   the loopback control bridge, opens `/studio`, and keeps the web server in the
   current terminal.
4. Enter `把工厂每周期产出改为 3` in Studio. Review the ChangeSet, select its
   operations, approve, apply, run the replay test, then try rollback.

The Studio bridge binds only to `127.0.0.1:4617`. Every write is schema-checked,
requires a one-use approval token, uses an atomic transaction journal, and can
be rolled back while its applied hash still matches.

## Use a source checkout

Install Visual Studio 2022 Build Tools with the C++ workload, Node.js 24.11.1,
and rustup. The repository pins Rust 1.91.1 and installs its WASI target on first
use.

```powershell
npm ci
npm run check
npm run package:windows
```

The package is written to
`artifacts/windows/AI-Game-Kernel-MVP-0.1.1.zip`. Run the headless game directly:

```powershell
npm run kernel -- validate examples/frontier.game.json
npm run kernel -- run examples/frontier.game.json fixtures/replay/frontier.input.json
npm run kernel -- batch examples/frontier.game.json fixtures/replay/frontier.input.json 100
```

## Recovery and diagnostics

- If a write is interrupted, restart Studio. Its transaction journal restores
  the exact pre-write bytes before accepting new work.
- `CONTROL_RECOVERY_CONFLICT` means the file changed independently after the
  interruption. Studio will not overwrite it; preserve the file and inspect
  `.ai-game-kernel/transactions`.
- Runtime failures include Tick, system, entity ID, and stable error code.
- Audit history is stored in `.ai-game-kernel/audit.jsonl` inside the opened
  workspace.
