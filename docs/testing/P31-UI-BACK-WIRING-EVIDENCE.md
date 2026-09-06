# R5 UI back: supervised import and actual event wiring

The original Studio Copilot applied all game changes. The supervisor reviewed
isolated copies and changed approval metadata only. The owner accepted UI back
and delegated later test-project audio decisions to the supervisor; no further
per-sound audition is required. This is not independent P33 acceptance.

## Provenance and import

- Original import `4cda8196…` applied at `a73d171b…`; exact four-file audit:
  `artifacts/r5-applied-import-audit-lklvDB/summary.json`.
- Context-only supplement `2c296954…` passed exact semantic and isolated
  application/rollback review (`r5-text-transaction-review-c0nnyy`,
  `r5-back-provenance-review-PZykox`) and original Copilot applied it at
  `681e2748…`.
- All 16 imported assets (nine images, seven audio files) pass source, candidate,
  review and import-chain checks: `r5-imported-provenance-audit-CvvjKN`.
- Post-import Skill/Brief linkage is explicitly not provider-input evidence.

## Wiring and regression

Original ChangeSet `44dd174b-9e05-43db-9952-76bb43884cea`, proposal hash
`25b3f544263d0bb88f4c7c61fd718a7af7e9026d054f2541e698af03bca065c6`, changes
the existing input behavior and command system and adds one replay/test pair.
Closing HELP/SETTINGS, menu-space return and input/command return-to-menu use
back. Opening panels and pause remain navigation; deploy remains confirmation;
Arena fire remains shot. Gameplay logic is unchanged.

`artifacts/r5-review-back-wiring.ts` verifies:

- Exact isolated application, validation and rollback.
- 21 project tests / 268 assertions; previous tests were not weakened.
- 24 deterministic before/after probes, each repeated after application.
- Unchanged scene state and unrelated audio, no duplicate event IDs, no
  nav/confirm double-play on return, no release/idle/hold repeat.
- New replay back Ticks: 4, 12, 40, 48, 52, 64. Audio-session back Ticks:
  6 (closing settings), 24 (input return), 48 (command return).

Receipt: `r5-back-wiring-review-iViDwE`. The first supervisor probe omitted
Tick 6 closing settings from its expected list; the replay established the
correct expectation. Only that reviewer expectation was corrected, not game
code or project assertions.

Delegated approval: `r5-back-wiring-decision-qwMcr3`. Original application and
exact four-file check: `r5-back-wiring-decision-QNL5yp`. Current revision:
`2dd834ff063a4869badac262a1b4a33a066e91c1a2915ac3100b3f66900909ab`.

The original Copilot ran all 21 tests after application. Read-only audit
`r5-back-runtime-audit-VDkVN0` verifies original reports against reviewed
bundles, state hashes, snapshots and complete audio events. Report IDs are
validated against actual report content; timing-dependent timeline metadata
is not assumed identical between isolated and original execution.

## Remaining content

The same Copilot subsequently generated wall-hit (160ms), match-loss (1800ms)
and match-win (2000ms) masters. Supervisor technical/purpose review passes:
`r5-remaining-sfx-review-MqbbhV`. All three reproduce byte-for-byte from their
recorded source, mastering spec and installed binary, decode as 48kHz stereo
PCM16 and have headroom without clipping. Approval is for this test project,
not a claim of independent human listening or final perceptual mixing.

The original Copilot subsequently applied all three imports, with exact
isolated 21-test / 268-assertion and rollback reviews:

- Wall-hit `8635a2b6…`: review `r5-audio-import-review-uDgIyf`, applied-file
  audit `r5-applied-import-audit-ZZ6aHo`.
- Loss `30e5b471…`: review `r5-audio-import-review-d9Juja`, applied-file audit
  `r5-applied-import-audit-l2N48f`.
- Win `19965213…`: review `r5-audio-import-review-pbyPqf`, applied-file audit
  `r5-applied-import-audit-fEn1SF`.

Merged provenance supplement `2434a90d…` passed exact isolated rollback and
semantic review (`r5-text-transaction-review-HUJBt7`,
`r5-final-audio-context-review-yhurmy`) and was applied by the original Copilot.
At revision `1e75c91b…`, all 19 imports (nine images, ten audio files) pass the
read-only chain audit `r5-imported-provenance-audit-GouZvF`.

The first final wiring proposal `40e160de…` was not applied: isolated tests
found an invalid double-colon projectile ID in the new solid-wall assertion.
Supervisor rejected it with actionable machine feedback
`r5-final-audio-test-id-rejection-flAlQR`. A positive pre-hit existence assertion
is required alongside the corrected post-hit absence check. This is a real
test defect, not another request for the owner to audition audio.

The corrected final event wiring subsequently passed 22 tests / 276 assertions,
three long exactly-once probes and exact rollback and was applied by original
Copilot at `d7ea102d…`. Actual original reports match review. See
`P31-FINAL-AUDIO-WIRING-EVIDENCE.md`; final package completion remains open.
The old three-attempt
failed win Job remains terminal. The new win v2
uses a distinct reviewed recovery plan after provider health and two new
independent requests succeeded; old attempts were not reset.
