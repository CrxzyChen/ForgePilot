# R5 hidden main-process error during authoring publication

## Observed failure

On 2026-09-06, original Studio's asset MCP calls hung although project-local
read/apply/test calls continued. Native window inventory revealed an occluded
`Error` dialog: uncaught `ENOENT` from `statSync(assets/asset-manifest.json)`
through `StudioCommandRegistry.readText`, asset import reconciliation and the
coalesced Copilot-state timer. A read-only unauthenticated probe to the local
Broker timed out at five seconds. Closing the recorded modal restored the
expected HTTP 404 response in 10ms, and original Copilot could generate the
remaining three SFX Jobs. No credential change or permission approval was needed.

Root cause: authoring publication moved the old canonical file to a backup
before renaming the replacement. A different process could read inside that
missing-file interval. The existing atomic ChangeSet-record save did not
protect authoritative project files. The uncaught presentation exception then
opened Electron's synchronous modal and blocked the owner main process.

## Repair and executable evidence

- `#applyStates` now publishes existing files with one replacement rename.
  History already contains the previous bytes; failed replacement preserves
  canonical authority and removes its temporary file.
- Coalesced presentation updates support an explicit nonmodal error handler.
  Completion-refresh failure logs fixed non-secret guidance, retains the last
  verified run snapshot, publishes live turn state and retries only on the next
  invalidation. It does not create an uncontrolled retry loop.
- New `check-p32-authoring-publication.ts` reproduced a missing canonical
  manifest between filesystem operations before the fix. It now verifies
  write/undo/redo continuity and injected replacement-failure preservation.
  Passing fixture: `aigame-p32-authoring-publication-gfONkJ` under local Temp.
- Extended `check:p32:progress` reproduced the uncaught timer exception, then
  passed explicit error handling and recovery without recursive retries.
- `check:p32:changeset` includes the publication check; both it and progress
  checks pass after the repair. Full `npm run check` passed in isolated
  package variant `r5-atomic-authoring-final-check`, including installed
  lifecycle/recovery. Log: `artifacts/r5-atomic-authoring-final-check.log`.
  Archive SHA-256:
  `37fc0b2e58eff1e82916ee4cb922b658fc35460b10f42a588d08a59f94f9c056`.

The repair preserves the Studio UI contract and does not restyle any panel or
game HUD. After ordinary UI shutdown, the qualified repair replaced the owner
installation with all 287 content hashes verified. Receipt:
`artifacts/r5-atomic-authoring-owner-install.json`. Previous `d632ef94…` is
recoverable in `AI-Game-Studio-0.3.0-preview.1-pre-r5-atomic-authoring-20260906-153026-9de38024-win-x64`.
Actual installed UI, eight Plan states, seven geometry scenarios and four
old/new game-runtime comparisons all pass:
`artifacts/r5-plan-layout-delivery-Etprqd/summary.json`. Original revision and
Job store remain unchanged. Root did not modify original game source.
The hidden-error incident is supervised recovery evidence, not an unassisted
P33 success.
