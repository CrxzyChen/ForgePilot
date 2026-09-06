# Tank completion increment

This increment closes the general engine and Studio gaps discovered while a
project-level Codex task attempted to build a classic Tank game from an Empty
2D project. Tank remains a project and acceptance workload, never an engine
template or hard-coded capability.

## Delivered engine contracts

- `AuthoritativeContext` now queues deterministic `spawn`, `destroy`,
  `setEnabled`, `setVisible`, and `loadScene` operations.
- All packaged Scenes are addressable by project path or semantic Scene ID;
  snapshots and traces expose `activeScene`.
- `render:text2d` and `ui:text` are capability-registered, Inspector-editable,
  MCP-discoverable Components rendered by the independent wgpu player with a
  built-in bitmap font.
- `collision.define_rule` is an Engine MCP tool and creates the same durable,
  approvable, auditable, rollback-capable ChangeSet as human Studio editing.
- New-project AGENTS/Skills and the generated TypeScript SDK explain and type
  all of the above.
- Empty projects now reserve 64 MiB of QuickJS memory. A real Tank workload
  proved the previous 16 MiB default exhausted the VM while retaining a
  medium Scene's per-Tick snapshots and Timeline beyond 111 Ticks.

## Delivered Copilot controls

- Current Goal state and current Plan steps are always visible while work runs.
- Goal notifications are synchronized from `thread/goal/updated` and
  `thread/goal/cleared`.
- Stop means interrupt the current turn and pause the Goal. Remove uses the
  protocol's `thread/goal/clear` request.
- Starting a new Goal-mode turn resumes an existing paused, blocked, or
  usage-limited Goal before dispatch, keeping the displayed state consistent
  with the executing Plan.

## Executable gate

`npm run check:p21:tank-enablers` proves runtime Scene switching, deterministic
object lifecycle, Text2D/UI registration, collision-rule MCP-to-ChangeSet
behavior, and live Goal/Plan controls. It repeats the lifecycle scenario and
compares complete snapshots before the normal release and installed-Studio
gates run.

## Completion checklist

- [x] Engine capability implementation
- [x] SDK, MCP, project Skill, Inspector, runtime, renderer and ChangeSet parity
- [x] Focused P21 gate plus P18/P19 regression
- [x] AI Game Studio Windows Alpha package rebuilt and clean-install verified
- [x] Project task resumes from its approved gap-ledger ChangeSet
- [x] Tank project builds a playable game from Empty 2D
- [x] 100 deterministic runs and structured failure diagnosis pass
- [x] Independent Windows Development and Release packages pass
- [x] Human-facing dashboard links final evidence

## Tank project acceptance evidence

The project-level Codex Goal in
`<tank-project>` completed its six-step Plan and the final
Alpha 5 reship:

- Five replay scenarios completed with zero diagnostics: gameplay, command
  routing, victory, defeat/invulnerability, and friendly-fire immunity.
- Seed `20260903` plus identical gameplay input completed 100 times with zero
  failures and one unique authoritative state hash:
  `99f3328a6b7f3498eca530328a565e87f1a96b119811b7a7c8639df6eb327b13`.
- A controlled `HudSystem` fault was localized to
  `scripts/systems/hud.ts:14:19`, `tank:system/hud`, `tank:module/hud`, and
  `tank:object/arena/match`; the exact repair restored zero diagnostics and the
  pre-fault file hash.
- Startup Scene selection was applied through audited ChangeSet
  `changeset:6834373b-c8bf-4f69-ad6b-c05925c3958b`. Its proposal hash is
  `fd47fd10078fbdb2832b71b40cfa1761578282b26b4a9ac9d2958535ddaea5db`
  and its approval-content hash is
  `c612caba2ecac9606e95243a15cab2f14c798798eb586600c40bcae5bddef1f1`.
- Five final Alpha 5 replays passed with zero diagnostics: command routing and
  gameplay smoke at hash
  `99f3328a6b7f3498eca530328a565e87f1a96b119811b7a7c8639df6eb327b13`,
  combat win at
  `cd8e7657d3642510dc8171223b7504565f65d316898d2305567946bab47b31e6`,
  combat loss at
  `31667eb9ee2d76439dd967434dd35d32d3da240d727c75dbf73fb7728a76285e`,
  and friendly fire at
  `6b08e7ae41263f4cd0f7f62127f79c58b7d69c326419e0fcabe7b15f550f54ef`.

## Final Alpha 5 artifacts

- AI Game Studio portable ZIP:
  `artifacts/studio-windows/AI-Game-Studio-0.2.0-alpha.5-win-x64.zip`, SHA-256
  `0ed671348997f76917a1a7b5bd7c893e97ca71c27cfd77fce9bafd14e5096018`.
- Opening the final installed Studio directly launches its bundled native
  `codex.exe app-server`. Tank reached Codex `ready`, and the Windows visible
  window inventory contained Studio but no console window.
- Tank Development ZIP:
  `<tank-project>\out\windows-development\Tank-0.1.0-development-win-x64.zip`,
  SHA-256
  `36fd8d48cb34b0aa56e5397d4c438bc79f7e5c031441fe6549182185f7b49241`,
  reproducible core
  `ab83ee25c1ad47956ff6f0951d6646453a7ad5d19070a002067ee8e3f8a6ed04`.
- Tank Release ZIP:
  `<tank-project>\out\windows-release\Tank-0.1.0-release-win-x64.zip`,
  SHA-256
  `a17da523bd114191192800a54d19625802d5dd29ec09a58fd40578996a02eb40`,
  reproducible core
  `bb4d50d8a52869f893c543e5cbbc90c847c29e371d0d75a2610cd2ebb6795704`.
- The final Release package contains eight player-only files and no source,
  Studio, Codex, Node.js, Rust, test, replay, credential, or cache content.
- `Tank.exe` launched from a fresh temporary directory with a System32-only
  `PATH`. Menu, Space-to-start, shooting, restart, and Escape-to-menu were
  verified interactively. Movement is additionally covered by deterministic
  gameplay replay and the native held-input bridge tests because desktop UI
  automation cannot reproduce a real held key reliably.

The final interactive run exposed two generic player defects before sign-off:
the 2D camera treated the world origin as the viewport corner, and a press plus
release between fixed Ticks could be dropped. Alpha 5 now derives a centered,
aspect-preserving camera from `render:camera2d` and queues input edges while
continuing to emit held actions per Tick. Both repairs have focused Rust tests
and passed the complete release gate.
