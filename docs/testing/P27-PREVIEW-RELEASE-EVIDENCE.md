# P27 Preview release evidence

- Date: 2026-09-04
- Studio: `0.3.0-preview.1`
- Target: `x86_64-pc-windows-msvc`
- Machine status: passed
- Human status: open (`R4-OBS-001`)

## Release candidate

| Artifact           | Value                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| Portable directory | `artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-midnight-workshop-win-x64`     |
| Portable ZIP       | `artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-midnight-workshop-win-x64.zip` |
| ZIP size           | 311,645,184 bytes                                                                       |
| SHA-256            | `145908c2662fbe7042eeb95f4b2157b5cfa3fdd7f39c82f72d5b2ef4dbacd412`                      |
| File count         | 287                                                                                     |
| Electron           | `44.1.1`                                                                                |
| Bundled Codex      | `0.152.1`                                                                               |

The final hash is also stored in the adjacent `.zip.sha256` sidecar. The build
manifest records `requiresGlobalNode: false`, `requiresGlobalCodex: false`, and
the per-file hashes.

## Executed gates

### Round 04 machine gates

`npm run check:round04:machine` and the repaired stable diagnostic assertion
proved:

- P23: persistent session, stable ID, shared RenderSnapshot, live advance,
  pause retention, one-Tick step, animation-frame Scene preview/navigation,
  conventional pick/pan/zoom/reset and Q/W/E/R controls, immediate transform
  release, serialized authoritative commits, lightweight authoritative input,
  late-input rejection, and preview-failure isolation;
- P24: deterministic physics enter/stay/exit with object and Collider IDs,
  contact/normal/Tick data; Sprite resources; Studio/Player audio and UI; Tank
  menu, pause, win, lose, replay, segmented execution, package, and Player;
- P25: perspective/depth 3D, imported mesh/material/light projection, 3D
  collision, deterministic collection loop, and Studio/Player package parity;
- P26: real test discovery/debug state, Git daily workflow, effective settings,
  secret rejection, Bailian provider cost/cancel/candidate/import/redaction,
  specialized editors, and Prefab override inspection.

`npm run gate:round04:placeholders` returned `openCount: 0`. The native Player
unit suite returned 9 passed tests and explicitly verifies that no legacy
isometric rectangle fallback is used for a 3D scene.

### Release and installed lifecycle

`node scripts/check-p20-release.ts` passed the reusable release suite against
the final release Player binary:

| Project         | Deterministic runs | State hash                                                         | Release ZIP hash                                                   |
| --------------- | -----------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Pong 2D         |                100 | `300d0b92b775ea08289a1c14e2788ddbdf1cf38aa4782293b2b21429e9b17d54` | `2e6cb3fef170f8b91bcfdd2744ec194cd59647512f8137c2a06e41adeaacc0f1` |
| Collect Room 3D |                100 | `7e028d2799ade25241a607c3d67decea68ea85f9a10983faf1c01f41e8156a21` | `695e585aba3e685ef3cebf84c4c896f8dc11705244a3af27a669c57a62299db7` |
| Tank Arena      |                100 | `dfd2210a224f40399364004453e0dcce8ced303ae66952709c60ab42af030c6e` | `1052a994d44c5897aa6cd663893b73eada57dde82fe1b10578bd96e0a2633974` |

The suite also passed exact ChangeSet rollback, 100-run legacy regression,
clean-PATH packaging, credential scan, dependency reachability, package-content
exclusions, standalone Player verification, and no external runtime dependency.

After the final Player rebuild, `node scripts/check-p20-installed-studio.ts`
re-extracted the current ZIP and passed:

- clean install and update-style launch;
- preload bridge and frameless window controls;
- Empty / Empty 2D / Empty 3D presets;
- no renderer `require` or Node process exposure;
- 150% display scale and 960×641 minimum viewport;
- keyboard and pointer panel resizing, focus visibility, styled scrolling, the
  complete dark Source Control presentation, and all required workbench
  regions;
- exact center/right boundary alignment, an 8px separator hit target, right
  dock clipping, and contained Inspector/Copilot internal dividers;
- renderer-crash recovery and project restoration;
- portable uninstall with user-data preservation;
- exclusion of the legacy Tank implementation.

The package's internal clean gate also passed doctor, bundled Codex readiness,
ChatGPT account detection, project task creation, semantic authoring, sandboxed
runtime execution, and standalone Player launch.

## Independent acceptance handoff

`scripts/prepare-round04-human-acceptance.ps1` generated and verified the
role-separated handoff kit at:

`artifacts/round04-human-acceptance/0.3.0-preview.1-4d7f37e23173`

The participant directory contains exactly three files: the Studio ZIP, its
SHA-256 sidecar, and `PARTICIPANT-TASKS.md`. The observer-only protocol,
blank run record, structured result template, offline evidence validator,
machine evidence, and release limitations are kept in the separate observer
directory. The copied Studio archive was rehashed after the copy and matched
the release SHA-256 exactly. `ACCEPTANCE-MANIFEST.json` records both file sets
and the role-separation requirement. The validator hashes every collected
artifact and writes a closure proof, but deliberately preserves the boundary
that only the original signed record and consented recording prove human work.

## Known human boundary

No independent participant has run Journeys A–D or the P27 clean-install
journey. Machine evidence therefore marks P27 as `validation`, not `completed`.
The release candidate must not be promoted until the participant record,
recording, output project/package hashes, issue ledger, blocker fixes, and
clean-profile retest are attached to the observation board.
