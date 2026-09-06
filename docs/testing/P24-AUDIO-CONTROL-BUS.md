# Audio control Bus regression — 2026-09-06

## Original-game finding

The original Copilot's loss → mute → restart observation
`observation-comparison:0e90e135bfd211b0565b68be` reports
`RUNTIME_AUDIO_BUS_UNKNOWN` at Tick 2037. Music was started on the project's
sole declared Bus `tank:bus/master`, but `stopAudio(instanceId)` emitted
`audio:bus/master`. Pause and resume contain the same hard-coded default.
Zero Studio/Player differences means both hosts reproduce the fault; it is
not error-free audio acceptance.

Earlier 19-test / 252-assertion reports and play/stop-count probes remain valid
for their measured scope, but do not establish valid control-event Bus routing.
No aliases, observer relaxations, original-project source edits or reclassification
of those reports have been used to hide the defect.

## Reproduction and repair contract

`scripts/check-p24-audio-control.ts` reproduces the bug using an isolated Pong
fixture with only a custom music Bus. The proposed API is applied only to the
fixture typings during the red test. Native execution produces:

```text
play    probe:bus/music
pause   audio:bus/master   (wrong)
resume  audio:bus/master   (wrong)
stop    audio:bus/master   (wrong; outgoing Scene onDestroy)
```

The compatible repair adds a second optional `busId` argument to stop, pause
and resume. It defaults to `audio:bus/master`, preserving existing default-Bus
projects. A custom-Bus project must pass the same stable Bus ID as playAudio.
This avoids an unbounded hidden history of one-shot audio instances in the
deterministic host and does not infer state from device playback completion.
No public protocol shape or game-state hash needs to change.

Required checks cover continuous/single-Tick execution, restart, Scene cleanup,
empty/null/non-string Bus arguments, the legacy default and actual observation
diagnostics. The observer must continue rejecting undeclared buses.

## Delivery status

`npm run check:p24:audio` passes: WAV/MP3 packaged verification and the new
red-to-green control probe. Evidence is
`artifacts/p24-audio-control-NKhq8c/summary.json`: four continuous/single-Tick
actions, restart, outgoing-Scene cleanup, zero observation audio errors,
undeclared-Bus negative, 12 invalid-argument negatives and legacy defaults.
The native guard message is asserted to exclude unrelated compile failures.

The compiled P32 Engine MCP test also passes: `script.api` exposes all three
new signatures without overwriting the deliberately stale fixture typings.
An additional engine-integration probe uses a disposable copy of actual Tank
revision `2865692b…`. It changes only its SDK and stop call, then proves both
authored gameplay smoke (stop Ticks 90/120) and preference/Scene lifecycle
(16/24/40/48) preserve game-state hashes and every other audio-event field.
Repeated events match and actual captures contain no missing/failed audio.
Evidence: `artifacts/r5-audio-control-probe-kj7cIr/summary.json`. The original
project revision remains unchanged; this is not a Copilot proposal approval.

The combined `npm run check` passes, including clean archive installation,
upgrade and renderer-crash recovery. Accepted archive SHA-256:
`ae576cfe0e623da2041a2ab517d93194c34244c81987e95c821723a8c286ccae`.
After normal owner-Studio shutdown, all 287 content hashes were verified and
the old installation was preserved as
`AI-Game-Studio-0.3.0-preview.1-r5-pre-audio-control-20260906-061405-win-x64`.
No project or credential directory participated in installation.

The same Tank-copy probe passes against the actual owner-installed host/SDK:
`artifacts/r5-audio-control-probe-YykLUd/summary.json`, host SHA `b3788bdc…`,
SDK SHA `1b36e0e5…`. Original-Copilot migration through reviewed ChangeSet and
new real Studio/Player observations remain required. These fixture results are
not original-game delivery or subjective listening acceptance.

## Original Copilot proposal review

Internal Copilot retrieved SDK `1b36e0e5…` and proposed exactly the two files
tested above as `changeset:5003f5bc-d412-4e76-82ea-996b0d18d73a`, proposal hash
`4b2878299fda7d152c391dca6b7fd766a962fd40c30dc625307e5c7955d82776`.
The SDK exactly matches the installed content; the only behavior change passes
`MASTER_BUS` to stopAudio. All 19 tests / 252 assertions, five repeated audio
replays and a declared-Bus check on every event pass in
`artifacts/r5-hit-wiring-review-UJxmnv/summary.json`. Exact transactional apply
and rollback pass in `artifacts/r5-text-transaction-review-3AYCLg/summary.json`.
Both reviews preserve the original project revision.

Only after those passes was approval recorded at `2026-09-05T22:19:05.196Z`,
approval content hash
`4bc0fc5604c3b04af7a3a2f25c81fca17451a16a8696a38145566ebf92d1c2d1`.
The supervisor resumed the original Studio Goal. Actual application remains
the original Copilot's responsibility; approval alone does not mark it applied.

Internal Copilot applied the approved ChangeSet in turn
`01a073a7-a247-72f3-a076-c5a31dff789d`; the shared record is now `applied`.
Original project revision is `20eff5863f694eba30fa0498a9e949b3dfd2e659142cfbab103cfe45888df069`.
The supervisor's read-only post-application audit verifies all 19 actual reports
and their content-addressed IDs, 252 assertions, module identities, state hashes
and full audio arrays against the exact isolated review. Evidence:
`artifacts/r5-hit-postapply-audit-NhABIV/summary.json`. The audit did not execute
tests in or modify the original project. New real runtime observations and
audio-complete final packages remain separate acceptance work.

## Original runtime observation audit

The original Copilot subsequently exported two normal-Menu-entry logs at this
same revision, with no injected commands or fixture Scenes:

- `input-log:f4df3d4281761c78a6c8f265e307a3fd1b934af30b578343c6c6cc2a28af7d51`,
  Tick 84: mute, restart and return; 12 audio events, stops at 20/30.
- `input-log:07b9b5c3476733ae24f3b1e56676a02a5010f1922f795453589686ed5c4a9a67`,
  Tick 2233: natural defeat followed by mute/restart; 261 events, stop at 2230.

Both pass actual Studio/Player comparisons at 1280×720 and 960×540. The
read-only supervisor audit `artifacts/r5-runtime-audio-audit-UX50k7/summary.json`
checks all eight stored observations, current revision and log identities,
every referenced clip hash, frame hashes, complete audio arrays, declared
AudioBus IDs, empty missing/failed playback arrays and empty diagnostics.
All four comparisons and same-resolution PNG hashes match. A deliberately
corrupted stop-Bus copy fails the separate audio-validity assertion, so equal
failures in both hosts cannot satisfy this audit.

The audit pins the eight inspected observation IDs rather than counting later
re-recordings as extra expected hosts. It freezes their exact documents, PNGs
and both input logs in its evidence directory, so later checkpoint captures
cannot silently replace the supporting proof.

The audit neither executes nor writes the original game. This closes the
reported custom-Bus loss/mute/restart regression at revision `20eff586…`,
not the remaining destruction/UI/match content, final mixing or P33.

## Current-revision victory and full regression follow-up

The original Copilot completed the same-revision normal-Menu-entry recording
`input-log:361ca2594d58e86be72c978b0301f314621a14b878f98945b95bafe01a096d26`
at Tick 6202, after natural defeat, muted restart and winning play. The final
state hash is `ce0e4bbb1fc97b89c97e7e12725c06614814274821e5245eeebc1e2f6390ffe5`.
Read-only audit `artifacts/r5-runtime-audio-audit-TWzqqk/summary.json` freezes
the four actual observations, four PNGs and input log. At both 1280×720 and
960×540, all 540 audio events match, the stop at Tick 2230 names the correct
Bus, every clip hash resolves, diagnostic/missing/failed arrays are empty and
same-resolution PNG hashes match. Comparisons are `c1355e9e…` / `9e9ffb7c…`.

The separate `artifacts/r5-victory-state-audit-W7SppW/summary.json` freezes the
native Player result and recomputes the canonical Scene hash against this log.
It verifies `won`, zero enemies, score 600, HP 2/5 and the actual visible
MISSION COMPLETE / FINAL SCORE 0600 labels; a changed-outcome negative cannot
match the recorded hash. Both-resolution victory PNGs were visually inspected.
These are supervised machine observations, not final audio coverage or P33.

The subsequent full `npm run check` also passes, including clean archive
extraction/install, upgrade, UI, renderer-crash recovery and user-data retention.
Its isolated variant is `r5-audio-observation-check`, archive SHA-256
`4a670004933c2d2798dfdb05ef01889fd74f64e91247cd45dffa09772834f07e`.
This is a regression candidate, **not another owner installation**: the live
owner package remains `ae576cfe…`. No original game file or credential was
changed by these audits, and no provider generation request was issued.
