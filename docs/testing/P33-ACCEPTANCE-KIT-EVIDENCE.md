# P33 role-separated acceptance kit evidence

- Gate: `npm run check:p33:acceptance-kit`
- Status: clean 0.4.0 candidate and eligible kit now pass; independent human
  result remains open. See `P33-CLEAN-CANDIDATE-EVIDENCE.md` for current evidence.
- Date: 2026-09-05

## Historical prepared development kit

The gate prepared
`artifacts/round05-human-acceptance/0.3.0-preview.1-1dc209e15d44` with two
strictly separated directories:

- `participant` contains only the installed Studio archive and sidecar, the
  placeholder Tank input archive and sidecar, a participant manifest, and the
  task-only sheet;
- `observer` contains the full protocol, observer record, structured result,
  machine evidence, offline validator, launcher, and an initially empty
  evidence directory.

The current development candidate is
`AI-Game-Studio-0.3.0-preview.1-win-x64.zip` with SHA-256
`1dc209e15d44c16fcce52ab69b000d47a67668f4956aa8f74d34330c98600e3d`.
The supplied `Tank-Placeholder-Input.zip` has SHA-256
`58063022632d46d5632c2533385e91e1b5ef97237d2945d9104e1954d6c6add0`.
It contains 55 sorted project files, excludes local candidates and build output,
and records source-tree SHA-256
`f9bd0e24b8598c9f72d9e552dcf5a776993b4eb12b065a9809c239ae88ac8e15`.
Two consecutive preparations produced the same archive and source-tree hashes.

The task sheet contains Journeys A–E and the canonical outcome but excludes the
observer's pass rubric, severity definitions, findings, and evidence result.
The participant manifest explicitly says the participant receives only that
directory.

## Fail-closed offline validation

The PowerShell validator uses only .NET file and SHA-256 APIs. It requires:

- a clean profile and a participant who did not implement Round 05 or use the
  candidate;
- signed PASS results for Journeys A–E without coaching or forbidden tools;
- stable Goal/Plan/Tool/Job/review/ChangeSet/Runtime/test/build/package IDs;
- bounded cost with zero duplicate billing or duplicate side effects;
- Studio/Player parity and offline Development and Release execution;
- recordings, projects, observations, tests, Replay, audit/cost exports, scans,
  packages, signatures, and relative contained evidence paths;
- matching candidate/input hashes and a final-candidate-eligible kit manifest;
- no credential-shaped text in the result or text evidence.

The machine gate executes the validator against the unperformed template and
requires rejection. It also requires that no `ACCEPTANCE-PROOF.json` is written
for an incomplete run. This proves validator behavior only; it is not human
acceptance.

The input-project archive uses sorted forward-slash entry names, fixed ZIP
timestamps, and a content-derived source-tree manifest. The offline validator
recomputes both the ZIP hash and the 55-entry source-tree hash, rejects path
traversal, duplicate names, and excluded `.git`, `.aigame`, `out`, or `dist`
state. The machine gate prepares the kit twice and requires byte-identical
input archives.

The same gate also runs a clearly labeled synthetic validator fixture. A
structurally complete fixture produces a proof containing `ok: true`; appending
one byte to the hash-pinned Tank input then makes validation fail and prevents
proof output. The fixture result is never copied into the kit and never counts
as human evidence.

## Deliberately open evidence

The historical development kit records source commit
`36427446f7a737f517ee94343c5bbc423fbce5b1` but also records
`sourceDirty: true` and `finalCandidateEligible: false`. A final P33 kit must be
rebuilt as 0.4.0 Preview from a clean checkout. `R5-OBS-001` remains open until
an eligible kit is completed by an independent participant and its signed
result passes the offline validator.
