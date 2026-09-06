# R5 final-revision gameplay evidence

This is supervised machine verification, not independent P33 acceptance.
Original Studio Copilot authors and runs the original Tank project. The
supervisor only reads its logs/observations and verifies isolated artifacts.

## Normal-entry victory — passed

- Revision: `d7ea102d392376aaddecd5a0923ca9c70c811f7622c76bd06716a94e86e1d78f`.
- Original input log:
  `input-log:8b7fb959629b487c80d59a755db5c25ecc6164f0b9f214dd7233433c9f250a4b`.
- Starts at authored `scenes/menu.game.json`; ordinary movement and firing
  inputs reach victory at Tick 1008. No fixture, command or control injection.
- Final state: won, six enemies defeated, score 600, player HP 2/5.
  State hash: `740a1491777557fd98cc5c6445f2f46913cd961ebb2db90381cea28f958154ad`.
- Both 1280×720 and 960×540 Studio/Player pairs have identical state,
  drawables, full audio arrays and PNG bytes, with zero diagnostics, missing
  clips, failed playback or unresolved/fallback drawables.
- Both hosts record 106 audio events: 47 shots, 28 hits, five wall breaks,
  19 solid-wall impacts, one music start, one confirmation and exactly one
  victory cue; defeat cue count is zero. Control events are included in 106.
- Final images were visually inspected: readable HUD, resource-backed arena,
  distinct victory panel, score and restart/menu actions.

| Viewport | Studio observation         | Player observation         | PNG SHA-256                                                        |
| -------- | -------------------------- | -------------------------- | ------------------------------------------------------------------ |
| 1280×720 | `900f8fc13adcdf068c276294` | `cc9c4432143b2e4bf9ce52fc` | `fbfb26bf17483f2654c1f2e38147165e1613ea00c37759916d8adccaace67b03` |
| 960×540  | `144f3be414a30ce3816989ae` | `0c992364e9791799209d7fd9` | `e8b04b3be21c2a1203854537429e03adc585bf8515a7861d1aca38cc5178d45e` |

Executable read-only audit:

```powershell
node artifacts/r5-audit-final-checkpoints.ts artifacts/r5-final-victory-checkpoints.json
```

Receipt: `artifacts/r5-final-checkpoint-audit-k2oX7c/summary.json`.
The receipt freezes exact input logs, observation documents, frames and actual
native Player results by content hash. Negative checks reject wrong expected
state, undeclared audio buses and shared fallback rendering, so two equally
wrong hosts cannot pass merely by matching. Original project is unchanged.

The manifest was corrected from an assumed `move-up` action to the actual
recorded down/right/left route; no game input or result was changed to satisfy
the auditor.

## Normal-entry muted defeat — passed

- Same final audio-complete revision as victory. Input log:
  `input-log:8f89bd5e6ab3b84dfbf23628eff5182bc4682ebc257244ddea4c287f2499388b`.
- A normal Menu entry and actual mute input lead to natural defeat at Tick
  1408: score 0, six enemies remaining and player HP 0/5. No state injection.
- Final state hash:
  `90f32bdfe8cb73c7a134a301b95a43de2f8d78fffe4234b8b49a8d024a3c0ed7`.
- Both resolutions pass exact Studio/Player state, drawables, PNG and all
  189 audio events. The defeat cue is scheduled exactly once, victory zero;
  muted/appliedMuted are true and volume/appliedVolume remain 80. A scheduled
  play event under a muted bus does not imply audible sound.
- 1280 pair: Studio `24a996d3cc07797759b2a337`, Player
  `e2c303bb99892a3f3964151c`; PNG
  `3a310111106da10d0d9764ee5198214c2f6ea1d59dac9e9a1bd96be640685df1`.
- 960 pair: Studio `ef7ea8342751959ada164a3e`, Player
  `7009e8bc4f8dac467b1a2220`; PNG
  `b7dba2a366163b5f970d7bc30642320b26739c576ea96cd605a487366bed928e`.
- Audit: `node artifacts/r5-audit-final-checkpoints.ts artifacts/r5-final-loss-checkpoints.json`;
  frozen receipt `artifacts/r5-final-checkpoint-audit-GDUAbd/summary.json`.

## Still open

Independent human play, perceptual mix/quality acceptance and network-isolated
clean-profile acceptance remain open. Paired audio events prove
sound selection and timing, not subjective mix quality or independent play.

## Natural defeat followed by muted restart — passed

- Original log:
  `input-log:7c412ce51b2c243c5a546855ad69825b9918eb835d480e2a2cbcb48920368436`.
- Tick 1418: ordinary `match-restart` restores playing, HP 5/5, score 0 and
  six enemies; muted/appliedMuted remain true, volume/appliedVolume remain 80.
- State: `4de677c5247cb73d19006f453e8925a7e6223cea523ad58fe4cf5944df11eae3`.
- Both resolutions match in all 194 audio events, frame, state and drawables.
  Music starts once per match (two total), defeat remains once in retained
  history, and no victory cue is introduced.
- 1280 Studio/Player: `8bb37a00723218f6b3b5cf7e` / `595b75f76804c95d4bad4df2`.
  PNG: `df5c4e5363237b8e5bc540a0ff435db5b7ad90bf542adbc1e9bb2b33f5258fe6`.
- 960 Studio/Player: `92af0012576f23f05596f8ac` / `4b2ea3ec14d30c80bb52383a`.
  PNG: `f98d29f6ae6dc0564e574df89bacb3dff48b1252cacaf53e31b670cabb099bed`.
- Audit manifest `artifacts/r5-final-restart-checkpoints.json`; immutable
  receipt `artifacts/r5-final-checkpoint-audit-q1mH7M/summary.json`.

## Actual Development and Release archives — passed

Original Copilot built and verified both packages at `d7ea102d…`.
Supervisor-only `artifacts/r5-verify-recorded-packages.ts` then extracted the
actual ZIPs into isolation and replayed all three original logs in each:

- Development ZIP SHA:
  `062d304d6451372d1e42c11785724c42cf02552221307753c5bf63d5d4852c3b`;
  68 content hashes, six Prefabs and all 19 assets checked.
- Release ZIP SHA:
  `95aac9da3c83ed6f4bc0ad94b44c8c606d981a1335f3ffd206c3aa147fa1b448`;
  26 content hashes, six Prefabs and all 19 assets checked.
- Each extracted package uses the trusted installed Player, starts with no
  Node/Codex/provider environment, reports no external dependencies, presents
  five native WGPU frames and produces a captured GPU PNG.
- All six long replays reproduce recorded state and both resolution PNGs.
  The full normalized audio arrays and drawables also match explicitly pinned
  original Player observations, not merely one host's final state hash.
- Immutable result: `artifacts/r5-recorded-package-review-JHDlG8/summary.json`.
- This is not a network-isolation experiment or independent human play.
  Development may subsequently be rebuilt by short-flow Player comparison;
  its newer receipt must be inspected before calling that newer ZIP verified.
  Release is explicitly kept unchanged during the remaining short-flow work.

## Superseded approval wait — closed without source changes

CompletionRun reconciliation was waiting on `changeset:d58c1003…`, an older
win/loss provenance proposal. Both exact sidecars and every changed asset
record were already present through approved/applied merged `2434a90d…`.
The supervisor proved this identity, rejected only the superseded proposal
with hash-bound explanatory feedback, and verified the original revision
was unchanged. No proposal was applied, no media regenerated and no history
deleted. Receipt: `artifacts/r5-superseded-context-closure-e8fstR/summary.json`.
Readback shows zero linked awaiting-approval ChangeSets and a running
CompletionRun. This closes this stale wait, not every possible Goal issue.

## Normal-input short flow — passed

The original Copilot completed a 123-Tick, normal Menu-entry session using
only `runtime.input` (no commands or controls). The explicit manifest
`artifacts/r5-final-short-flow-checkpoints.json` pins six checkpoints and all
24 observations. Read-only audit `r5-final-checkpoint-audit-A6qL3A` verifies
12 Studio/Player pairs, exact state/drawables/frame/audio and negative checks.
All twelve final Player images were visually inspected.

| Checkpoint  | Tick | Verified state                                                         |
| ----------- | ---- | ---------------------------------------------------------------------- |
| Menu        | 97   | Menu visible; volume 80, unmuted                                       |
| Help        | 99   | Help visible through real help input                                   |
| Settings    | 111  | Actual volume 80→70→80 and mute→unmute bus events, correct final state |
| Pause       | 118  | Pause screen; match elapsed 2 ticks                                    |
| Resume      | 120  | Playing screen; match elapsed advances to 4 ticks                      |
| Return Menu | 123  | Menu restored; music stopped at Tick 120, volume 80, unmuted           |

The final log contains 32 matching audio events, including eight navigation,
three back, one confirmation and one music-start event. Ordered checks verify
0.7→0.8 volume, mute→unmute, and music stop followed by retained bus settings.
No new game ChangeSet or resource generation was needed.

After comparisons, original Copilot rebuilt only Development:
`112c2b31707d4d79f90a710557ffdccde831747f35d02bc7585bcb2a4f9b5d97`.
Current verification is
`package-verification:f1aa90aec2303874ef71402d7f09bbcbddce61d67310808740be6fab6c291d3a`.
Release and its verification remain unchanged. Exact final archive audit
`r5-final-package-identity-7P3Z4Y` checks current ZIP bytes, content-addressed
verification/frame, report hash and all content entries. All 68/26 content
hashes equal the packages already replayed in `JHDlG8`, so this is exact
content identity, not an assumption that a later build is equivalent. The
verification service counts BUILD-MANIFEST as well (69/27 total files).

All 19 imported provenance chains re-pass at the same revision after closing
the superseded proposal (`r5-imported-provenance-audit-iNpOXw`).
