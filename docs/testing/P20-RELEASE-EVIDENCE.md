# P20 independent release evidence

- Build: AI Game Studio `0.2.0-alpha.1`
- Date: 2026-09-03
- Machine gate: `npm run check:p20:release`
- Installed lifecycle gate: `npm run check:p20:installed`
- Status: machine pass; independent unassisted human acceptance remains open

## General projects

`scripts/generate-round03-examples.ts` creates all three projects from the
Empty preset layers and writes authored content through the shared semantic
command registry.

| Project           | Origin   | Purpose                       | 100-run authoritative hash                                         |
| ----------------- | -------- | ----------------------------- | ------------------------------------------------------------------ |
| `pong-2d`         | Empty 2D | independent 2D gameplay       | `7bed1e86664d8f6ad4f023e2139ff31a0af1747cec65f2977562314c8b69e329` |
| `collect-room-3d` | Empty 3D | independent 3D gameplay/Event | `d8399cd31fe292216d8c6aa2eda3142a703b0275ea489a245ef40b8104e69186` |
| `tank-arena`      | Empty 2D | migrated ordinary Example     | `6a642f411d488ad143c6dd0b118bd5828aaa7d4957f6a2ca94cb1b05f8d29413` |

Each project passes Scene/runtime validation, deterministic replay, project
reference indexing, release build twice, reproducible core-payload comparison,
and standalone `ai-game-player.exe --verify` under a clean `PATH` with no
Node.js, Rust, Studio, Codex, or engine checkout.

Release scans reject TypeScript/source maps, tests, replays, credentials,
Studio, Codex, cache, audit data, `kernelctl`, and the separate script-host
binary. The generic player embeds the script host needed by compiled project
logic.

## AI mutation and recovery

The gate copies Pong to a temporary project, proposes a semantic multi-file
ChangeSet, validates and previews it, grants approval, applies it, runs the
project test, and performs exact rollback. The final project fingerprint equals
the pre-change fingerprint. Interrupted prepared transactions and newer
unrelated work are covered by P19/P20 recovery checks.

## Legacy boundary

The old Game IR/Tank implementation runs its 100-seed deterministic regression
from `examples/tank-legacy-regression/`. A production-source scan covers Studio,
generic crates, and templates and rejects Tank, Bullet, Brick, Pong, and
Collectible gameplay vocabulary. Engine MCP is a generic native launcher and
has no Game IR fallback.

## Installed Studio lifecycle

The packaged directory and versioned ZIP contain the Electron application,
bundled Codex, generic Engine MCP launcher, script host, and player. Packaging
also emits a SHA-256 sidecar. The lifecycle test verifies the checksum, extracts
the ZIP into a clean location, then creates Empty 2D, starts project Codex,
authors an object and Component through semantic commands, validates, runs the
sandbox, builds Release, and verifies the standalone player.

The final Alpha 5 Studio ZIP after the Diff Review 1.0 upgrade is
`artifacts/studio-windows/AI-Game-Studio-0.2.0-alpha.5-win-x64.zip`, SHA-256
`0ed671348997f76917a1a7b5bd7c893e97ca71c27cfd77fce9bafd14e5096018`.

The lifecycle gate copies a clean install, launches it with external user data,
then launches a replacement install against the same profile and confirms a
sentinel survives. Removing the portable application copies does not silently
remove projects or user settings. These checks do not claim MSI installer,
signing, or automatic updater support.

The extracted installed bundle additionally passes the 150% DPI/minimum-window,
keyboard focus/navigation/resize, programmatic-name, window-state, and forced
renderer-crash recovery gate described in `P15-UI-QUALITY-EVIDENCE.md`.
Windows resolves and launches the packaged native `codex.exe app-server`
directly with hidden-window creation rather than passing through the JavaScript
shim. The protocol and foundation gates assert this launch contract, and the
installed Tank observation reached Codex `ready` without a visible console.

## Human acceptance boundary

Computer-use observation confirmed the installed frameless project manager,
separate Empty/2D/3D choices, Examples boundary, Project Files tree, central
documents, Inspector/Copilot switch, bottom tools, and project open path. This
is an automated operator check, not the uncoached participant required by
`ROUND-03-HUMAN-ACCEPTANCE.md`.
