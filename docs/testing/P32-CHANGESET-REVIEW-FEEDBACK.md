# P32 reviewer feedback follow-up

## Discovered gap

The original Tank Copilot proposed wall-break audio wiring in `4f6331a6…`.
Isolated runtime regression failed at Tick 0 because its fixture declared a
`tank:ui-state` without the UI objects required by `scripts/systems/ui.ts`.
Rejection prevented application, but `reject(id)` recorded only the decision,
leaving Copilot unable to discover the reviewer's concrete failure evidence.
Native conversation input was unreliable. This is a structured repair-loop gap,
not a reason to apply failing game content or write game files outside Copilot.

## Bounded implementation

`StudioChangeSetService.recordRejectionFeedback(id, { proposalHash, reason })`
records optional, versioned `rejectionFeedback` on an already rejected proposal.
The record includes a content-addressed ID, exact proposal hash, reason and time.

- Wrong state or proposal hash is rejected before mutation.
- Reasons are bounded to 4096 characters; unsupported control characters fail.
- Repeating the exact decision is idempotent; a different reason cannot overwrite
  existing feedback. A repair requires a new proposal, not rewritten history.
- The record survives service restart and is returned by `change.read` and the
  existing compact ChangeSet projection.
- No agent-writable review/approve/reject tool is added. Rejection stays rejected,
  approval stays null, and the candidate files cannot be applied.
- A dedicated audit event references the feedback ID without duplicating its
  full text. This field stores reviewer evidence, not trusted agent instructions
  and not a change to project policy.

`reject(id, { proposalHash, reason })` now validates the reason and proposal
version before saving the rejection and feedback together. A stale version or
invalid reason cannot leave a proposal rejected without its intended feedback.
The separate method remains available for legacy rejected proposals. The
optional record is readable by the installed legacy MCP projection without
replacing the owner executable.

## Desktop workflow

Both the Source Control card and Diff toolbar open the same bounded native
dialog. It shows the proposal identity and requires a reviewer reason before
submission. Rejected cards display durable feedback; old rejected cards without
feedback offer a supplement action. These are reviewer IPC actions, not agent
tools, and neither action applies game files or starts a new Copilot turn.

- Escape/cancel preserve the proposal and restore the previous control's focus.
- Opening focuses the textarea; empty input cannot submit and length is bounded.
- Submission is single-flight with visible pending state.
- A concurrent review returns an inline error, keeps the draft and permits
  cancellation rather than overwriting the newer decision.
- Reload preserves the full feedback text and version-bound identity.
- Exact ChangeSet record notifications refresh only the review list. They do
  not trigger authoring snapshots or Git scans. The listener coalesces bursts
  and is removed when its project closes.

The interface preserves the approved Studio tokens and compact controls. This
is development/isolated installation evidence, not a completed P33 journey or
proof that the owner installation has been updated.

## Verification

The new isolation check first failed because `recordRejectionFeedback` did not
exist. After implementation, `npm run check:p32:changeset` passes state/hash,
input validation, persistence, idempotence, immutability and no-apply checks.
`npm run check:p32:agent` passes a real compiled MCP read: a reviewer records
feedback after the MCP process starts, and that process reads the exact record
without restarting. Agent review/approval capabilities remain absent. Atomic
reject validation first failed when `reject` ignored its feedback argument;
the completed check now proves invalid feedback leaves `awaitingApproval`
unchanged and valid feedback cannot grant approval or apply source files.

`check:p32:progress` verifies the exact review-record watcher filter, Windows
separators, ignored temporary/audit paths and isolation from authoring refresh.
The new real Electron gate exposed two failures before passing: initial focus
occurred before `showModal()`, and proposals created after opening Source
Control did not refresh. Explicit post-open focus and the dedicated record
notification fixed the causes without relaxing either assertion.

`npm run check:p15:quality` passes with
`artifacts/p32-review-feedback-ui-9CKsKI/summary.json`. At 960px minimum width
and 150% scale it verifies actual renderer/preload/reviewer IPC, cancellation,
focus restoration, rejection, reload history, concurrent-review draft recovery
and legacy feedback supplementation. All three fixture proposals remain
unapplied. Geometry/style checks report contained dialog, zero root overflow,
10px form/button type, 28px controls and no native light button. Review,
history and error PNGs accompany the summary.

Rendered review using the Midnight Workshop rubric scores 9/10: workflow 2,
surface discipline 2, typography/contrast 1, state/accent 2, rendered finish 2.
The compact typography follows the existing Studio contract; this narrow modal
review does not claim a global accessibility or independent usability result.

The earlier service-only full `npm run check` completed with isolated package
variant `r5-review-feedback-check`, archive SHA-256
`045d37ffaa2d3190a4b0ee1d871a5b1f7a54fd275638c19166544e48613ad010`.
It is not the final desktop-feedback candidate: the added UI and notification
work was frozen afterwards. The new full `npm run check` completed with exit 0
as `r5-review-feedback-ui-check`; its P15 evidence is
`artifacts/p32-review-feedback-ui-lXOc6G/summary.json`. `npm run check:p32`
also completed with exit 0, including authorization, progress, recovery, retry,
transaction isolation, compiled MCP and the Studio UI contract.

Qualified reviewer-UI candidate (now installed; see delivery below):

- Archive: `artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-review-feedback-ui-check-win-x64.zip`
- SHA-256: `dbf2197c929102c0d52b85300af614f2e1393950af1c78e12f3079b53bd596f3`
- All 287 manifest content hashes independently rechecked; zero mismatches.
- Clean archive extraction/install, portable upgrade, renderer-crash recovery
  and uninstall preserving user data passed. The installed quality process
  cannot return success unless the new reviewer UI gate also succeeds.

Earlier default-target packaging safely stopped because the owner Studio was
running; the guard removed no owner files. At that checkpoint the owner directory matched
all 287 entries of its existing manifest and the recorded host/Player/SDK
hashes. It was the installed `r5-audio-control-check` build (`ae576cfe…`),
not this new candidate. The adjacent unqualified ZIP is a historical archive
(`3f2be8db…`, dated 2026-09-05); its name must not be used to infer the running
installation's identity. No owner executable was replaced at that checkpoint, and neither archive
is a final 0.4.0 or independent human acceptance claim.

## Original supervised repair evidence

The supervisor used this service only after the bounded checks passed, attaching
the actual failure to rejected proposal `4f6331a6…` at
`2026-09-06T03:54:22.864Z`. Feedback ID:
`review-feedback:0175fdf1ea23d8966e6e29806edd246cd099edeaa6a9e421cab87755b6986353`.
The failed source result remains
`artifacts/r5-wall-wiring-review-BoGZra/wall-break-audio.test.json`.
Original Game IR/source revision stayed `6f9d3f9e…`. Actual Copilot consumption
and a passing replacement proposal are still to be verified.

An additional isolated check launches the already-installed owner MCP, not the
new build. It then introduces the exact rejected review record after that
process has started and verifies `change.read` returns the same feedback ID
and full reason. `artifacts/r5-installed-feedback-xc3gk0/summary.json` passes,
with the original revision unchanged. Thus no owner upgrade is required for
read compatibility; actual conversation consumption is still a separate step.

That separate supervised repair step has now passed after the owner-closed
Studio retry. Original Copilot read `4f6331a6…` and its feedback, authored
replacement `f1a02d7e…`, and removed the unnecessary fixture UI-state object
without weakening the wall/projectile assertions. The replacement passes
20 tests / 255 assertions, real destruction/nonfatal/idle audio probes and
exact transaction/rollback (`r5-wall-wiring-review-QyaklP` and
`r5-text-transaction-review-BQh4Yf`). After supervision approved it, original
turn `01a07513-8aa3-7832-9c87-4e3e871d71a0` applied and tested the replacement.
Exact original-file revision `77be28e9…` and the persisted test's full bundle,
snapshots, state and audio match isolated review (`r5-wall-wiring-decision-Nmlh4l`
and `r5-original-ui-wall-reports-E9pwlT`). The supervisor did not author/apply
game files. This closes actual feedback consumption and repair; owner delivery
is separately verified below. Independent P33 usability remains open.

## Owner installation — 2026-09-06 13:16 +08:00

After normal Studio shutdown, `artifacts/r5-install-review-feedback.ps1`
validated contained paths, staged the qualified candidate, checked 287 file
hashes, and recoverably moved the old installation to
`AI-Game-Studio-0.3.0-preview.1-r5-pre-review-feedback-20260906-131625-5684a85e-win-x64`.
The default owner directory now contains archive `dbf2197c…`, not `ae576cfe…`.
No game/credential files were changed. The original Tank project was reopened.

- `r5-review-feedback-owner-check-2gRhYr/summary.json`: all 287 installed
  hashes, old-install backup, original revision unchanged, all 20 tests / 255
  assertions with exact reviewed module/state/audio/snapshot parity.
- `r5-installed-review-ui-DI96Ov/summary.json`: actual owner executable under
  an isolated profile, P15 quality/recovery and P32 reviewer dialog at 150% DPI;
  cancellation, actual IPC, persisted feedback/history, conflict draft and
  legacy supplementation pass without applying original game files.
- `check:studio-ui-contract` passes 14 tokens / 11 surfaces.

Together with the original Copilot's approved wall repair above, these close
the owner-delivery checklist item. They do not close R5 or independent P33.
