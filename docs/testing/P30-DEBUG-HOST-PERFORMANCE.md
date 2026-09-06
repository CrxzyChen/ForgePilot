# P30 development host timeout repair — 2026-09-05

The first follow-up `npm run check:p30` failed at the 900-Tick loss checkpoint
with `SCRIPT_HOST_TIMEOUT`. Adding per-checkpoint structured timing reproduced
the same failure: win/560 Ticks took 20,007 ms; loss/900 Ticks failed at 30,301 ms.
This is a failed command, not a completed P30 run.

An isolated copy of the existing Tank example, identical seed `20260903` and
two start-input records reproduced the difference without frame capture:

| Host configuration                        | 900-Tick result          |  Duration |
| ----------------------------------------- | ------------------------ | --------: |
| Release, before repair                    | completed, 900 snapshots |  7,630 ms |
| Default development interpreter           | `SCRIPT_HOST_TIMEOUT`    | 30,152 ms |
| Release, comparison rerun                 | completed, 900 snapshots |  9,104 ms |
| Development with `rquickjs-sys` optimized | completed, 900 snapshots |  9,691 ms |

The only repair is `[profile.dev.package.rquickjs-sys] opt-level = 2` in the
workspace Cargo manifest. This optimizes the embedded C interpreter while
keeping workspace application code and its debug information in the development
profile. It does not switch the check to the release executable, alter gameplay,
reduce the Tick count, remove checkpoints or increase an execution limit.
The 25-second QuickJS guard, 30-second process guard and memory limits remain
unchanged. Both successful post-repair hosts produce final state SHA-256
`6603959fc036e0d9992863c65cf3e20f50bfd0003bd58de212b2f6e1a959be79`.

The complete `npm run check:p30` rerun passes: all six checkpoints, seeded
diagnostic repair/rollback, the agent observation bridge, real Electron panel
geometry and Studio UI contract. The 900-Tick loss checkpoint now takes 12,042 ms
including observation work; win/560 takes 6,348 ms and restart/368 takes 6,078 ms.
The existing executable 900-Tick checkpoint is retained as the regression;
its new timing records identify any future failing checkpoint. The earlier full
`npm run check` pass for package `766d3897…` predates this development-only repair.
That installed release package is unchanged and remains the running actual Studio.
The follow-up full `npm run check` (`r5-host-profile-check`) failed later at
P20's unchanged 60-second/100-run Tank batch gate. Instrumentation then measured
62,475.54 ms in a second failed P20 run. This does not undo the targeted P30 pass
or imply that the running release package has changed. A separate per-runtime,
source-hash compiler cache is now under verification; it always reads current
source and validates the manifest. The new executable regression verifies
same-size/same-mtime edits, caller-result isolation, syntax-error recovery and
repeated snapshot parity. The isolated P20 rerun now passes: 100 Tank runs take
56,808.14 ms, versus the failed 62,475.54 ms rerun, under the same 60-second
threshold. All 100 hashes remain `c95e0adf51ec236141cdc9fc076e942e93e6fd822356cfb34ae69f3b6ab053f5`.
Pong and Collect Room batches, standalone package verification, release
exclusions and exact ChangeSet rollback also pass. This is a targeted P20 pass;
full-command and installed-package revalidation remain required.

The next full command (`r5-compile-cache-check`) passes all runtime gates,
including the new compiler-cache regression and 100 Tank runs in 56,054.96 ms.
It builds a 287-file Studio package, ZIP SHA-256
`7da6c517a3bdc8b13b8c4e1c11890c751db397a38b09fed94c4463b0887b4e3b`,
but the final installed gate fails extracting into C: Temp with ENOSPC. This is
still a failed full command. Running the unchanged installed check with process-
local TEMP/TMP on D: passes clean extraction, upgrade, 150% DPI, crash recovery,
project restoration, portable uninstall and retained settings. Ten inactive old
installed-test directories were moved, not deleted, to
`artifacts/retired-test-temporaries-20260905`, recovering about 10 GB on C:.
The installed production Studio is still the earlier `766d3897…` package.

The additional full command (`r5-ui-guide-check`) passes with D: temporary
storage, including the missing UI Skill/P19 regression and the final clean
installed lifecycle gate. Its 288-file ZIP SHA-256 is
`fd0a174a5dd9ee361221a912f2765874879611b7c6a7cecbf4104a791304c270`.
The unchanged 100-run Tank threshold passes at 58,574.95 ms. This is a full
command pass, unlike the preceding ENOSPC run. The package is tested, not yet
the running canonical Studio. Its source map includes the first text-bounds
repair, before the later `reduce` hardening and native history repair below.

## Native snapshot-history heap repair

The actual project's long Arena request fails at approximately Tick 257 in
the old installed host, even though two 130-Tick requests complete under its
unchanged 64 MiB project budget. A diagnostic copy using 128 MiB completes all
260 Ticks and has the same state hash as the two-request run. These budget edits
are confined to disposable diagnostic copies, never actual project authority.

The runtime retained a full JavaScript object graph for every historical Scene.
A new native regression reproduces failure with 48 objects, 260 snapshots and
a fixed 32 MiB interpreter heap. Merely retaining serialized strings inside
QuickJS still fails this regression and was not accepted as the repair.

The final implementation moves serialized history into a private native buffer,
capped at 64 MiB. Every snapshot is restored to the unchanged JSON object
protocol before return; no history is sampled or dropped. Project modules cannot
access the private sink. Overflow returns `SCRIPT_SNAPSHOT_BUDGET_EXCEEDED`,
and failed/successful requests detach their buffers before returning. This is
debug-history storage outside the interpreter, not a reduction in total native
process memory or a change to the project's gameplay heap allowance.

`cargo test --locked -p ai-game-script-host` passes all five tests, including
complete Unicode/escaped-string history, immutable per-Tick data, private sink,
same-host reruns, failure reset and buffer-cap rejection. Clippy passes with
warnings denied. P18's full-command gate now invokes these native tests.

The actual-project copy at UI ChangeSet `2c2354aa…` also passes:

| Comparison                                                   | Result                           |                Interpreter heap |
| ------------------------------------------------------------ | -------------------------------- | ------------------------------: |
| New host, original 64 MiB, continuous 260 Ticks              | completed, all 260 snapshots     |                 8,409,059 bytes |
| New host, diagnostic 128 MiB, continuous 260 Ticks           | identical result                 |                 8,409,059 bytes |
| New host, original 64 MiB, two 130-Tick requests             | identical final state            | 4,680,700 bytes in last request |
| Old installed host, diagnostic 128 MiB, continuous 260 Ticks | all 260 snapshots match new host |                42,896,744 bytes |

All compared final states hash to
`18ae8e557928bc5c35d5f6f58e5e1f0e366ed9d7fd44be7f53a7059f350096be`.
The comparison additionally checks every snapshot object/hash, random state,
pending events, contacts, physics events and audio events. Actual Tank source
is not edited by this probe. Its Arena source hash is
`5f1f2f6e4e93209f6881bb7f8236ad082cfaf001874575de0d1648e1ce7a9fbc`.

The post-repair complete P30 command passes, including menu/play/pause/win/loss/
restart, repair and rollback, 14 actual text-boundary frames, MCP observation,
Studio/Player parity and real Electron geometry. Win/560 takes 3,045 ms and
loss/900 takes 6,399 ms in this run. P31's executable assertion gate also passes.
No execution guard or acceptance threshold was relaxed.

The subsequent complete `npm run check` (`r5-snapshot-history-check`) passes,
including the new five-test native suite, source checks, all runtime phases,
100-run release benchmarks and clean installed lifecycle. Tank takes 29,026.51 ms
with the unchanged hash and 60-second threshold. The 288-file package has ZIP
SHA-256 `2d68aba993a96a802672e8eb5915f297c14d826d50958ed26b1c90a7f5d8c649`.
All 287 manifest-listed content hashes are independently rechecked (the manifest
itself is the remaining file). Bundled source maps confirm the text-bounds
`reduce` hardening, the base template contains `author-ui`, and the native host
contains the bounded snapshot-history implementation. Installation, upgrade,
crash/project restoration, UI checks and portable uninstall preserving user
data pass. An initial minimized-window input-protection interruption delayed
the supervised handoff; it was resolved on the next continuation.

At 19:00 local the supervisor normally closed the old Studio, preserved it as
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-pre-history-backup-20260905-1830-win-x64`,
and copied the tested candidate to the canonical package directory. All 287
content hashes were verified both before and after copying. A first hidden
launch exposed no targetable window and opened no project/Codex process; only
those newly launched processes were stopped. Launch through the interactive
desktop then succeeded. The existing Tank project, conversation and Goal
reopened; the new-host diagnosis was sent through Studio's Copilot composer.
No actual game-authority files or credentials were edited for this handoff.
This verifies supervised delivery, not independent P33 acceptance or final
actual-game long-checkpoint/visual results.

## Bounded paused checkpoint advancement

After handoff, actual Copilot verifies a 260-Tick Arena checkpoint in the
original 64 MiB heap; observation `a0a96dfd28a6e15f2a5ecfb7` has no diagnostics.
A longer 860-Tick continuous request hits the existing 25-second fail-safe;
a 400-Tick request completes. This is a distinct request-duration limit, not
evidence that the fixed 257-Tick heap failure returned.

The new `runtime.advance_ticks` operation advances an already paused session
by 1–200 fixed Ticks without starting live playback. It requires the observed
session ID, generation and starting Tick; stale/duplicate requests cannot
advance twice. The original project budgets and native 25/30-second guards
remain unchanged per request. Every batch returns its complete snapshot range.
Single-step and live-resume semantics are unchanged.

`check-p30-bounded-advance.ts` first fails because `advancePaused` is absent.
After implementation it compares all 221 snapshots with continuous execution,
checks queued future inputs, final Scene/random/events/contacts, invalid counts,
stale session/generation/Tick, repeated requests, no background live advancement,
replay failure/restart and visible compile/transport failures. The real Engine
MCP schema and invocation pass. The template testing Skill passes its UTF-8
validator. The first subsequent full check stops at new-test `no-explicit-any`
lint errors; these are corrected. The full rerun then passes, including the
new native/bounded tests, all source/runtime gates, P20 release and clean
installed lifecycle. The subsequent full `check:p30` also passes: six gameplay
checkpoints, repair/rollback, all 14 rendered text-boundary cases, bounded
advance, MCP/Player parity and real Electron geometry/Studio style checks.

An isolated copy of the actual project at UI source
`b8bebade10e6b8f57b10356f48eb7e45aff5b788bfe4623d05ef39c4b0592a50`
uses the same seed 20260905 and normal move-left/move-up input at Tick zero,
released at Tick 200. Its first two 200-Tick batches match all 400 continuous
snapshots, hash `2f3eb6f9c9a29fb846a4c886a344626069360cb67ce5f64cf94e0b2f43672fcc`.
Further 200/200/60 batches reach Tick 860 with `status: lost`, elapsedTicks 780,
and hash `e1b34f6cba7548256302b2b1ec9ce1c2d222716901f0a1169b66dd43b078a98f`.
Those batches take 6,696 / 7,116 / 1,775 ms; no gameplay, budget or actual-project
authority file is changed. This proves a diagnostic-copy engine path, not the
actual Copilot's final game or visual acceptance.

The `r5-bounded-checkpoint-check` package contains 288 files, ZIP SHA-256
`ce2b0287f667617b4359acca37a60a2cb3f763dab7e7c1a144ab663e19fc0ea7`.
All 287 manifest-listed content hashes match. This full run's 100-iteration
Tank benchmark is 39,120.86 ms with one deterministic hash, below the unchanged
60-second gate. The clean-install/upgrade/crash restoration/UI/uninstall checks
pass; the bundled main/MCP server includes `runtime.advance_ticks`.

At 19:29 local, after the actual Copilot's 14-test batch finished, its current
turn was stopped and Studio closed normally. No canonical-package processes
remained. The previous installed package is preserved at
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-pre-bounded-backup-20260905-1929-win-x64`.
The new candidate is copied to the canonical directory and all 287 content
hashes match there too. Project authority and credential storage are untouched.
Actual Copilot tool discovery/use is a separate supervised handoff check.

The actual handoff is now verified: the original Studio project/conversation
reopened and the internal Copilot called the new operation with its observed
session/generation/Tick. Its same paused Arena session advances 18 → 218 → 418
and onward without relaxing budgets. Tick 860 is still HP 1/5, so Copilot
correctly rejects the checkpoint label as proof of loss. Tick 960 reaches real
HP 0/5 and DEFEAT, observation `b867902e04fcb788b2414793`, frame SHA-256
`1e23ae02c2b3770147db44ae23ac575434690350674db53083d1d94a34bcd9bf`.
The supervisor inspects the frame. The subsequent same-Scene restart fails to
reset the world; this newly exposed engine defect is tracked separately in
`P21-SCENE-TRANSFER-EVIDENCE.md`, not hidden by fixture success.
