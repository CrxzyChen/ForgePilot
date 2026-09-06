# P31 — Bounded audio candidate mastering

Status: native unit, shared broker/compiled MCP, preview, review/import,
rollback, full regression and owner installation pass. Original installed
Copilot produced and inspected two real masters through MCP; the owner heard
and accepted both, and Copilot applied the separately approved imports.
Audio wiring, remaining SFX and full-game acceptance remain open.

## Production motivation

On 2026-09-06, the original Tank Copilot successfully invoked the configured
ElevenLabs music route once. Job `asset-job:97806d6e-b250-4fc7-b219-b0aec96b1808`
produced candidate `candidate:1ef0606e-9f55-4702-8045-2bbb327490b2`: MP3,
10,032ms, 48kHz stereo, 240,813 bytes, SHA-256
`d3a4f0c4b650843b06096881b51c7da09c01f2297225e79a212daf3be8a7cd2a`.
The credential and real generation work; cost is unknown and the candidate
has not been approved or imported.

The first SFX request was rejected before provider invocation: requested
0.2 seconds, legal provider minimum 0.5 seconds. The [official SFX endpoint](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
documents the same minimum. The Tank brief still requires short final masters;
generation duration and final edited duration are separate requirements.

After supervisor clarified the source/master distinction, the same internal
Copilot generated SFX Job `asset-job:29ab762f-cee6-4e54-baf8-9bc55b6bd000`
once, with candidate `candidate:3c166f2e-9891-49ae-82d9-b2faa6d9b177`.
Actual metadata: MP3, 522ms, 44.1kHz stereo, 8,821 bytes; SHA-256
`a68121030934ccc806233436889682e4a0d4fec7292ace7096d8637560e920df`.
This is a valid source, not a compliant short WAV master. Cost is unknown,
selection/import remain unset, and no paid request was repeated.

## Contract

`asset.master_audio` accepts an existing Job ID, original Candidate ID,
expected source SHA-256, and `spec`:

```json
{
  "startMs": 0,
  "endMs": 200,
  "fadeInMs": 2,
  "fadeOutMs": 8,
  "gainDb": -3
}
```

This example is not a universal edit decision: inspect/listen to source media
before choosing a useful transient. All five parameters are required. Bounds:
integer milliseconds, range wholly within decoded source, output 1–60,000ms,
fades 0–500ms with sum no greater than duration, explicit gain -48–+48dB.
`asset.inspect_candidate({id, candidateId})` returns decoded peak/RMS and
sample count without pretending to listen. Positive gain is useful for quiet
provider output; it must still pass the native clipping rejection.

The bundled Player fully decodes bounded input with Symphonia, reuses rodio's
resampler, applies crop/fades/gain, rejects clipping, and writes only a
metadata-free PCM16 WAV stream on stdout. No codec is reimplemented. Output
is independently decoded again; its sample rate and duration must match.
No network, device, arbitrary shell command, output file argument, provider
credential or unrestricted parent environment is forwarded.

Broker uses real contained paths and source hashes, limits jobs to 16 candidates,
rejects processing of already-derived/selected/rejected candidates, preserves
source bytes, and returns the same candidate for an identical source/spec/engine.
Candidate records and imported provenance retain the processor hash, source
hash and full parameters. Provider attempts/cost do not change. Existing preview,
selection, ChangeSet review, apply and rollback handle these new WAV candidates.

## Executable checks

- `cargo test --locked -p ai-game-player audio_master`: MP3 crop, real 48kHz
  decode, deterministic output, zero fade endpoints, measured level and bounds.
- `node scripts/check-p31-audio-master.ts [player-path]`: original preservation,
  no extra provider call/selection/project mutation, idempotence after restart,
  invalid input rejection, actual preview, approval enforcement, full imported
  provenance and exact rollback in an isolated fixture project.
- `npm run check:p29:agent`: compiled MCP routes mastering to the Studio broker
  without exposing credentials or candidate-selection authority.
- Full `npm run check` and packaged native processor verification are required
  before claiming delivery to the owner installation.

Focused shared-service/compiled-MCP evidence passed in
`<temp>/aigame-p31-audio-master-rlIPLB`.
Its 200ms WAV fixture is not game art/audio. P29 media and reviewed-import,
P28 contracts and the compiled broker bridge also pass. The first full-check
attempt caught a missing required `NODE_ENV` in the new test subprocess
environment; this was fixed without forwarding the parent environment, and
the complete check was restarted.

An isolated copy-only probe of the real source files confirmed both decode and
master correctly, without writing the game. It also found the shooting source
is unusually quiet (peak 0.0062913, RMS 0.0010983). Therefore a blind -3dB edit
must not be called production-ready. The explicit gain and inspect tools let
Copilot measure and adjust levels before review; noise/timbre remain listening
judgments. Initial probe: `artifacts/r5-audio-master-candidate-probe-efEVlt/summary.json`.

## Installed delivery — 2026-09-06

Full `npm run check` passed, including native tests, 100-run determinism
batches, UI quality, clean installation, upgrade and recovery. The shipped
variant is `AI-Game-Studio-0.3.0-preview.1-r5-audio-master-v1-check-win-x64.zip`,
SHA-256 `085ed49632098ff7b41a234700b79e350d741536f2445b862d6d7fb9c71ea93a`.
The final shipped processor SHA-256 is
`67cd3e3115d100970beee1be3e42d03b3df20fa8b8b97306b267fcdd8036dc4d`.
All 287 installed content hashes pass. Previous owner installation is
recoverable at `D:/game-creator/artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-pre-audio-master-20260906-034305-win-x64`.
No original game file or credential was changed by the installer.

The actual packaged Electron-as-Node, MCP, kernel and audio processor passed
the isolated mastering/preview/approved import/provenance/rollback scenario
before installation (`aigame-p31-audio-master-FDLlax`) and again from the
owner installation (`aigame-p31-audio-master-qD9WFc`), both under the Windows
temporary directory. The new inspector's real peak/RMS is checked as well.
Root's original-game-file probe with 40dB gain produced a 200ms stereo WAV
with peak 0.62637 and RMS 0.17472; this is technical evidence, not audition.
It remains outside the game in `artifacts/r5-audio-master-candidate-probe-1XuXop`.

The local human board was updated and its production build and HTTP 200 check
passed. Sites returned `Sites project not found` for the existing project;
no new Site, source push or deployment was made.

Production source generation remains inside the original Copilot task.
Supervisor engine work and isolated fixture tests do not author the Tank game.
Music/SFX listening, event integration, final game regression/package and P33
independent human acceptance remain separate gates.

## Actual Copilot adoption — 2026-09-06

Original thread `01a065c3-df50-7d11-87f5-d5c2f60cab69`, turn
`01a0731e-9e73-7881-bc0f-918cada93fb7`, discovered the installed tools, read the
brief and existing jobs, inspected the sources and made both masters through
Engine MCP. It did not copy supervisor probe files or issue new provider calls.

- Shooting candidate:
  `candidate:7fad95b621136f56c885b88a16111f2efd6837b4dfe3b4dd72e889f6fb61479c`.
  Source job `asset-job:29ab762f-cee6-4e54-baf8-9bc55b6bd000`.
  Spec: start 0ms, end 200ms, fade-in 2ms, fade-out 8ms, gain +40dB.
  WAV SHA-256 `858077b2ee21f3f1c272ffb45d58edc3287cdce44fefb7b44a67b592c4bebd37`.
  Actual 200ms, 48kHz stereo PCM16, 38,444 bytes; peak 0.626373291,
  RMS 0.174715319, 19,200 interleaved decoded samples.
- Music candidate:
  `candidate:0d771a784b47f3bfd3380fad927402359263511a116e7fe838b40f203a7038a0`.
  Source job `asset-job:97806d6e-b250-4fc7-b219-b0aec96b1808`.
  Spec: start 0ms, end 10,000ms, both fades 0ms, gain 0dB.
  WAV SHA-256 `051700816512cdee1c2f217e6f0eb3c096faa651866f598063fd923d04912eca`.
  Actual 10,000ms, 48kHz stereo PCM16, 1,920,044 bytes; peak 0.865478516,
  RMS 0.190015726, 960,000 interleaved decoded samples. Exact duration and
  non-clipping samples do not prove a seamless loop, absence of vocals or style.

Supervisor independently rehashed and fully decoded the original and derived
files using the installed Player, read-only. Both originals retain their
previous hashes, each job has exactly two candidates, provider attempts remain
one each and cost remains unknown. Both jobs are `awaitingReview` with null
selection/review-decision IDs. Masters are stored under the game's
`.aigame/local/asset-candidates/master-<candidate-hash>.wav` candidate store,
not imported into project authority. The actual candidate processing records
contain the installed processor hash and full source/spec lineage.

The current supervisor cannot hear audio and explicitly did not approve
subjective quality. Copilot retained the listening wait point and did not
select, import, bind audio events or close R5. User listening feedback is the
next required decision; no credential reconfiguration or paid regeneration
is needed for this review.

## Owner acceptance and actual imports — 2026-09-06

After the two exact WAV masters were presented for listening, the owner replied
`适合` (suitable). This is acceptance of those two candidates only, not new
unheard candidates, objectively seamless looping or independent P33 acceptance.
Supervisor registered both selections in the actual Studio UI. Original-game
application remained inside Copilot; the supervisor used only shared approval
services and isolated copies for application tests.

Shooting selection `review-decision:3e6b0698-748e-4e90-9174-ea99f62a34ae`:

- ChangeSet `changeset:ac209487-442c-49f8-b7f6-e4d265d4ee1a`.
- Proposal `63eefa9eb5f14ef08c5ddfd9c6b04e9e0aa4bc5cae0eb97f46109d242c80d360`.
- Approval `88db17f40135524b7967975ac81f271451a9fc265f5f2f208efc544c6fe0a18b`.
- Imported asset `tank:asset/tank-r5-sfx-player-shot-source-v1`.
- Isolated review: `artifacts/r5-audio-import-review-rUIq8z/summary.json`.

Music selection `review-decision:7fad3059-198b-4d1c-9d0d-5d31ddbf99c4`:

- ChangeSet `changeset:c995f653-dbd3-4815-aef3-8afd0cb7b45b`.
- Proposal `2586c2bb3c87b91d2e9322a4f50bb3b5fa36c55c4f5d5f40e5010242487945e9`.
- Approval `2b322ef2f91d7886954c972ad5bd58032495ef3415df676fa5bf6d8c952fe3a7`.
- Imported asset `tank:asset/tank-r5-music-battle-loop-validation`.
- Isolated review: `artifacts/r5-audio-import-review-4xIdzA/summary.json`.

`artifacts/r5-review-audio-import.ts` independently materializes each exact
four-file diff in a temporary project, re-decodes the WAV using the installed
Player, validates the project, runs all 19 tests/246 assertions and rolls back
exactly. Both passed; original project authority was untouched by those tests.
Only after each review did the supervisor approve the original ChangeSet;
the internal Copilot then performed `change.apply` and `project.validate`.
Imports were serialized to preserve the shared manifest baseline. Both Jobs
now report `imported`, one provider attempt each, cost unknown. New project
revision is `4680c77214db9c4b4d840a6153a67d119a2cf259caf3f7b27f42799f3736fe21`.

The installed candidate cards currently expose disabled audio controls and
`无法播放媒体` despite valid native decoding. Source inspection shows the
cards use data URLs while the renderer CSP does not allow a data media source;
this is a likely cause, not yet a tested fix. The user's acceptance here follows
the exact WAV attachments in the conversation. Actual Studio playback remains
an explicit open item. No styles, CSP or renderer code were changed in this
acceptance handoff, and no P33 journey was marked complete.

## First playback-wiring review — 2026-09-06

Copilot proposed `changeset:8566665d-caaf-488d-a4ad-57efc3031384`, proposal
`1dc0c1b29f6552b02b3ebecf9110799c462795da8808c10400064c5bc4a03b48`.
The supervisor tested the exact four-file text delta only in an isolated copy;
the original game was unchanged. Evidence is
`artifacts/r5-audio-wiring-review-ABI438/summary.json`, reproduced by
`artifacts/r5-review-audio-wiring.ts`.

All 19 tests/249 assertions passed, but the normal Menu-to-Arena replay over
45 ticks emitted two shot plays and **zero music plays**. The added tests
asserted component fields, not playback. Source search found `autoplay` only
in the capability schema, not a runtime consumer. The proposal was therefore
rejected through the shared review service before original application.
A replacement must demonstrate real playback on entry/restart, stopping on
exit, preserved volume/mute and no per-frame duplicate music starts. The two
accepted imports remain valid; this is not a request to regenerate them.

Copilot also produced hit job
`asset-job:c9129672-f85d-4ca9-a6ab-ee320f9a0f7a`, currently awaiting review,
and wall-break job `asset-job:d6b8a025-3219-476d-857f-e915aa50fb1c` failed
with HTTP 400 / `ASSET_PROVIDER_PARAMETER_REJECTED` for a 0.7-second request.
The latter is explicitly non-retryable, has no candidates and must not be
blindly retried. The provider's specific reason is not available. Both have
one attempt and unknown cost; neither is covered by the owner's earlier
acceptance of the music and shot WAVs.

### Handoff and supervisor verification boundary

The native desktop automation channel failed to reliably enter the follow-up
prompt (including a set-value timeout and an activation timeout after connection
recovery). No corrected prompt was confirmed sent, and the supervisor did not
switch app-server owners, apply the rejected proposal or claim that a replacement
was already being authored. The next Copilot handoff is the playback correction
described above. An unsent `ElevenLabs` draft was observed; it is not a new user
task or an instruction to generate anything.

`npm run check` passed its preceding gates through P20 deterministic release
validation, then its package step failed with missing `dist/electron`: a parallel
dashboard build had replaced the shared output directory. The supervisor reran
the package and installed-lifecycle tail serially; both passed, including clean
installation, update, recovery/UI assertions and preserved user data. This is
not recorded as a single uninterrupted full-check pass. The separate P28 gate,
dashboard production build and local HTTP 200 check also passed.

The isolated verification package variant is `r5-audio-acceptance-check`, archive
SHA-256 `d6cbf71ed218dbd1dc9138d750d8fb69fb92f2115c6826da6c82d3c784017676`.
It was not installed over the owner's running Studio. R5/P33 remain incomplete.

## Candidate-card playback correction — 2026-09-06

The new `check:p31:candidate-audio` gate opens the real Electron Resource panel
against two isolated, unselected fixture Jobs (WAV and MP3). It loads the actual
broker data URLs, checks metadata, advances each muted HTML audio player's clock
and verifies contained candidate geometry. Muted playback proves browser media
execution, not speaker output or subjective listening quality.

Before the fix, both cards had `readyState < 1`, null duration, current time 0,
media error code 4 and `NotSupportedError`. Neither WAV nor MP3 loaded. The
renderer CSP lacked a media data-source allowance. Adding only
`media-src 'self' data:` made both load/play: the observed MP3 duration and final
time were 0.130563 seconds; WAV duration 0.2 seconds and observed time 0.134884
seconds. Both errors were null. A real `securitypolicyviolation` probe confirms
external HTTPS media remains blocked; renderer `connect-src 'none'` is unchanged.

The test confirms no candidate selection/import and exact preservation of the
Job store and game authority. It makes no provider requests. Existing UI tokens,
layout and density are unchanged; audio controls now have accessible candidate
labels. The static Studio UI contract also protects the media/network boundary.
Typecheck, lint, the dedicated playback gate and the real P15 UI quality gate
passed. Full regression and owner-install validation are tracked separately;
this source correction does not yet establish playback in the owner's package.

The previously unresponsive owner instance was confirmed hung while the actual
Copilot turn was completed and no provider Job was running. Its process tree
was stopped without modifying project files or credentials. Hidden recovery
launches did not expose an operable window; the normal native application
launcher restored the project manager, and opening the original Tank showed
the expected Codex/MCP connection progress. This is supervised recovery, not
an independent P33 restart acceptance.

The corrected handoff was confirmed sent through the original Studio composer
in Goal mode (turn `01a0734d-2786-7c42-b02a-0bf39bae587d`). Copilot read the
project Skills and authored replacement `changeset:e14d528c-7567-445b-8dec-43143ccfe429`,
proposal `73775b0ca252966cb050ed1874121125bb29c15643c603235142c3e3cf3965dc`.
It remains awaiting approval; the supervisor has not applied it to the original.

The actual packaged candidate-preview test also passed using the package's own
renderer and native audio inspector, with no repository-root override. The
fixture now pins its isolated initial Resource panel to avoid the asynchronous
workspace restore overwriting the early test click. Both files loaded and their
clocks advanced; the external-media CSP probe remained blocked. The package was
`r5-audio-preview-check`, SHA-256
`0fb4d825dec464884658a7ae9261109ddc626c443ae83f59f3e016411bcecd9f`.
The first full-check run reached packaging but its installed quality tail timed
out at 90 seconds. A subsequent isolated `check:p20:installed` passed clean
install, upgrade, recovery, UI and retained-user-data checks. This does not
retroactively make the interrupted aggregate invocation a complete pass.

## Scene-lifecycle cleanup correction — 2026-09-06

The replacement's exact five-file delta passed 19 tests / 252 assertions, but
the extended supervisor replay exposed a second failure: music starts at ticks
8, 16, 32 and 40, with **no stops** on restart or return to Menu. Evidence:
`artifacts/r5-audio-wiring-review-iUABTy/summary.json`. Copilot correctly used
`onDestroy`, but the native host's `load-scene` path discarded the outgoing
Scene without invoking that hook. No original-game approval was issued.

The host now validates the destination and transfer overrides, invokes outgoing
Behavior `onDestroy` hooks in stable order (including disabled objects), then
starts the destination. Same-Scene reload uses the same path. The new native
`scene_replacement_destroys_old_behaviors_before_starting_new_ones` test failed
before this fix and passed after it; all eight native host tests passed. It
covers stop-before-start ordering, same-Scene restart, invalid destination
rejection before cleanup, and exact continuous/single-Tick audio equivalence.

The unchanged Copilot proposal was retested against the corrected debug host
only in an isolated project. All 19 tests / 252 assertions passed. The normal
45-Tick Menu/Arena replay emits exactly one music start and two shots; the
58-Tick preference/entry/restart/exit replay emits starts at 8/16/32/40 and stops
at 16/24/40/48. Each start retains volume 0.7 and mute=true; a second run returns
identical audio events. Evidence:
`artifacts/r5-audio-wiring-review-0QJIAQ/summary.json`.

Full regression, packaged-host verification, owner installation and original
Copilot application are separate remaining checks. Neither the rejected first
proposal nor this still-unapproved replacement was applied by the supervisor.

The new hit master was independently rehashed and fully decoded read-only:
`candidate:bfa2c7418466243663342cab8cb53c7e51db4212c390dba603c5fde151d39853`,
SHA-256 `fa4228b6a5bb63f912ad75a25fd0a6d804061d1537670dd40fb650a2b7b359f7`,
180ms / 48kHz stereo PCM16 / 34,604 bytes, peak 0.747100830, RMS 0.104631010.
It was presented separately for owner listening. The owner explicitly replied
`适合，可以使用` to the 180ms hit-master question. This is a distinct listening
acceptance; the corresponding Studio selection/import still needs execution.
Neither file was imported by this read-only inspection.

### Packaged lifecycle verification and installed-gate diagnosis

The `r5-audio-lifecycle-check` package with archive SHA-256
`c77c888d909fcad93e9c8c39ff2580e64f0d1e670853ab18d22ad3a8f863fac2`
passed the real candidate-card WAV/MP3 playback gate using its own renderer.
The exact pending Copilot proposal also passed against that package's native
host: 19 tests / 252 assertions, one music/two shots on normal entry, four
ordered music starts/stops on the lifecycle replay, and exact repeated events.
Evidence: `artifacts/r5-audio-wiring-review-smro2y/summary.json`.
Its exact text transaction independently passed preview/approval/apply/validate
and exact rollback in an isolated copy; evidence:
`artifacts/r5-text-transaction-review-S9i6Wa/summary.json`. The original revision
remained `4680c77214db9c4b4d840a6153a67d119a2cf259caf3f7b27f42799f3736fe21`.

The aggregate check passed all preceding gates and packaging, but the installed
quality tail timed out again. A diagnostic rerun retained the child output:
the real P15 UI/recovery report was already `ok: true`; the subsequent P31
test-feedback screenshot stage had created its evidence directory but no first
frame. The screenshot readiness helper waited indefinitely for two animation
frames. That hint is now bounded at two seconds and foreground/compositor
recovery is attempted if it expires; a real, nonempty capture is still mandatory.
This is a test-infrastructure correction, not evidence that the original game's
sound or independent human acceptance is complete. The revised aggregate run,
new archive identity and owner installation are recorded only after they pass.

### Installed correction passed

The subsequent uninterrupted `npm run check` completed with exit 0, including
native host/Player tests, P14–P21 gates, each example's 100 deterministic runs,
real GPU windows, packaging, clean installation, upgrade, UI/recovery and
preserved user data. Final archive SHA-256:
`e3558835b039d55ce765930b3406ec5574ca7d588d4da7abb970c9e1fd8a6d5d`.
The installed test-feedback gate captured all required real frames and passed;
its frame-wait/recovery counters were zero on this run. Thus the pass does not
independently prove the precise cause of the prior intermittent screenshot stall.

The owner installation was updated after normal shutdown. All 287 manifest
content hashes matched; its prior directory is recoverable at
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-pre-audio-lifecycle-20260906-051959-win-x64`.
No original project or user-data files participated in installation. The actual
installed executable re-passed candidate-card playback: MP3 0.130563s / WAV 0.2s,
both clocks advanced with null media errors, correct panel geometry and blocked
external HTTPS media. The fixture Job store and project authority were unchanged.

The final packaged-host wiring replay passed again in
`artifacts/r5-audio-wiring-review-sbU5p4/summary.json`; the installed-host exact
transaction/rollback passed in `artifacts/r5-text-transaction-review-LsqHoz/summary.json`.
Only then was `changeset:e14d528c-7567-445b-8dec-43143ccfe429` approved at
`2026-09-05T21:21:04.597Z`. Original application remains the internal Copilot's
responsibility, not a supervisor file edit or direct apply.

The native Studio composer confirmed handoff turn
`01a07375-d9ad-7901-b428-56666f360ece` on the original thread. Internal Copilot
read the Skills and approval, applied `e14d528c…`, validated the project and
read actual lifecycle and shooting audio-event results. The original shared
record is now `applied`; this is not an isolated-copy application claim.

The supervisor then selected the exact owner-accepted 180ms hit WAV through
the original Studio Resource panel. Job `c9129672…` is now
`awaitingImportApproval`, selected Candidate `bfa2c741…`, review decision
`review-decision:0e1c5e7a-e150-435b-8fe5-0edbf2c4e3d1` and import ChangeSet
`changeset:421f555b-44f5-4b14-87f5-2fd09f7379dd`, proposal hash
`03044086cb6fe5563360ca13c7faaaf5d7000e8ee39149923d75dfe1028cf7df`.
The proposed WAV's SHA is the owner's accepted `fa4228b6…`; selection creates
only a reviewed import proposal, not an applied game resource.

### Accepted hit master imported by the original Copilot

The exact four-file import passed isolated preview/apply, native WAV decoding,
project validation, all 19 tests / 252 assertions and exact rollback. Evidence:
`artifacts/r5-audio-import-review-tqmKyT/summary.json`. The original project was
unchanged during this review. Approval was recorded at
`2026-09-05T21:27:49.751Z`, bound to the proposal above and approval content hash
`950e180edb3a7a1b865e847294d05a2bca8b69c1fee7ddeec8e2da16542ceace`.

The original Studio Goal was resumed using its Continue control. In turn
`01a0737d-2156-71d0-af01-3c54639528c3`, internal Copilot applied the approved
import and validated the project. The shared ChangeSet is now `applied`.
The supervisor did not write or apply original game files. Hit-event wiring is
a separate pending gameplay proposal; importing a WAV alone does not prove
that an actual projectile collision plays it.

### Hit-event wiring review

Internal Copilot proposed one-file ChangeSet
`changeset:cd60a2db-e2b1-4545-8ff7-21d33a06ab0a`, proposal hash
`359e84f7ff147bcafff437a1b82bc26902d31bbd2c46511149647606326ff8f6`.
It preserves shooting and routes real `tank:hit` contact events to the accepted
WAV, one-shot at volume 0.66 on the existing master bus. These events include
blocked friendly impacts; playing the cue does not assert damage was accepted.

The exact diff passed all 19 tests / 252 assertions against the installed host.
Actual hit plays occur at Ticks 10/31 in combat-win, 13/64 in combat-loss, 7 in
friendly-fire and 11/41 in gameplay-smoke; the preference/Scene lifecycle route
has none. Five repeated runs reproduce every audio event and final state hash.
Evidence: `artifacts/r5-hit-wiring-review-APOTiO/summary.json`. Independent exact
transaction/apply/validate/rollback also passed in
`artifacts/r5-text-transaction-review-0Z4CUb/summary.json`. Original revision
`eea64071151e7711509e4a523e69c2a56990e155028702bcf85733be4fcd378b` stayed
unchanged during review. The proposed revision is
`2865692baf485df5bd0282c6d793757b6d6a4003354fdb96a16c2c768bae1377`.

Approval was recorded at `2026-09-05T21:36:41.381Z`, bound to content hash
`ffd6484ba060b809bd9c96dee95a9b15dd5b85bc8d2200cfbbf65be6241d6a51`.
The existing Studio Goal was continued; application and post-apply checks
remain the internal Copilot's responsibility.

Original turn `01a07380-ddfc-7482-87c3-a899c25d2e66` subsequently applied this
approval, validated the project, verified the exact hit events and ran all
19 project tests successfully. The supervisor's read-only post-apply audit
verified every report's content-addressed ID and SHA-256, and matched module
hashes, final state hashes and complete audio-event arrays against the isolated
review. All 252 assertions pass at original revision `2865692b…`. Evidence:
`artifacts/r5-hit-postapply-audit-yFFeF0/summary.json`. The shared ChangeSet is
`applied`; the imported WAV still hashes to the accepted `fa4228b6…`.
The audit did not alter original authority or make a provider request.

### Next audio request: failure reason still unresolved

Original Copilot made one new UI-navigation source request in
`asset-job:5387ac2f-3cd6-4b5b-a88e-62b844a024d1`. It returned HTTP 400,
`ASSET_PROVIDER_PARAMETER_REJECTED`, one attempt and no candidate. Cost remains
unknown. It was not retried. The existing failed 0.7s wall Job was left alone.
The new request's model, 0.5s duration, loop=false, influence=0.3 and MP3 format
match the successful hit request. Thus this evidence does not establish that
the numeric duration or key is wrong.

Read-only source inspection identifies a diagnostic gap: the broker classifies
HTTP 400/422 without reading a safe structured provider error category. The
[official ElevenLabs 400/401 guide](https://elevenlabs.io/docs/help-center/technical/api-error-code-400-or-401)
documents multiple causes, including quota; its
[sound-effect endpoint](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
accepts duration 0.5s. The exact failed cause is not recoverable from the stored
generic message. Next work is bounded, allowlisted error classification with
secret/hostile-response tests, not a blind paid retry, key read or policy change.
No diagnosis of actual quota exhaustion has been made.

### Later control-event regression

The original Copilot's real loss/mute/restart comparison `0e90e135…` exposes
`RUNTIME_AUDIO_BUS_UNKNOWN` at Tick 2037: the old stop API emits the default Bus
instead of the project's `tank:bus/master`. Prior play/stop counts, tests and
equal Studio/Player observations do not prove error-free audio control.
See `P24-AUDIO-CONTROL-BUS.md` for the red/green fixture and remaining actual-game
migration; no root write or direct application to original game files occurred.

### Owner accepted the 680ms wall-destruction master

On 2026-09-06 the owner replied “合适” to the explicitly presented 680ms
wall-destruction WAV. This acceptance refers to Job
`asset-job:dbe0ba45-bbfa-41ef-9c10-a97ca56a2993`, Candidate
`candidate:1ccd17c3bbb8327eca85a3c44049663c6aecb9d9d3d5b0eef990f2d532e32f58`,
not its raw MP3 source or the already accepted 180ms tank-hit master.
The read-only SHA-256 check still matches
`fa2d636001ec9a7f5557c2fee7e4c7f756f8ee41b13008a4bd3b730fade697eb`.
The previous installed-Player decode reported 680ms, stereo 48kHz PCM16;
the owner, not the supervisor, supplied the aesthetic acceptance.

This turn did not yet record a selection in the running Studio. Native
`activate_window` timed out twice, including one fresh-window recovery, so
Computer Use input was stopped. The durable Job remains `awaitingReview`,
with one provider attempt and null selected Candidate, review decision and
import ChangeSet. No new generation, original game edit or import occurred.

Next action: select this exact WAV in the owning Studio Resource panel, review
the resulting import ChangeSet with isolated apply/tests/rollback, then approve
it for the original inner Copilot to apply and wire to wall destruction. Do not
instantiate a second broker to mutate the live Job store: the owning broker
retains in-memory state and saves the entire store. This acceptance does not
complete P31's remaining sounds, final mixing/package checks or P33 journeys.

#### Owner-window recovery and approved import

The next Goal continuation found the old Studio window absent, launched the
existing installed executable and reopened the original Tank project. The
supervisor selected the exact owner-accepted WAV in the Resource panel.
The owning broker persisted review decision
`review-decision:4bddee32-9a94-46d4-9ef0-82dc168ea74d` and import
`changeset:4e986416-169b-4c6e-aa66-b8c7521731d0`, proposal SHA-256
`c27ae778bbc5e8054caf7eb8ee2a2da9b89a74ecc5d954c666f08fca64a21606`.
The Job reached `awaitingImportApproval`; provider attempts remain one.

The exact four-file import passed installed-Player WAV inspection, isolated
apply, project validation, 19 tests / 252 assertions and exact rollback.
Original authority remained unchanged. Evidence:
`artifacts/r5-audio-import-review-1Dq6sl/summary.json`.
Approval at `2026-09-06T03:37:52.655Z` is bound to content hash
`adb8bb1a8fd1b8d62c6c5f8b3fdc695d014f415800b006b3e8aa6ee7522b5bfc`.
Application and destruction-event wiring remain the original Copilot's work;
this approval alone proves neither. As with the other audio imports, the
generation-time art-direction/Brief reference fields are null: final provenance
coverage remains open and must not be reported as complete on this evidence.

Original Copilot turn `01a074cc-5a58-7a71-9f36-6ad1d53164bc` applied the
approved import and validated the original project. Read-only review confirms
the shared record is `applied`, the imported bytes match the accepted SHA and
revision is `e7b2840ea58ed207ee0b3479464003d7dc2b7f1b06502183dba58ce60d3fec9d`.
It independently noticed the null references and proposed a separate two-file
provenance update, `changeset:2d43b9c4-f4a4-4e3d-b6a2-aeb7441bab4a`, proposal
`3e5681b224be7d3b3bbd2487405ac5babfab2ce68e1fb2ef928991a4d648f1ee`.

`artifacts/r5-wall-provenance-review-tUePmL/summary.json` verifies the exact
semantic delta: current Skill/Brief hashes, matching manifest/sidecar records,
the explicit independent-P33 limitation, unchanged other assets, audio bytes
and review decision. `artifacts/r5-text-transaction-review-mZLe92/summary.json`
independently verifies preview/apply/validation/exact rollback on a copy and
unchanged original authority. Approval at `2026-09-06T03:42:26.882Z` is bound to
`c044b4e8fe7ae06deaff12a0b0a42cf639b0cbbd67c3994d799fb477e766276f`.
These references add project context, not a new provider generation or a claim
that the provider received those files. Existing Job history stays unchanged.

### Owner accepted the 100ms UI-navigation master

The owner's asynchronous answer to the specific 100ms menu-navigation audition
was “合适，可以使用”. This is a distinct decision from the earlier 680ms wall
and 180ms hit auditions. It does not approve final mixing, other UI sounds,
victory/defeat stingers, or P33.

- Job: `asset-job:335b4845-1df8-4019-8c49-59cf0ff458e3`.
- Candidate: `candidate:2706693b4ad955f3825385f54acf13686b65332ea857879f7fb2e0de7c967e5b`.
- WAV SHA-256: `c64ca05a7c8b6f89041355e4d7f80b07bd38f5d3ec642a098e9d8e6a7899ba03`.
- Verified PCM16, 48kHz stereo, 100ms, peak 0.582001, RMS 0.109269.
- The owning Studio persisted review decision
  `review-decision:32f8a9b1-7c41-4890-8ea7-7f3e7b2311f1` at
  `2026-09-06T04:01:38.289Z` and proposed import
  `changeset:3a881629-421d-46d8-a60a-74bcc0c4b7c3`.
- Proposal `ec7ad44ed224daa8e2a8d7799f911a2514f30f16f8b9125e439271f835dfdd43`
  changes only the four asset/import-settings/provenance files. Exact isolated
  import, actual decoding, 19 tests / 252 assertions and rollback all pass in
  `artifacts/r5-audio-import-review-Rn16Ye/summary.json`.
- Approved at `2026-09-06T04:04:53.704Z`, content hash
  `1956304b696f0a57e1b6f956e9e128d5428aa6e9651bea330ced4f7166119ee0`.
  Original revision remains `6f9d3f9e…`; application and UI-event wiring are
  still pending the original Copilot, not performed by the supervisor.
- The generated import preserves source, master transformation and human
  decision. Project Skill/Brief hashes are null and need a separately reviewed
  contextual provenance supplement, as with the wall import; this is not yet
  complete provenance coverage or a claim those files went to the provider.

### UI-navigation import recovered after owner Studio restart

At the owner's explicit retry after closing the unresponsive Studio, the
supervisor reopened the existing installation and original project, then used
the original Goal's native Continue control. No replacement conversation,
provider call or supervisor game-source write was used for the recovery.

Original turn `01a07505-a0e1-7920-8b95-d3a413714837` read and applied the
previously approved navigation import `3a881629…`; project validation passed.
Read-only audit `artifacts/r5-ui-nav-applied-audit-fWWriz/summary.json` confirms
all four original files exactly match the approved after-hashes, including the
accepted WAV. Revision became
`98777eb8d2a0409e4d40cf5cf9f4a3258b02b519d5fa07125945afa21117fdee`.
This supersedes the earlier pending-import status, not the UI wiring gate.

Copilot proposed separate provenance supplement `e7371f19-51a9-4a71-88ad-958a1d925c44`,
proposal `b672696a1bd3df8c2102a1f8811c36f3f0adde2f0a4d543025f0419b8d1f9d2a`.
`r5-ui-nav-provenance-review-fSs5wS/summary.json` proves only the current
Skill/Brief hashes and the independent-P33 restriction changed; other assets,
audio bytes, transformation, provider history and review decision are unchanged.
`r5-text-transaction-review-jEhOvt/summary.json` proves exact isolated preview,
apply, validation and rollback, without original authority changes.
Approval at `2026-09-06T04:44:04.031Z` binds content hash
`5ed98d55e2779083c0cf0461ccd1d867ad0812c930663c94d8d5767a2f7d0c73`.
Copilot subsequently applied it; these are contextual references, not evidence
that the provider received the Skill or Brief during generation.

### UI-navigation wiring reviewed and applied

Proposal `33af40be-d317-4b60-b586-592cde08fd44`, hash
`28ad09ecd35393fd6bd12731f13e6d006198c07d08b7ad9d7f1ea370aa27c76d`,
changes only `scripts/behaviors/input-router.ts`. Help, settings, eligible pause,
mute and volume press edges now play the accepted navigation WAV once through
`tank:bus/master`, without looping, using Tick/action-addressed instance IDs.
Confirm/back and match-result sound coverage remain separate unfinished work.

Exact transaction and rollback pass in `r5-text-transaction-review-8IVP1v`.
Executable review `artifacts/r5-review-ui-nav-wiring.ts` passes all 19 tests /
252 assertions and 11 repeated probes in `r5-ui-nav-wiring-review-xIEHPd`.
The probes preserve gameplay and old audio/control semantics, check actual
source/derived WAV hashes, event-ID uniqueness and full deterministic event
equality, and reject extra plays on held input, release-only, ineligible menu
pause and idle. Same-Tick insertion may renumber later event sequence IDs;
the baseline comparison excludes only that ID, not any semantic field or
ordering. Earlier harness failure `r5-ui-nav-wiring-review-Fw9b9I` is retained.

Approval `r5-ui-nav-wiring-approval-tYQ0jh` binds content hash `b1c1017b…`.
After native Continue, original turn `01a07510-0c60-76c1-9ef7-c84842af229d`
applied the proposal and passed project validation. Read-only original audit
`r5-ui-nav-wiring-applied-audit-aURXr7/summary.json` confirms the exact module
hash `d3617d0b…` and reviewed revision
`7a2364ffc8f2ba299ee0cdaf5eca2bc2e389ce2c02dc8e74367e8756de20def3`.
This is real integration, not final perceptual mixing, complete sound coverage
or independent P33 acceptance. No supervisor game-source write occurred.

### First wall-wiring proposal rejected by actual runtime regression

Original Copilot applied the provenance update, then submitted
`changeset:4f6331a6-f829-44cb-877a-743a8c5b8e9e`, proposal
`2300fc9b22489329c0aa8abcf6670d6d9fb54f520c452b1da29f1a473e647455`.
Its four files add a `wall:destroyed` audio branch and a fixture/replay/test.
The isolated exact transaction passes in `r5-text-transaction-review-1rCy7g`,
but the full proposed-project runtime review fails:
`artifacts/r5-wall-wiring-review-BoGZra/wall-break-audio.test.json`.

The new fixture creates `tank:ui-state` without the required menu UI objects.
At Tick 0 `scripts/systems/ui.ts:41` raises `SCRIPT_RUNTIME_ERROR` because
`tank:object/menu/help-frame` is unavailable. The new test cannot reach its
assertion snapshots, so a successful preview/validation/rollback does not prove
the proposed gameplay test works. The proposal was rejected, never applied to
the original. Original revision remains `6f9d3f9e…`; wall sound is imported but
not wired. The failed artifact and checks remain available for repair review.

### Wall-wiring replacement passes and is applied

After reading the structured rejection, original Copilot submitted replacement
`f1a02d7e-cdc5-4710-9b4f-b724321f80a6`, proposal
`6c8c016299ee947cc7ca796b8790f4a2aeac47133627a63d23d9f0102c187e7b`.
It removes the unnecessary fixture UI-state object while preserving real fire,
projectile collision, wall damage/destruction and all existing assertions.
The original rejected proposal remains unchanged and unapplied.

`r5-text-transaction-review-BQh4Yf` passes exact preview/apply/validation/rollback.
`r5-wall-wiring-review-QyaklP` passes 20 tests / 255 assertions, five repeatable
gameplay/audio-control probes and destruction/nonfatal/idle counterexamples.
The accepted WAV plays once at Tick 3, through `tank:bus/master`, nonlooping,
volume 0.78, with exact source/derived hashes and Tick/wall-based instance ID.
Nonfatal wall damage and idle do not play the destruction cue. Existing
gameplay and other audio controls remain unchanged; event IDs remain unique
and full repeat event streams match.

Supervisory approval `r5-wall-wiring-decision-lbLxiS` was followed by original
Copilot turn `01a07513-8aa3-7832-9c87-4e3e871d71a0` applying the proposal,
validating the project and running/reading its actual dedicated test.
Read-only audit `r5-wall-wiring-decision-Nmlh4l` verifies all four applied
after-hashes and reviewed revision
`77be28e99040c8488674f7e3a33e8e93e865d619f6f47756c1d6f77667a541b4`.

`r5-original-ui-wall-reports-E9pwlT` independently validates content-addressed
original test reports `e3a7f7600eac0824e9500939` (UI, preceding revision) and
`9dc9e0a9864e90f704e9b865` (wall, current revision). Each exactly matches its
isolated reviewed bundle, state, snapshots and audio events. This closes the
two wiring checks, not remaining sounds, final mixing, current-revision full
game recording/packages or independent P33.

### UI confirmation master — owner accepted, import approved

The original Copilot's Job `asset-job:5d749df8-e6bc-4530-9192-9b2e434dd448`
preserves two provider attempts (first transient failure, second success),
one source MP3 and two derived WAV candidates. The owner explicitly accepted
recommended candidate
`candidate:797ecb2f61bcd59d960c1325dacb88733124d07b7323fbf62afcce24086ec6c8`.

- WAV SHA: `c5dbf06a7bdff99414823660cd3033a7ad6c9c2bcaee601f537353106ab5a224`.
- 100ms, stereo, 48kHz PCM16; 19,244 bytes; peak 0.53652954, RMS 0.08267120.
- Processing: 0–100ms, 1ms fade-in, 6ms fade-out, +25dB.
- Source MP3 SHA: `93dbfdd55de4c2302bbe51b8b2e829f9fc4e0aaf7a31aeec6294aa2c34c893e4`.
- Technical evidence: `r5-ui-confirm-master-review-M8LHsR` and
  `r5-ui-confirm-master-review-Fy76jm`. Historical creation Player `197eff4e…`
  and new installed Player `8140209c…` reproduce identical WAV bytes and metrics;
  provenance retains the actual creation engine hash.
- Native Studio review decision `review-decision:43059050-d161-4689-a6a2-d9e4c3bf7c5b`
  was persisted at `2026-09-06T05:22:33.986Z` from the owner's audition reply.
- Import `changeset:668078c8-ad7b-4a31-a78a-baed3536fd59`, proposal
  `c3978c54802ae066e383081068c81f5d9e44ec6a7b13af9593cc1e35a98f4c67`, passes
  exact four-file apply/validation, 20 tests / 255 assertions and rollback in
  `r5-audio-import-review-6eoD3d`.
- Metadata-only supervisory approval: `r5-ui-confirm-import-approval-Sp2JVu`,
  content hash `2c1c18445d958f0e3986b8fec998ce25910a9e6f333eee1f34fbce19f2030b3a`.

Native Continue resumed original Copilot turn `01a0752f-677b-72f0-91bb-1da2b15b073f`.
The original Copilot has applied the import. Audit
`r5-confirm-import-applied-audit-DbWsli` verifies all four after-hashes, WAV,
manifest and provenance at revision
`01e71668d5caab7d39ffd5fcbcaff7ce5c81d4caed99cfaa8760d15c740d0266`.

Contextual provenance proposal `144f6c48-bb70-4984-ad0c-9b8d36247eb2`, hash
`78dfce40c79b60f5a99eb3cbe075d393945f2aca779e25dd6fce79b9c0a25601`, passes
exact transaction/rollback (`r5-text-transaction-review-E7Wu10`) and strict
two-file semantic review (`r5-confirm-provenance-review-OzPAXS`). It adds only
current Skill/Brief hashes and the candidate-review/P33 distinction; other
assets, WAV, historical creation engine and provider/review identities remain
unchanged. Those context references do not prove the provider received them.
It was approved at `05:30:33.297Z` and subsequently applied by the original
Copilot. The two original file hashes match the approved supplement at
revision `3993050d6faad9a5fb7478e9e86d2475912b43e5b34218c26d50f5d88388769e`.
An earlier transaction-helper invocation used an incorrect expected hash and
failed before creating a copy or mutating anything; it is not a product failure.

The R5-only paid-work grant was renewed under the existing user authority,
preserving historical grants/global policy/Job counters. Evidence:
`r5-scoped-generation-renewal-QH2zOr`; this action made zero provider calls.
This audition does not certify final mixing, whole-game usability or P33.

### Confirmation event-wiring review

Original Copilot proposal `changeset:34648712-fa02-48c8-986d-cc2847f76f55`,
hash `fca1989a035c02b091288198342aec4a25f6badc67ce325509d2cdee4932823d`,
changes only `scripts/behaviors/input-router.ts`: a non-looping master-bus
confirmation helper, menu deployment and explicit restart call sites.
The exact before/after transformation was independently checked; no gameplay,
test or other audio source is changed.

- Exact isolated transaction/rollback: `r5-text-transaction-review-I4TFP1`.
- Runtime: `r5-confirm-wiring-review-GLaAcs`, 20 tests / 255 assertions and
  14 repeated probes. Complete scenes, old audio semantics, all repeated
  audio event IDs and state hashes agree. New confirmation uses the accepted
  WAV hash and stable per-tick instance IDs.
- `audio-session-persistence` confirms only at Ticks 8 and 16, preserving
  muted/restart/return state. `gameplay-smoke` confirms at Ticks 0 and 90.
  Held deploy plays once; release, idle, firing, leaving help/settings and
  return-to-menu are negative cases. Command-driven scene changes do not
  gain confirmation sound implicitly.
- The first reviewer harness expected only Tick 0 in `gameplay-smoke` and
  omitted its explicit restart input at Tick 90. That isolated harness
  expectation was corrected against the existing replay; no game source or
  game test was changed to satisfy it.
- Metadata-only approval at `2026-09-06T05:51:38.699Z`:
  `r5-confirm-wiring-decision-j3RClu`, content hash
  `cd84d8795f4d7c08a8c9600ec6a6fb8f69938be2fc29b22bd58d968d5df0b76c`.
  Expected applied revision:
  `cdffc27d8dcf50b57682af6213cdcbe374b83fd89599fbebc631c698945a650e`.

Original Copilot turn `01a0754f-e2a1-7a53-9a62-6a4749f9bcf5` applied the
approved wiring after native Goal Continue in installed repair `87cb8897…`.
`r5-confirm-wiring-decision-UsvMbp` verifies exact original revision `cdffc27d…`
and the reviewed file hash. It ran actual test
`test-run:cacadf507bf1537fd6baebb4`; `r5-confirm-runtime-audit-9aWMDT` verifies
its content-derived report ID and exact bundle/state/snapshots/audio match to
review, including only Tick 8/16 confirm plays. This muted replay proves
events and bus semantics, not audible final mixing. The supervisor did not
write or apply the original game source.

### UI back candidate — awaiting owner audition

The same Copilot produced Job `asset-job:16b824ee-ff64-477a-8214-b5245f00aab4`
using one provider attempt, retaining the source MP3 and a 110ms derived WAV.
The new candidate is not selected or imported.

- Candidate: `candidate:c9965524b51a3757993b7181c575140732be2b3b95c647f60b2e871a60fbd02a`.
- WAV SHA: `782d23e20648b8776b3daa544f2916652eaa66fdaf6fa1c158540c74a11fe1b3`.
- Source SHA: `9515a072480a49ecb5ff7aa8c243e1f7c2a8fdc15aad51f6f0bc9d6537a0d264`.
- Creation engine: `978f4af11ae1c785c5dbc2f03710fc937d858942cd97832761f845cd87a5c29d`.
- 0–110ms, 1ms fade-in, 8ms fade-out, +6dB; 48kHz stereo PCM16,
  21,164 bytes; peak 0.697265625, RMS 0.14785070, no clipping.
- `r5-ui-back-master-review-n6gWEz` reproduces the exact WAV from its source
  and processing spec, verifies metadata, and preserves original project/Job
  hashes. The review made zero provider calls.

The owner has been offered the actual WAV with an asynchronous listening
question. Technical checks are not approval, and the earlier 100ms confirmation
approval does not authorize selection of this different sound.
