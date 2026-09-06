# P33 clean 0.4.0 candidate evidence

- Candidate: `AI-Game-Studio-0.4.0-preview.1-win-x64.zip`
- SHA-256: `2ede62d7145a1dde80d4e868c79baeca7cefb0a4d536c21f1ea628597e87a8c0`
- Source commit: `f41d6c02d037e8b724c0d6463322c5c20551dd14`
- Git tree: `1d12e4b4a9c33296454bf12d8b950e6858b9563f`
- Source content SHA-256: `16f2667e9feaae8672e7a4d87bf04a59c1614904d092ae97b87dc7ff67f6b769`
- Checkout: `artifacts/r5-release-source-GzKI1R/checkout`
- State: machine-qualified, source-bound, eligible for independent acceptance;
  **not independently human accepted or publicly released**

## Actual clean build

The isolated snapshot preserves all 1,319 working-source files. The owner's
branch, index, original game and installed Studio are untouched. A second clean
checkout installed 573 locked packages, built the native workspace from a new
target directory, and completed full `npm run check` with exit 0. No old native
executables were copied into the build.

The resulting archive contains 288 hash-listed content files plus its build
manifest (289 total), including the 0.4.0 limitations. The manifest's source
identity matches the clean checkout before and after compilation. Source
qualification reads that manifest from the actual ZIP; it does not trust a
filename or a manually edited version label.

Full checks include the real Electron shell/editor/authoring/runtime gates,
native GPU checks, 100 deterministic runs each of Pong, Collect3D and Tank,
portable packaging, clean installed-style lifecycle, upgrade/recovery,
uninstall and user-data preservation. Log: `clean-check.log` under the snapshot
parent. The owner installation was not replaced by this candidate.

## Round 05 specialist gates

All commands below exited 0 in the same checkout; logs are under
`artifacts/r5-release-source-GzKI1R/`:

- `check:release:source` — `release-source-gate.log`
- `check:p28:round05` — `check-p28-round05.log`
- `check:p29` — `check-p29.log`
- `check:p30` — `check-p30.log`
- `check:p31:foundation` — `check-p31-foundation.log`
- `check:p31:assertions` — `check-p31-assertions.log`
- `check:p31:package-verification` — `check-p31-package-verification.log`
- `check:p32` — `check-p32.log`
- `check:p33:acceptance-kit` — `acceptance-kit-gate.log`

The first foundation invocation correctly failed because its nine historical
pre-review PNG inputs are excluded from Git. That failed log is retained as
`check-p31-foundation-missing-input.log`; it was not erased or called a pass.
Only those nine existing PNGs were restored to the isolated checkout's ignored
candidate directory. No Jobs, reviews, credentials or final Tank assets were
copied, no provider was called, and source identity stayed unchanged.

For reproducibility, `P31-Controlled-Preview-Test-Fixtures.zip` has SHA-256
`eefcb0a8fbabd5e7cf196418c790149805807464aae081f90b1ac244ff893db4`.
`P31-TEST-FIXTURES.json` pins all nine input hashes and the restore path
`examples/tank-arena/.aigame/local/asset-candidates/p31-neon-bastion`.
The successful rerun required no test weakening or source edit. These are
explicit external test inputs, not an assertion that Git contains media-job
state or that an unfamiliar participant has reviewed anything.

## Eligible, role-separated kit

Kit: `checkout/artifacts/round05-human-acceptance/0.4.0-preview.1-2ede62d7145a`
under the snapshot parent. It records `sourceDirty: false`, the exact build
source, and `finalCandidateEligible: true`.

The 51-file placeholder input has SHA-256
`212e308dbe71a9d583f6d09ae48762fe8ea26c067f4c9e3fbc83b26ed296a3e0`
and tree SHA-256
`ef8f273c089806678f3198a1e9ca4b89612a6c3e0d520889ffd855fdece52dec`.
Repeated preparation is byte-identical. The participant directory contains
only candidate/input archives, hashes, its manifest and task sheet. Completed
Tank outputs, developer logs, source and observer guidance stay outside it.

The offline validator rejects the unperformed real template. A separately
labeled synthetic fixture tests positive validation and tampered-input refusal;
it is never copied into a human result. Actual Journeys A–E remain `NOT_RUN`.

## Remaining external acceptance

A qualifying participant and test budget have not been assigned. Independent
clean-profile, unassisted A–E performance, including physical-network-isolated
play and signed observations, is still required by `R5-OBS-001`. Test-project
audio review delegation does not fill these fields. Do not re-run completed
game production, ask for per-sound approvals or invent a participant to close it.
