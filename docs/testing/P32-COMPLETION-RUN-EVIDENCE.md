# P32 Completion Run recovery evidence

- Gates: `npm run check:p32`, `npm run check:p32:clean-profile`
- Status: P32 machine phase passed; independent Journey D remains open under
  P33
- Date: 2026-09-05

## Durable orchestration

`CompletionRunService` stores project-local, non-authoritative orchestration
state under `.aigame/local/completion-runs`. A stable Completion Run links its
Codex Goal, Plan steps, Tool Calls, media Jobs, review decisions, ChangeSets,
Runtime Sessions, observations, tests, builds, and packages. Each mutation
writes an atomic checkpoint and append-only audit event. Project Game IR and
assets remain unchanged by orchestration state.

Studio synchronizes the native Codex Goal and visible Plan into this run. The
Engine MCP tools `completion.run_current` and `completion.run_list` let Codex
recover from recorded state without using the renderer or mouse. Media,
authoring, runtime observation, test, build, and package operations attach
their stable IDs automatically. Stop and remove are intentionally not Agent
tools: stopping retains links/cost/audit, while removal only hides a terminal
run from normal presentation.

The Copilot Goal card displays the reconciled recovery status, current wait,
committed budget, currency, and checkpoint sequence using the approved
Midnight Workshop shell grammar. `npm run check:p15:quality` and
`npm run check:studio-ui-contract` pass after this addition.

## Restart and exactly-once evidence

`check:p32:recovery` recreates the Completion Run service between named waits
and reconciles the authoritative external stores before choosing the next
state. It covers provider approval, provider execution, candidate review,
ChangeSet approval, Runtime failure, test failure, and build failure. It also
proves:

- the same provider idempotency key cannot belong to two Jobs;
- budget totals are based on unique paid operations and remain stable after
  restart;
- stopping retains Job, ChangeSet, cost, and audit identity;
- removing presentation does not delete the durable run;
- cancellation, rejection, retryable failure, and restart do not create a
  second paid-operation budget entry;
- project manifest, asset manifest, and Scene authority are not mutated.

`check:p32:retry` fixes the media policy at three attempts, 1-second base
backoff, and a 30-second cap. Agent retry respects the provider `Retry-After`
deadline, ambiguous timeouts still require reconciliation, non-retryable
failures are rejected, and human retry cannot exceed the attempt ceiling.

`check:p32:agent` drives the compiled Engine MCP server and proves automatic
relationships for an actual candidate Job, Tool Call, ChangeSet preview,
Runtime Session, PNG observation, test run, Development build, and Release
package. The resulting run is queryable after all subprocess boundaries.

`check:p32:changeset` verifies rollback ownership after process restart. An
unrelated human-created file survives exact rollback, a later human edit to the
same owned file is detected before any rollback write, and a second apply is
rejected rather than replayed.

## Clean-profile, security, and package evidence

`check:p32:clean-profile` runs the constituent gates in one process chain and
exits successfully only after all of the following pass:

- P15 creates a fresh Studio user-data profile, rejects plaintext settings,
  stores named credentials encrypted, migrates legacy provider settings, and
  opens a frameless Electron shell;
- P26/P29 exercise provider-discovered models, capability-only Agent requests,
  approval policies, cancellation, bounded retry, redacted outbound records,
  candidate review, transactional import, and exact rollback without real paid
  requests or access to the user's credentials;
- P1 rejects an invalid path-addressable Game IR document and matches the
  versioned v0 migration golden file;
- the real Electron P15 quality gate runs at 150% scale and minimum viewport,
  exercises pointer/keyboard interaction, crashes the renderer, restores the
  project, and verifies the Completion UI remains within the Midnight Workshop
  contract;
- P20 performs 100 deterministic runs each for Pong, Collect Room 3D, and Tank,
  validates exact runtime module IDs, Replay, resource references, clean-PATH
  standalone execution, reproducible packages, and performance budgets;
- P20 then builds and extracts the Studio Windows archive, verifies its bundled
  Codex/runtime paths, starts and updates it without global Node/Codex, repeats
  crash/project recovery, and scans release contents for forbidden development
  files and credential-shaped values.

The successful installed Studio archive produced by this gate has SHA-256
`1dc209e15d44c16fcce52ab69b000d47a67668f4956aa8f74d34330c98600e3d`.
It is a development machine candidate, not the final clean-checkout 0.4.0
candidate required by P33.

## 2026-09-05 installed Copilot progress regression

The real Tank dogfood run exposed three defects not covered by the earlier
machine matrix: words such as “完成验收” overrode an explicit pending state;
separate assistant messages and automatic Goal turns were concatenated; and
every streaming notification rewrote two durable checkpoints. The observed
run reached checkpoint 10044 while waiting on its first planning ChangeSet.
Historical audit records are retained, not deleted or rewritten.

`npm run check:p32:progress` now verifies explicit state precedence, bounded
plan blocks, per-item message boundaries, completed-line streaming, early
deltas preceding the RPC response, automatic Goal turn adoption, and rejection
of stale/cross-thread deltas. The test uses a mocked App Server transport; it
does not contact a model or use account credentials.

The same gate sends 100 unchanged goal/usage updates and proves that both the
run store bytes and audit bytes stay unchanged. Source-goal fingerprints are
persisted separately from reconciled external state, so a restart preserves
an approval wait and its attempt number. New external waits, resolved waits,
and genuine Goal state changes still produce checkpoints. Re-linking the same
external ID is idempotent. The full P32 gate passes with these assertions.

These fixes improve execution truthfulness; they do not supply the missing
selected assets or turn the Tank project into a completed game.

The initial full-check attempts timed out before the Electron smoke entrypoint
under this Windows hidden-console runner. The same P15 smoke passed with
`ELECTRON_NO_ATTACH_CONSOLE=1`, which preserves piped output instead of attaching
to the parent console ([Electron startup source](https://github.com/electron/electron/blob/main/shell/app/electron_main_win.cc)).
P15 and the clean-profile installed-package launcher now request that transport
explicitly; other gates in this run inherit the same process-scoped variable.
No timeout was extended and no UI assertion or sandbox check was disabled.
The complete `npm run check` then passed, including P15 real Electron quality,
P20 standalone games, packaging, clean-PATH installation, update and recovery.

## 2026-09-05 scoped owner delegation and approved MCP apply

The owner explicitly delegated R5 review and necessary paid generation.
`check:p32:authorization` covers exact project/thread/active-Goal matching,
Completion Run identity, expiration, revocation, malformed grants and
unknown-cost consent. The existing global per-call policy remains unchanged.
The P29 broker test proves a scoped grant does not send an unlinked old job,
while a new linked job records `approvedBy: policy` and its authorization ID.
The mock provider run checks routing and audit, not live cost or game quality.
`asset.resume` re-evaluates an existing queued/approval-wait job under that
policy without allocating a new job or idempotency key. Completed/running
jobs are returned without another billed request; failures require the
separate bounded-retry path. Its compiled MCP-to-main-broker route is tested.

`check:p32:agent` now calls the compiled Engine MCP `change.apply` tool. An
unapproved proposal is rejected without writing the target; after a separate
reviewer approves it, MCP applies the exact content and rejects a second
apply. `change.approve` remains unavailable to project Codex. The tool is
correctly annotated as a potentially destructive, non-read-only mutation.

The real supervised continuation exposed another boundary: App Server sends
MCP elicitation with `message` and expects `action/content/_meta`, not the
legacy `decision` reply. Handling now preserves the message and responds to
empty confirmation forms with the pinned protocol shape. Nonempty forms and
URL flows cannot be blindly accepted by the generic button; resolved requests
are removed. The mock App Server regression covers accept, decline, incomplete
form rejection and server-side resolution. See the official
[App Server elicitation contract](https://learn.chatgpt.com/docs/app-server#mcp-server-elicitation-requests).
Installed verification confirmed that the formerly opaque request is the MCP
transport asking to run `change.apply`, not a provider charge. The repaired
panel displays that exact message and keeps its controls visible. No unknown
request was approved.

The Studio-owned MCP configuration now sets only
`tools."change.apply".approval_mode = "approve"`, using the official
[per-tool approval configuration](https://learn.chatgpt.com/docs/config-file/config-reference).
It removes a redundant transport confirmation after content review; it does
not approve a ChangeSet. The compiled Engine MCP still rejects an unapproved,
modified, stale or already-applied proposal. Other tools, other MCP servers,
shell policy, sandbox and provider/candidate review remain unchanged. The
P32 progress test first failed without this exact per-tool override, then
passed and verifies no server-wide approval mode is supplied. In the installed
continuation, Copilot applied the existing approved UI ChangeSet in 209 ms
and resumed the original image job. Its first outbound attempt records
`generation-grant:r5-owner-20260905` at 05:59:37 UTC. This proves the supervised
transport/policy continuation, not completed media quality or human acceptance.

The installed run exposed an evidence gap: natural-language `assertions`
were ignored. The source implementation now rejects prose and evaluates
semantic-ID snapshot comparisons, with a red/green regression documented in
`P31-RUNTIME-ASSERTIONS.md`. The Tank project still needs its own executable
pause, audio and win/loss checks; engine checks alone do not close game gates.

## 2026-09-05 supervised long-session repair (not independent acceptance)

The owner-delegated Tank session exposed two more execution defects. A
`project.file.write` operation targeting a new test fixture failed with raw
ENOENT. The registry now returns `WORKSPACE_FILE_NOT_FOUND` with the exact path
and `suggestedCommand: project.file.create`; existing-file conflict checks
remain unchanged. The P32 ChangeSet isolation gate proves the diagnostic and
that neither a file nor a proposal is created by the invalid operation.

The installed Studio also became unresponsive during a long streamed turn.
Inspection found that every Codex state event synchronously loaded all stored
ChangeSets, and every inspection of an already imported asset rewrote its
timestamp. State presentation now coalesces a burst into the latest canonical
snapshot on a 100 ms timer; source events and mutations are not coalesced.
`check:p32:progress` proves 2,000 notifications cause one deferred publication,
later state still publishes, and disposal cancels pending work. The P29 import
gate first failed on changing store bytes and now proves ten unchanged reads
preserve them. Hash verification and rollback detection still run.

The supervised game proposals also need corrections: the pending movement
change passes the complete Collider on X but only its size on Y, and the
project has no `audio/buses.json` for its proposed master-bus call. These are
review findings, not applied game fixes or passed game tests. The internal
Copilot remains responsible for proposing the actual game corrections.

These source regressions, typecheck, full `npm run check`, and the installed
lifecycle gate pass. The compiled MCP bridge timed out during concurrent
release-build work, then passed when rerun without that build contention; no
timeout or assertion was weakened. The canonical development ZIP SHA-256 is
`a9846f1156db18c683e75d0e17566438e78b043b46b83702ae4f34074eb8ac62`.
Installed long-session recovery must still be observed; this section does not
certify it or close Journey D.

## Additional long-session regressions (2026-09-05)

Read-only profiling of the installed dogfood session traced most main-thread
work to workspace snapshots and synchronous Git status. A separate 20-second
filesystem observation counted 132 `.git` directory-entry notifications.
Windows can report the root directory, not just `.git/index`; the previous
child-path-only filter fed Git's own refresh back into another snapshot.
`project-watch-filter.ts` now excludes both root and descendant `.git` and
`.aigame` notifications while preserving `.gitignore`, `.github`, and real
Scene/script/asset paths. The root-event regression failed before the fix and
passes in `check:p32:progress`.

ChangeSet storage no longer moves the current record aside before renaming its
replacement. A regression observes the canonical file after every rename;
the old implementation exposed a missing record. The atomic replacement and
injected-EPERM tests now pass and preserve the old readable record on failure.
`check:p32:changeset` also rejects a non-throwing failed runtime result or
`validation.ok: false`; these previously produced the misleading `tested`
status. Diagnostics remain available and a subsequent successful retry passes.

The compiled P32 MCP bridge now verifies compact `change.list`, complete
`change.read`, compact `test.run`, explicit tool-error status for a deliberately
failing test, and a `test.result` report that survives a later run. This avoids
burying a failed assertion in megabytes of snapshots; full evidence is retained.
On the 39-proposal supervised Tank dataset, one serialized ChangeSet listing
fell from 3,573,006 to 106,566 bytes (97.02% less), measured without removing
any stored proposal. This is response-size evidence, not a token-billing claim.
The long-transcript P15 fixture also proves that 2,000 messages cannot collapse
the Goal controls or composer. Studio tokens and visual language are unchanged.

The initial full check stopped at the unchanged 60-second Tank deterministic
batch threshold while the old Studio was running. A standalone release gate
subsequently passed with 100 Tank runs in 56,980.88 ms. The fresh full
`npm run check` passed, including 100 Tank runs in 55,836.20 ms and the
canonical installed lifecycle/UI gate. No timing threshold was relaxed.
The current ZIP SHA-256 is
`90d3e5da55367a64cddd266128786acdde65de245e0448f6abf909448a5d37af`.
The rebuilt P32 MCP bridge, final formatting, lint and typecheck also pass.
These are supervised engineering observations, not independent Journey D
evidence; the real long-running project is being resumed for observation.

## Follow-up long-history fix and installed verification

The next supervised checkpoint found remaining full-history work after the
filesystem-loop fix. `CodexProcessManager` now emits a lightweight invalidation
to the desktop coalescer, rather than cloning the full transcript before the
coalescer even runs. Existing explicit `state` subscribers still receive an
isolated snapshot. The 2,000-notification regression verifies zero eager
snapshot calls for invalidation subscribers and preserves legacy isolation.

Conversation hydration uses the bundled protocol's `thread/turns/list` with
20 turns and `itemsView: summary`, and resume uses `excludeTurns: true`.
The official [App Server documentation](https://learn.chatgpt.com/docs/app-server#list-thread-turns)
describes this pagination contract. Older turns are explicitly loadable in
Copilot; tests cover retry, cursor reuse, overlapping-page deduplication,
latest-plan preservation, and retaining loaded history after completion.
No stored history is removed. A read-only request against the actual Tank
thread returned 20 turns in 32,289 bytes / 112 ms; this measures the RPC only,
not end-to-end Studio responsiveness. The full regression passed through P21
but failed the unchanged 60-second P20 Tank batch threshold. That performance
gate subsequently passed separately: Pong 18,360.03 ms, Collect Room 3D
27,967.22 ms, Tank 54,638.28 ms for 100 runs each. No threshold was relaxed.
This is a passing constituent rerun, not a claim that the failed command
retroactively passed.

Packaging and the separate real installed lifecycle/UI gate pass. The new
archive SHA-256 is
`7234d1d37e4638c4318b692d5438e1ebba5c292ee0168707e79158b9ccc0a46f`.
It includes the P29 re-proposed import reconciliation repair. Formatting,
typecheck, lint and P28 also pass. The previous full-pass checkpoint remains
historical evidence. In the actual installed project, the existing Goal
automatically continued in conversation `01a065c3-df50-7d11-87f5-d5c2f60cab69`.
The normal Resource panel reports four imported Jobs; the two repaired links
record `asset-import.relinked` at 08:01:31–32 UTC with unchanged attempt counts.
The real Copilot history button loaded earlier user/assistant records while
the Goal continued. No project-authoring action was performed by that button.

## Remaining independent evidence (unchanged)

- Real provider execution must still be interrupted and resumed through the
  installed Studio with the user's bounded account.
- Journey D must be performed by a participant; machine evidence cannot fill
  the human observation board.
