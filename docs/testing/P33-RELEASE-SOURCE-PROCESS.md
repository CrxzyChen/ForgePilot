# P33 release source and candidate binding

The supervised owner installation is not a release checkout. Preserve it and the
owner's uncommitted work while preparing the 0.4.0 acceptance candidate.

## Reproducible source preparation

`npm run prepare:release:source` creates a uniquely named directory under
`artifacts/r5-release-source-*`. It copies only Git-tracked and nonignored source
files, including current changes and tracked deletions. Ignored build output,
credentials and local project state are not copied. Linked or escaping source
paths fail closed. This is an exact working-source snapshot, not an assertion
that the owner's original Git branch is clean.

The script makes a local snapshot commit on `codex/r5-release-snapshot` inside
that isolated repository, then creates a second clean checkout of the commit.
Neither repository has a remote configured. It never commits, stages, switches
branches, resets, removes or overwrites anything in the original checkout.
Original source identity is checked before and after; the new clean checkout
must have identical source-file bytes. A self-contained Git bundle and
`SOURCE-SNAPSHOT.json` preserve the commit, source-file hashes, parent working
source identity and the exact checkout path. Failed snapshots are retained for
diagnosis, not presented as releases.

## Build and verification

Run dependency installation, the complete check, the source gate and applicable
R5 phase gates **in the returned checkout**. Use a fresh native target directory;
do not copy old executables or change a version label on an existing archive.
Set `AIGAME_STUDIO_REQUIRE_CLEAN_SOURCE=1` for release packaging. No owner
installation is replaced by this process.

The portable manifest now binds the source commit, Git tree, dirty state and
content hash of the complete source-file set. Packaging compares the source
before and after its build and rejects mid-build changes. The limitations
document for the package version is included and hashed in the archive.

Acceptance-kit preparation reads the build manifest **from the actual ZIP** and
compares it to the current checkout. A mismatched source or version is rejected;
a legacy archive without source binding can only be a development kit. An
eligible kit requires matching clean 0.4.0-preview source, not just a clean
directory beside an unrelated ZIP. The existing offline human validator binds
the resulting candidate ZIP hash; kit eligibility is not a human PASS result.

## Executable gate

`npm run check:release:source` checks clean positive qualification; rejects
dirty, stale, wrong-version and failed-clean-gate candidates; excludes an
ignored credential fixture; rejects escaping paths; and creates an isolated
snapshot whose clean checkout preserves all original working-source bytes and
leaves the original dirty fixture unchanged. These are synthetic infrastructure
checks, never independent human evidence.

## Baseline before release version change

The owner-source full `npm run check` completed successfully using package
variant `r5-final-play-check`. The log is
`artifacts/r5-final-play-isolated-check.log`; its 0.3.0 archive SHA-256 is
`3b75b645dd84876c04ab6d3ef116ef0e609393be1da5cf0a187afc2ac4c85860`.
This includes real portable and installed-style lifecycle checks, but predates
the 0.4.0 version and source-binding changes. It is not substituted for a clean
0.4.0 build. Independent participant Journeys A–E remain open.

## Completed candidate and external test inputs

The clean 0.4.0 full check and applicable R5 specialist gates now pass; the
actual archive is `2ede62d7…` and its eligible kit is prepared. See
`P33-CLEAN-CANDIDATE-EVIDENCE.md`. The P31 foundation test additionally requires
nine existing controlled preview PNGs, intentionally outside Git authority.
Their separate archive `eefcb0a8…` and per-file manifest are delivered as test
inputs. An initial missing-input failure is preserved; the rerun passes after
restoring only these images, without changing source or importing them into
the completed game. Do not describe that gate as requiring no external inputs.
