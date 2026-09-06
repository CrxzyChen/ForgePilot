# P31 shared test feedback follow-up

Status: source, real-renderer, full regression and owner installation passed
for `f617c330…`. This is a Studio repair, not game authorship.

## Observed defect

The installed owner Studio showed all nineteen MCP-tested Tank files as not run.
It also offered `tests/fixtures/*.game.json` as executable tests. The registry
classified the entire `tests/` directory as tests; the renderer kept outcomes
only in local React state. Durable MCP reports were never read by that panel.

`check-p31-test-report-sync.ts` first fails against the old implementation with
`Fixtures and documentation must not be runnable tests`.

## Bounded repair

- Only `tests/**/*.test.json` files are discovered as runnable definitions.
  Malformed definitions remain visible and fail when run; scene fixtures are
  not silently counted as successful smoke tests.
- Registry runs now persist the same content-addressed report shape already
  used by Engine MCP. New Workspace snapshots expose compact latest outcomes.
- The reader checks report identity and excludes symlinks. It reads bounded
  headers first and caches summaries, instead of repeatedly parsing every full
  debug history. A record is capped at 16 MiB, a scan at 128 MiB of full report
  data and 3000 candidate records. Missing/unreadable history is not success.
- Exact test-report file notifications refresh the panel; Git and other local
  runtime-directory noise remain ignored. Existing fallback refresh remains.
- Both test surfaces merge durable outcomes with an active local run. Captions
  say previous pass/failure, not that an old run certifies the current revision.
  Damaged history is explicitly unavailable; the current run is disabled to
  prevent duplicate activation.
- No palette or layout change: existing Midnight Workshop test rows, typography
  and status grammar remain. The unavailable state uses the warning token.

## Evidence

`npm run check:p31:test-feedback` passes cross-registry visibility, reopen,
new failure replacing old success, fixture rejection, internal-file event
filtering and corrupt-report rejection. Evidence includes
`artifacts/p31-test-report-sync-fnwZz0/summary.json`.

The extended real Electron P15 gate passes at the 960-pixel minimum and 150%
scale. Its separate producer registry runs an actual test, then fails the same
file by requesting too few Ticks for its assertion. Only the result report
changes during the second run, proving the report watcher reaches the renderer.
Reload retains the failure; tampering with the report yields an amber
unavailable state, not green. Evidence:
`artifacts/p31-test-feedback-ui-VczLFZ/summary.json` and both captured PNGs.
Computed status font is 9px, warning color is `rgb(231, 184, 93)`, rows remain
inside their dock and no fixture row exists. Screenshots were inspected; the
existing tool composition and controls are retained (rubric 9/10, no zero).

A read-only check of the actual owner game's 229 legacy reports finds all 19
latest passing outcomes. First read measured 406ms and the cached read 8.7ms,
with identical results; no owner project or credential file was changed.
Latest source/MCP test sync evidence is
`artifacts/p31-test-report-sync-Jb0MTN/summary.json`. Latest real UI evidence,
including the compact shared package-verification surface, is
`artifacts/p31-test-feedback-ui-7fuiA9/summary.json`.
Lint, typecheck and the Studio UI contract pass. Full `npm run check` passed
with the isolated `r5-package-verification-v2-check` variant. On 2026-09-06 the
verified `f617c330…` candidate replaced the owner installation after ordinary
UI shutdown, retaining the complete prior installation as a recoverable backup.
All 287 installed content hashes passed. See `P31-PACKAGE-VERIFICATION.md` for
the exact archive, backup and post-install shipped-MCP proof. Actual Tank
historical-result panel was read in the owner Studio after reopening: all 19
actual test definitions display “上次通过”, and no `tests/fixtures` scene
appears as a runnable test. This observation did not execute or edit the game.
