# P32 Plan presentation and narrow-window repair

- Date: 2026-09-06
- Scope: Studio presentation only; no Goal authority or original game writes
- Gates: `npm run check:p32:progress`, `npm run check:p15:quality`,
  `npm run check:studio-ui-contract`, full `npm run check`

## Reproduced defects

The old Plan heading displayed the latest conversation turn status. A completed
turn therefore showed `completed` even with unfinished steps and a pending
candidate review. The real-renderer red receipt is
`artifacts/p32-plan-status-ui-bcxdt4/observations.json`.

The first semantic fix exposed a second defect: at a 960px viewport, the right
dock extended to x=996. The root overflow check missed it because the outer
container hid overflow. `p32-plan-status-ui-0ugXCg` and `F65ifb` retain the
measurements; the new viewport-heading assertion failed on the old layout.

## Repair and real-window coverage

`copilot-plan-presentation.ts` derives presentation from actual Plan steps,
thread-matched Goal/Completion Run, pending approval and active turn. It never
changes those inputs or promotes a completed conversation into accepted work.
The transcript explicitly says `本轮已结束`; completed steps say `步骤已完成`,
not that the whole Goal or R5 has passed.

The real Electron P15 gate now covers eight states: candidate-review wait,
unfinished idle, running, paused, failed, approval wait, all steps complete,
and empty idle. It measures the heading against the viewport, not merely its
parent. The current receipt is `artifacts/p32-plan-status-ui-Xfr3WX/summary.json`.
The waiting screenshot was visually inspected at 150% scale.

Grid sizing retains saved left/right preferences but clamps their visible
widths to the window, leaving at least 260px for the central document. Keyboard
resizing starts from actual visible width after clamping. Seven real-window
scenarios verify minimum size, maximum stored widths, wide/narrow round trips,
restoration and keyboard shrink. At 960px the default center is 362px; even with
440/520px saved docks it remains about 260px and the right edge stays at 960px.
The right splitter retains its aligned 8px hit target. Existing pointer-drag,
focus, menus, syntax colors and renderer recovery checks still pass.

The Studio and Midnight Workshop skills kept this a geometry/state repair,
without changing tokens or game-facing art. Screenshot rubric: hierarchy 1,
surfaces 2, typography 2, state clarity 2, rendered finish 2 = 9/10. The central
report is a test fixture; this is not an independent human usability result.

## Qualification

Full `npm run check` completed successfully with isolated package variant
`r5-plan-layout-final-check`. Log: `artifacts/r5-plan-layout-final-check.log`.
The gate includes three examples repeated 100 times each, native GPU/audio,
archive-extracted clean installation, upgrade, project/crash recovery and
uninstall preserving user data. Archive SHA-256:

`d632ef94dcbdd5af355317a4e0e65ce9d99441b23ba24ef9c01042ceeab88021`

P32 scoped authorization, recovery, retry and ChangeSet isolation gates also
pass. No paid generation was invoked by these checks. Qualification is not
the final audio-complete Tank release or P33 Journeys A–E.

The owner installation is now `d632ef94…`, with 287 verified content hashes.
The previous `87cb8897…` installation is recoverably retained as
`AI-Game-Studio-0.3.0-preview.1-r5-pre-plan-layout-20260906-144848-fdf98ea5-win-x64`.
Receipt: `artifacts/r5-plan-layout-owner-install.json`. Actual installed UI
checks and four old/new runtime replay comparisons pass in
`artifacts/r5-plan-layout-delivery-VuOLb5/summary.json`. The rebuilt runtime
binaries have different hashes; parity was measured, not assumed from source.
Original revision `b6e76869…` and the already-selected Job store are unchanged
by installation and verification. The existing local observation board builds;
remote Sites publication remains unavailable from the recorded access failure.

## Audio review authority

The owner separately accepted UI back WAV `782d23e2…` and then explicitly
delegated subsequent **test-project audio review** to the supervisor. Do not
repeatedly ask for per-sound audition. Keep purpose/length/level/clipping/loop
checks and all existing preview, review, import, audit and rollback boundaries.
Delegated review must not be represented as independent participant acceptance.

The native owner Studio selected candidate `c9965524…`, recording review
`8ba0cc7d…` and import ChangeSet `4cda8196…`. Exact isolated apply/rollback and
20 tests / 255 assertions passed (`r5-audio-import-review-8vUG53`); delegated
approval is recorded in `r5-ui-back-import-approval-vWnS7f`. Only the original
Copilot may apply the original project's files.

The original Copilot subsequently applied that import at `a73d171b…`.
`r5-applied-import-audit-lklvDB` verifies all four exact imported-file hashes.
Context supplement `2c296954…` passed exact semantic/isolated rollback review
(`r5-text-transaction-review-c0nnyy`, `r5-back-provenance-review-PZykox`) and
was approved without changing original source. This approval does not yet
prove application or event wiring.
