# P31 — Copilot-native Windows package verification

Status: source/service, compiled MCP, real Electron UI, full regression and
owner installation passed for `f617c330…`. Actual Tank Copilot adoption is next;
this is not R5 completion.

## Why

The actual Tank author could build a Release ZIP but had no bounded MCP tool
for starting that package. Supervisor-only checks cannot prove that the
internal Copilot can perform this step. A new failing probe also established
that old build reports had no project-revision binding.

## Shared surface

- `StudioGameBuildService.verifyPackage(profile, expectedZipSha256)`.
- MCP `build.verify_package` and `build.read_verification`.
- Studio Build panel: verify existing Development / Release package, immediate
  busy state, duplicate-action protection and explicit failed/passed feedback.
- New-project `prepare-standalone-release` Skill teaches the call and limits.

Verification reads the current report, snapshots the exact ZIP locally,
checks bounded archive paths/content/manifest and Release exclusions, and
compares the packaged executable against the trusted installed Player bytes.
It executes only fixed startup verification and five native GPU frames, using
an allowlisted Windows environment and per-process timeout. Child execution
is asynchronous; no arbitrary command, argument or environment API is exposed.

Successful evidence is immutable, content-addressed and binds project revision,
ZIP hash, build-report hash, Player hash and actual PNG hash. Read-back checks
receipt and screenshot integrity. Operations write only derived local evidence,
not Game IR, assets, gameplay scripts or approved project instructions.

## Evidence

- Red: `Build must bind current project revision before verification` failed
  against the previous builder.
- Initial source + compiled MCP pass:
  `artifacts/p31-package-verification-HKUInw/summary.json`.
- UI pass before the final compact report typography follow-up:
  `artifacts/p31-test-feedback-ui-cwEoIj/summary.json`.
- Async service + compiled MCP: `artifacts/p31-package-verification-gUkPzi/summary.json`.
- Final compact UI: `artifacts/p31-test-feedback-ui-7fuiA9/summary.json`.
  At 960×640 / 150%, the verification button is 10px, report text is 10px
  Consolas, heading is 11px and report background is `rgb(9, 11, 16)`.
  Busy/disabled, missing-build failure and real native-verification success
  pass. The captured screenshot was inspected; no new visual language or
  light surface is introduced.
- Machine gates: `npm run check:p31:package-verification`,
  `npm run check:p15:quality`, `npm run check:studio-ui-contract`, full check.
- Project Skill validator passed.

The gate checks wrong expected ZIP, damaged archive, arbitrary path,
untrusted Player hash, traversal ZIP, tampered PNG, changed project revision,
extra MCP executable arguments and actual service/MCP startup/window success.

## Packaging safety finding

The first full regression reached packaging, then encountered the running
canonical owner installation's Windows lock. All 287 installed content hashes
were independently rechecked and remained intact. The packager now rejects a
running target before building or deleting target files, and rechecks before
replacement. Regression candidates use `AIGAME_STUDIO_PACKAGE_VARIANT` so the
owner installation is never the test output. The guard's deliberate failure
against the running installation was verified without changing any files.

Two subsequent full-regression attempts reached the P15 screenshot stage but
failed on transient Chromium capture-surface errors after renderer recovery.
The gate now waits for two animation frames and compositor presentation before
capture, and permits only two bounded recoveries for those specific errors.
It still requires a real, nonempty image. The next targeted P15 run passed with
zero retries; the complete isolated-candidate run is being repeated. Failed
captures are not counted as UI evidence.

The next full run passed source/UI/runtime and game-package gates, producing
candidate `5f4d7596…` (288 files including its manifest), but installed P15 then
exposed a verification-fixture path assumption: its evidence folder and
script host were located relative to a development checkout. That candidate
was not installed for the owner. The fixture now receives the actual Studio
toolchain and stores installed-run evidence outside the installed application.
The isolated `r5-package-verification-v2-check` candidate then passed the full
`npm run check`, including installed lifecycle/upgrade/recovery. Archive SHA-256:
`f617c330f35fe56f0e00957d9dd194bbc3932bc89b5c8607e2820251d2378913`.
The previous failed artifact is preserved for diagnosis, not accepted as delivered.

## Installed delivery — 2026-09-06

Before replacement, the exact candidate's shipped MCP and Player built and
verified both Development and Release on an isolated Pong project, including
receipt read-back and a real native-window PNG:
`artifacts/r5-installed-package-probe-jh6VCH/summary.json`.
The Release frame was inspected. This probe did not load the owner's credentials
or original Tank project.

After ordinary UI shutdown of the idle owner Studio, all 287 candidate content
hashes and its archive hash were checked. The old installation was moved into
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-pre-package-verification-20260906-030730-win-x64`.
The verified candidate replaced the canonical owner directory, with all 287
installed content hashes rechecked. The same two-profile shipped-MCP/native
probe passed again from that actual owner directory:
`artifacts/r5-installed-package-probe-tjPjPE/summary.json`.
No original game file or credential was modified by the installer.

## Limits

Five native frames prove bounded startup/rendering, not full gameplay replay,
good visual design, audible SFX, network isolation, a clean-machine test or
independent P33 acceptance. Old reports lacking `projectRevision` require a
new build; a retained historical receipt never certifies a changed project.
Formal Tank SFX and independent participation remain open.

## Post-Bus-fix original Tank preflight

At revision `20eff586…`, original Copilot generated and verified these
partial-audio packages on 2026-09-06:

- Development `97b780381421676081021a5bf177c833451367815799bef6eac7d6b5873fb6f9`,
  54 files, receipt `package-verification:f729bd8f6b76facaff71e35bd0b6afa9268f66000a50ce710c3a69f27371d6cc`.
- Release `cfaca989edac3e04d49f4e909aecbf75b34111641549ed5838e3fb098611caee`,
  20 files, receipt `package-verification:ab5a43c24b266842f12f431f4ecc9fac71080f2c8657dac8e1a6c99bf634dda7`.

Read-only supervisor verification confirms both receipt identities, their
retained `verified-package.zip` hashes, frame hashes and the installed trusted
Player identity. However, `runtime.compare_player` subsequently rebuilt the
Development output while replaying current inputs. Its current report/ZIP no
longer matches the earlier receipt; that mismatch was detected, not waived.
The retained verified archive remains historical evidence. Release still
matched its receipt when checked. Final delivery must build and verify both
profiles after all content and observation work; these receipts do not certify
later overwritten outputs or complete audio coverage.
