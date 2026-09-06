# P31 — executable UI content containment

## Discovered gap

The actual Tank review exposed a gap between component-field tests and visual
evidence: a 131-assertion staging run passed while Help/Audio text still crossed
the artwork's interior. `runtime.read_observation` already returned measured
UI bounds, but project tests could not assert containment. The internal Copilot
confirmed that neither its test contract nor the SDK exposed such an operation.
See `P31-SUPERVISED-TANK-PROGRESS.md` for the rejected game proposals.

## Delivered source behavior

`fitsUiContent` is an additive structured operator in existing `test.run`.
It resolves authored object/Component IDs, derives the selected snapshot's UI
projection, and reuses the observation service's bitmap-text measurement. It
checks the whole text block or button label against the panel's declared
fractional interior plus a minimum pixel margin at an explicit viewport.
No screenshot, GPU, window, provider, clock or game Component write is needed.

Missing/hidden/empty targets, invisible labels or unrelated transparent panels, made-up Component ID prefixes,
off-screen panels/text, unsupported rotation and insufficient margins fail.
Bad fields, viewport sizes, insets and unknown keys fail parsing. Diagnostics
return measured bounds, content bounds and all four margins with stable IDs.
The MCP descriptor publishes the exact format; details are in
`P31-RUNTIME-ASSERTIONS.md`.

This checks geometric containment, not art quality or resource validity. The
chosen interior fractions still require inspection against the real artwork;
arbitrary loose insets cannot substitute for visual acceptance. Resource checks,
real frames and P33 independent observation remain required.

## Verification

- The new real-runtime probe first failed against the old engine with
  `TEST_ASSERTION_INVALID`, proving that the operator was previously absent.
- `npm run check:p31:assertions` passes the original assertion gate plus the
  new UI gate, including two resolutions, multiline and long-line negatives,
  image panels, button labels, missing/hidden/transparent/empty targets,
  clipping, semantic identity checks and nine invalid-input cases.
- The compiled Engine MCP descriptor exposes the operator. Actual `test.run`
  succeeds for safe content, returns `isError` for overflow, and `test.result`
  retains the measured failure without rerunning.
- The shared P30 bitmap-text/real-frame bounds regression passes unchanged.
- Lint and typecheck pass after the new test harness was fully typed.

Latest narrow-gate evidence at this checkpoint:
`artifacts/verification-temp/aigame-ui-content-assertions-fD1JBx/results.json`;
this initial run retains 21 real-runtime
cases (expected negative results included), nine malformed authoring cases and
the compiled MCP pass/fail/read-result checks.

The extracted candidate also passes the complete probe using its own Electron
Node runtime, shipped script host and compiled MCP, without opening the owner
profile. Evidence: `artifacts/verification-temp/aigame-ui-content-assertions-NVtOTG/results.json`.
It records the three executable/bridge hashes; Engine MCP SHA-256 is
`d2ccc4a0b33bc5700b076e1eca8109d3b8c44fa15e1928813ca59f3c42582889`.
Candidate archive:
`AI-Game-Studio-0.3.0-preview.1-r5-ui-content-check-win-x64.zip`, SHA-256
`383d6b4575d0b4a263d1b2029167aa4f7bb45f1142a3e34c908bee6fb77bfd58`.
Its clean package and final install/upgrade/recovery gates pass. The full
`npm run check` finished with exit 0, including native GPU and real Electron
checks, before owner replacement.

## Remaining delivery boundary

The owner Studio was normally closed, backed up in full and upgraded to the
`383d6b45…` candidate. All 287 manifest content hashes match. Recoverable backup:
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-pre-ui-content-20260906-003851-win-x64`.
The actual owner installation then passed the entire assertion probe again:
`artifacts/verification-temp/aigame-ui-content-assertions-ykwkjx/results.json`.
The original Tank revision remained `f6c4388a…`; no game file or credential was
changed by installation. Studio reopened the same project and conversation.

The original Copilot must still author and execute the real Tank containment
tests through a reviewed ChangeSet; the supervisor must not insert them directly
into the game. Neither this engine gate nor a staging-copy result completes P31
or P33. `fitsUiContent` is an operator described by `test.run`, not a new tool or
project capability; unchanged MCP transport version is not evidence of absence.

## Follow-up: transparent button labels (2026-09-06)

The actual Copilot proposal added 76 containment assertions. Its isolated run
revealed two real overflows and a checker false positive: a visible button
label within its own hit area was rejected when its background alpha was zero.
An additional executable case reproduced this failure before the source fix.
The exception now requires exact object and Component identity and `ui:button`;
invisible labels, hidden buttons, undersized hit areas and unrelated transparent
containers still fail. Diagnostics name `button-hit-area` versus `panel-interior`;
neither proves click handling or decorative artwork quality.

The source and compiled-MCP probe passes 28 runtime cases and nine invalid
inputs, including positive and negative transparent-button MCP calls and durable
negative diagnostics. Evidence:
`artifacts/verification-temp/aigame-ui-content-assertions-aA0QOh/results.json`.
The original P31 executable-assertion gate and P30 actual rendered text-bounds
gate also pass. The new full `npm run check` then completed with exit 0, including
release, clean install, upgrade/recovery and native GPU gates. Candidate ZIP
SHA-256: `6c4d0ffc76b55e5d04d013bf0412f8dc8928836aea1d017d9bd9ddd2989f4d68`.
The candidate's actual runtime/MCP probe also passes:
`artifacts/verification-temp/aigame-ui-content-assertions-0UsqXg/results.json`.

Owner Studio was normally closed and upgraded with all 287 content hashes
verified. The prior installation is fully recoverable at
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-pre-button-content-20260906-010838-win-x64`.
The installed owner probe re-passed all 28 runtime cases, nine malformed inputs
and compiled MCP calls:
`artifacts/verification-temp/aigame-ui-content-assertions-VIxRbC/results.json`.
Installed MCP SHA-256: `156443312a4d966fe89b738d2258273e4c05c5e1bdbedcc19c0979745d2d8d48`;
script host: `d6db3b2eaa290f5703d0dc0b918947023e4bd2b6aaf42a671fa2ddeab1c3767d`.
No game project or credential was modified by the upgrade. Game application
and final layout/audio/normal-input/package/P33 acceptance remain separate gates.
