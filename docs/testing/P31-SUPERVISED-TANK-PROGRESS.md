# P31 supervised Tank checkpoint — 2026-09-05

This is the owner's existing project, not `examples/tank-arena` and not an
independent P33 participant run. Studio's internal Copilot authors the game;
the delegated supervisor reviews proposals/candidates and verifies evidence.

## Recorded-input delivery and HUD follow-up, 20:27 local

### End-state input defect: failing regression and reviewed repair

Two subsequent real victory attempts are retained as failed histories:
`input-log:130f91f5f5d8ccd7bb33b678fd4dc1e19e7a2cdd50203dd5a45b8f12dd8c9371`
and `input-log:e6903f2c2f2aa2e46d831b7162be6fb930657bfe75c45bd34b2aeebf7b4a7a01`,
both ending at Tick 2404. Neither is accepted as victory. After the player dies,
remaining fire pulses unexpectedly return to a menu-like state and start a new
Arena. Read-only inspection confirms that `scripts/behaviors/input-router.ts`
uses absence of the player object as its Menu discriminator; the first pulse
sets `ui.screen=menu` and the next loads Arena.

The supervisor sends this defect back through the original Studio Copilot
conversation. Copilot first applies test-only ChangeSet
`1ca91070-6cef-487a-ac1b-fe1b362f1c79`. Its failing report
`test-run:336a2228809d0e4c3aa279ff` proves both errors: Tick 1 returns `menu`
instead of retaining the playing UI beneath the result overlay; Tick 4 returns
`playing` instead of retaining the terminal match status `lost`.

At 20:49 local the supervisor reviews and approves the subsequent four-file
repair `8fa5cd5a-a3b7-4e5c-94de-1fb413e143a5`, proposal
`7c182b4f56aebbf3ff01918692968fa7c97161e02251573588937d3ff72ea44c`, approval
`2758d19435a7a610beb610afc43cfe552caa761ea3c8e7e8409a7090299fd55b`.
Copilot applies it after receiving the Studio handoff. Primary action now
distinguishes actual Menu from Arena by match-state presence, ignores terminal
Arena fire, and retains explicit R/ESC navigation. No life, enemy count,
cooldown, difficulty or actual Scene data changes. Production input-router SHA
is `9579a612dd05640cc88d60d239cfd02e17e6f194199174152e29ccfc0e624029`.

Three new reports / six assertions pass: lost SPACE
`423bc1b0df92c53db78f0f3a` (SHA
`9324f216394e87237d1ce0b3f5f801eb0037a3fc61e8288a99aa8534e19b2ad4`),
won SPACE `fa3df76ee4ca5d4dab023222` (SHA
`91d84c8ae42a164874b64d99f5f6f534d99c6f83917b10c76c8f06a2ef691a9a`),
and explicit R/ESC `ca2e5a4e7b87dbd3836b5523` (SHA
`ddb2291e23b44668c5d3b6c7e537168094e7378e3196830df459ee0b4ef74008`).
`node artifacts/r5-verify-terminal-regression.ts` independently verifies the
exact applied bytes, approved hashes and red-to-green evidence. No actual game
source is edited by the supervisor. These fixtures prove the bounded defect
repair, not real recorded victory. Prior recordings remain historical; final
all-state acceptance requires the repaired baseline's recordings and packages.

The supervisor subsequently enumerates the 17 current test definitions and
their latest post-repair reports: all complete with zero diagnostics and
**107 assertions**, not the 105 stated in Copilot's progress message. These
include real Menu start, audio-session transfer, UI flow, collision, combat and
VFX regressions. Test pass totals do not establish audible SFX or actual victory.

### Repaired-revision 977-Tick loss/terminal-fire/muted-restart recording

After applying documentation ChangeSet `ce878661-b5a4-4701-8659-10fab5c56436`
(proposal `c8e891609e90d047bf1b1c2139751bb1a0fedd8a1d690a490fdd9d40aba4bd66`,
approval `cbf74a1d21387001839faae285d9c3e18e7b374a932b4c09934dfbc3bf8fad59`),
Copilot records the current authored Menu/Arena, seed 20260905. Log
`input-log:8ea105657a2a2f8c03a77f356dddb17421274c7f1805c7b1554d5a25618046a6`
contains 113 consumed inputs and no direct commands/control injections, bound to
revision `a33717f43878300f9615bfe02b187a8c12589b7814e448547bf141c5e03b2e8a`.
The supervisor verifies its content and current-revision guard.

This actual attempt loses with three enemies remaining, then confirms terminal
SPACE at 966/968 does not restart, toggles mute at 970 and explicitly restarts
at 972. Final Tick 977 has HP 5, six enemies, score zero, PLAYING and MUTED.
Recorded/Studio/Player state hash is
`e9e04dc4bb854855bec6831ab782123b49a7e6139f7b20f86ea45da332344b04`.

- 960x540: Studio `e9a6b03547658cb5d45f7d07`, Player
  `0836397efe9f217ef166be89`, common PNG
  `86ba33ad8ea188c5571ace8792f2c8f1eb9829584a066d7cbd56931f3508eaa9`.
- 1280x720: Studio `47bca531f365446ed71f12c7`, Player
  `93519588b8f1eec4b45c452a`, common PNG
  `f9d3b34e132d33f0f91c03d0b2aba006460e33e710d7b0044b5d9a9ff2658582`.

`node artifacts/r5-verify-recorded-restart.ts` passes and preserves evidence in
`artifacts/r5-restart-977-review-lhJ285`. The 177 final-batch native snapshots
include lost after both terminal shots, ready at 972 and playing at 973;
master-bus `set-muted=true` is emitted at both 970 and 972. Native result SHA is
`989fcc01427c760ee5900a8f31e730d311337dc2ca883a25cb30555d34bcbcdb`.
The supervisor views the actual 960x540 Player frame and checks both PNG hashes.
Live Studio intermediate snapshots had been overwritten by the next session
before preservation: this evidence does not claim a retained 177-snapshot
cross-host comparison. Victory, final ZIPs, audible SFX and P33 remain open.

### Repaired-revision 1175-Tick actual victory recording

Copilot next reaches actual victory from authored Menu/Arena through 194 normal
consumed inputs, seed 20260905, with no direct commands or control injection.
It exports `input-log:e794c826e9db166318ce9e4579eb78e305d387bee8657e0e44ba56d740a9b314`
on the same `a33717f4…` revision. Final Tick 1175 has zero enemies, score 600,
player HP 2 and won; the first won snapshot is Tick 1154. The recorded and both
host state hashes are
`b0c8167fcb1bfcfe06488a2e5c78321b67c0974987361adcfaf6067ddcff480e`.

- 960x540: Studio `9fae54b024c00dfd26e8fc2e`, Player
  `58158e4f9e610a65dbfa35ca`, common PNG
  `6152e92be3d6405b4f1ecc66566946c8d7bb964cd2c861c8f6d029b00cab21e7`.
- 1280x720: Studio `7b74d6f9553960f6426d5896`, Player
  `b3f207a3681e29915cad90eb`, common PNG
  `91ae1b65180d1c00f866bf5ddc0cca4a9777a20e329c20c0157a12fe7d3b0a95`.

The supervisor preserves Studio's actual 175 final-batch snapshots before the
next session, then `node artifacts/r5-verify-victory.ts` independently compares
all 175 native Player snapshot hashes, including playing→won, and validates
both observations and PNG contents. Evidence is in
`artifacts/r5-actual-win-1175-GTG90Z`; raw Studio/Player SHA-256 values are
`49f7f495bbd5b613cb046ad8f529d80e3bd1d844c09f2cdedb24011ac44efbe7` and
`d791999f424e14da8bee9d21af7c7814030afecd21d535b33dd3c933b431d93a`.
The supervisor views the real 960x540 Player result panel: trophy, final score,
restart/menu controls and HUD are visible. This closes the recorded actual
victory/Player gap, not final audio, shipped-ZIP replay or independent P33.

### Current Development and Release ZIP replay

Copilot creates Development build `build:fbfb80969b37472004e8b366` and Release
build `build:452d9df67f8fcbc6fd0616fc` (package
`package:77136a11cbaf5233669ee00e`) from revision `a33717f4…` at 21:12 local.
The supervisor extracts the actual ZIPs into isolated verification directories,
checks their manifests and every listed content hash, then runs each extracted
native Player against both current recordings. No Studio snapshot is injected:
each Player advances its own state in batches of at most 200 Ticks.

| Profile     | Content files, excluding manifest | ZIP SHA-256                                                        |
| ----------- | --------------------------------- | ------------------------------------------------------------------ |
| Development | 47                                | `3b80cfeda7b45c90146b42fe0ec7ffffd97f879c8a11a4d77a6fe6b65b958ea6` |
| Release     | 16                                | `13011e00b954382c22cb2dde98f60ab148209c9aba4b96991955256f709f4a46` |

Both packages contain all six Prefab definitions and nine hash-verified formal
images. Both reach the exact recorded 1175-Tick victory and 977-Tick muted-
restart state hashes above; all eight rendered frames match the corresponding
960x540/1280x720 Studio observations byte-for-byte. The supervisor additionally
views Release victory at 1280x720 and muted restart at 960x540.
`node artifacts/r5-verify-recorded-packages.ts` passes with evidence in
`artifacts/r5-recorded-package-review-u2B0Cp/summary.json`. Build-report hashes
are `0fd585f292898a3ebbf75d2ffffc86511ba7043bc528ebb63e23f30080282725`
and `6422f4bb3c7d2dd55eec9d0c948e72ab9ee935bd7b59d31f6bc7c8036f3b1041`.

The native runs have no Node, Codex or provider environment. Release excludes
project tests, agent instructions and local provider state. This is not an
OS-level network isolation test, audible SFX review or independent P33 play.
The four/eight audio events in the recordings are bus-control evidence, not
formal sound clips. These archives establish replay evidence, not windowed
play: subsequent ordinary launch crashes with GPU depth-attachment mismatch,
and physical UI keys are incomplete. See `P30-NATIVE-PLAYER-WINDOW.md`.
Repaired replacement packages are required, as are formal audio and a clean
0.4.0 Studio candidate.

### Actual 1408-Tick loss/restart recording (previous revision)

Copilot subsequently records authored Menu → normal Enter/start → natural
defeat → normal R/restart. Its durable log is
`input-log:f3ac6b9a5d80a3e1cf9b7058102399f32af60672e97ed0bf9f9ac4577290d69a`;
seed is 20260905, input events are start at Tick 1/release 2 and restart at
1405/release 1406, with no direct commands or simulation-control injection.
Final Tick 1408 restores HP 5/5, six enemies, score 0 and PLAYING. The log's
recorded revision/content integrity is independently read and verified.

At 960x540, actual Studio `611f4a17d1082f1c7510cf87` and Player
`4f8119f61eb27830f420955d` both have recorded state hash
`4b539f05079eade2248ecba182f9b57c5669a5f2b5f4310b95f149d62aa78511`
and PNG hash `4b4f5366fa710fd51bb3772ceb78cf7fb0b658819eb3f2644118042fc7fb6448`.
At 1280x720, Studio `4cdd97f853ff44cd4ab5676d` and Player
`97651bbe46429e5a83e75214` share that state and PNG
`b5a4012fa274ad9a224efd34f72fb2a8612cdf604c57479a096642ea53253205`.
The supervisor views the latter native Player image.

The supervisor also preserves both hosts' actual final eight snapshots under
`artifacts/r5-actual-restart-log-1408-20260905` and executes
`node artifacts/r5-verify-restart-checkpoint.ts`. All eight state hashes match,
including lost at snapshot Tick 1404, fresh ready at 1405 and playing at 1406.
This rules out accepting only a coincidentally equal post-reset final state.
Raw Studio/Player result hashes are respectively
`9ecc12e1ff89d979a49400a9df004482171fcad8bb575332377eb35ddba1ede7` and
`4e947d78b62bcbac4409a285738a297c4411890631fa9372964124f98b011255`.
Tick 1404 is an observed defeat checkpoint, not a claim that death first
occurs then. Actual recorded victory, final packages/audio and independent
P33 acceptance remain open.

### Applied HUD inset and short recorded UI sequence

Internal Copilot receives and acknowledges the installed `19410ce9…` package.
It authors HUD ChangeSet `4e06d838-ebab-426c-9810-0555aee6c871`, proposal
`ca3765d154fa40cd616af4476ab5fbc3edda605a0bf4da094a498f749fb2e24d`.
The supervisor reviews both files and approves with content hash
`bdf2e29a2ff4e688c3b567f5e033381a4e73243d05e6d273344c9ba2195ba204`;
Copilot applies it. The only Scene change moves the HUD help anchor from
`0.96` to `0.92`. All existing assertions remain and one anchor assertion is
added. Arena source now hashes to
`e28cebf7ccc6c9065d44a2ca755f7806fb81665b504df966d4be5eff9198db93`.

Four affected test reports complete without diagnostics: UI safety
`80a9b7a801ff28399c5640e8` (SHA
`864bdf9e7fa2ffe10869825dee0ac95b58121916dfc35381a7bd3121058a50ca`),
UI flow `652c4a0aaf72c133be2d8957` (SHA
`d37cfc58cda04dc9406e8cf864111f14aa03555335d74533550d02a18653f09d`),
result loss `c2c7560012ad2bdfb41377c5` (SHA
`eacd7af56f37566bf29a425ea7ce1fc7f65b8d3ee54602c208627b491db9b138`),
and menu-muted `2f83c7755b853720b3b0e73d` (SHA
`4e6319dbda20023afa07d2e5d39f941a5c73fde1cc9d8ff7c37e1615fbf8cab7`).
Their current definitions contain 45 retained/added executable assertions.

The supervisor inspects actual normal-play `e054b603a276f1fa4465c208`, HELP
`55c00c5d673a8b93e2989cfe` (both 960x540) and pause
`1a4dc2e2232c3cc479bcf8d1` (1280x720): bottom hints sit above the metal border.
This closes that bounded visual defect, not all-state/audio acceptance.

Copilot exports the actual ten-Tick play→HELP→return→pause input history as
`input-log:ad587f90ac93cdf6643b4f5a6f39004288d7ef894c08f9daba90d1bfc98ba820`.
Its recorded hash `787106aab62097d0e47da5c7aafe999f31b53717f620788a01457dae02cd21fe`
matches both independently executed Player results. Studio/Player observations
`9dcfcdfd0af644e11a69945b` / `234672aafc4d8ddfcb6b7d3c` share the 960x540 PNG
hash `23739edb751740291f24a5140011976119e211e0776dd7d3230ac5b35d32477f`;
`f47191c030177c4109bbc85c` / `2eabf6d1211236cb6758ca35` share the 1280x720 PNG
hash `54071d203190b1d5b4442b6a9d6e26c5375e6686dc88808baa42a1a1a7d6349e`.
Both pairs reference the same recorded log. This proves actual short recorded
UI replay, not the still-required long win/loss/restart replay.

## Verified final-layout regression, 19:28 local (historical)

### Later inset patch, 20:07 local

The supervisor reviews and approves Copilot's three-file
`ae86d59f-9adc-4970-a6c1-2d1d30e91a04`, proposal
`d2334990f12bd924821dac89651a17936d429f42e5cd627859b890fb78ea5bde`,
approval `e093e643480b18158980e95c41e0146c0899ccedc7518d643ee66067760f63c1`.
Copilot applies it. Only HELP/AUDIO body anchor and result-button anchor/size
change; stable IDs/actions/gameplay are preserved. Tests retain all behavior
assertions, update two intentional layout values and add four inset checks.
Current UI source SHA:
`2c090ec7bbfd2768464f6a9d0ac40762eed0cd513d9af01b600cf007c772f834`.

Four affected actual tests / 44 assertions pass with zero diagnostics:

| Test              | Report ID                  | Report SHA-256                                                     |
| ----------------- | -------------------------- | ------------------------------------------------------------------ |
| UI flow (17)      | `ed88b468d88571ab022a5379` | `828b31f592296b7a5f4e5d6187a11c55737fc70797f29ff27165f15d41daef3f` |
| Result loss (10)  | `14ea1244d362fff09d39517b` | `cf2fd5ddb4cbaa0afe26f731fd7d8f724e7c8e108f1c8b95c847c04dc3ccec53` |
| Render safety (7) | `5c830eb037a5edf1c87a45a7` | `018cfffa5e66ad28af0f61e02ff985ec55cf7cc99930f61fa924c60e45aca2e7` |
| Menu muted (10)   | `7141f8d607e1dd9e8335be6b` | `9dacdef2eda35ac34f59185c12b2cdf7f519b9a892071850c5b8070e70a4adee` |

The supervisor visually checks actual HELP 960x540 observation
`56d1637c852d4ef8e05804ae`, PNG
`81d16c35413890a05403693c24b2a7cc4bf4d9353bea7c16ecdeaf27b59efe0b`:
the second text line is inside the panel. The 1280x720 frame
`827603f64be476d6675972f2` has PNG
`a0a3268592b277b59b80f05fb191470668be9c55952d2f74c39839eaa42d265a`.
Both state hashes are
`87597f6cc198e3bc96e7adc7ca770bd45e778d18499b98ac7e2988ab83b7df88`.
Actual loss is reached at Tick 1202 and captured at stable Tick 1602. The
supervisor views 960x540 observation `7448d904ba970794db3af907`, PNG
`535d6ef003eb46c399f2a69be7600ac64a55adfc8858e6011fe28729848d582c`:
the two result buttons now fit inside the green panel. Its 1280x720 counterpart
is `47db712937f7b4fe9dd66231`, PNG
`35cea660c3352272fe78167f855f11415cd11eb9af5ff90ce4df38d8759ca70c`.
Bottom HUD hints still overlap the decorative border during normal play/HELP.
The earlier 14-test/96-assertion full run below
is historical, not a claim that all 14 were rerun on this newer patch.

### Installed restart repair and new Player finding

Studio `8798eef9…` passes complete regression/P30/installed gates and all 287
content hashes. It is installed with the prior tree backed up; original Copilot
receives and acknowledges the handoff. Actual loss→restart at Tick 1616 now
restores HP 5/5, six enemies and score 0 while retaining muted=true, volume=80.
The supervisor inspects actual state and frame; see
`P21-SCENE-TRANSFER-EVIDENCE.md` for hashes. HELP/result inset work remains open.
Bottom HUD action labels also overlap the decorative border in the restart
frame; all-state visual acceptance is not signed.

The new recorded-input/Player-batch gate exposes a separate engine defect:
packaged Player lacks Prefab definitions and fails on the first shell at Tick 2
(`SCRIPT_PREFAB_NOT_FOUND`). Reachability metadata alone is insufficient.
Source now includes reachable definitions in packages and all Player paths.
The 551-Tick MCP-recorded combat replay passes state/frame/resource/audio parity
after repair. Complete `npm run check`, full P30, TypeScript, lint and format
checks pass. The `19410ce9…` input-log package subsequently replaces the
canonical installation; all 287 installed content hashes match its manifest.
The prior `8798eef9…` tree remains in a recoverable, separately named backup.
Actual Tank still needs newly recorded win/loss/restart Player comparisons;
old pre-upgrade sessions cannot acquire a trustworthy input log retrospectively.

### Subsequent bounded runtime and package review

At 19:43, actual Copilot reaches victory through normal movement, aim and
cooldown-respecting fire, not a fixture or gameplay edit. The same session at
Tick 2340 has `won`, zero enemies, score 600 and player HP 2/5. Actual 960x540
observation `e3a6d484c7fba023f95b4d2e` has state hash
`f7e873b04f9f208ab7444676d3e05e41d4b5a94f0fa82a8220cab0c67316644f`
and PNG `ef82fd159939260f6b58897d7f3565b98c8bbd8255b8eab9b8ee5a6f0bd49107`.
The supervisor inspects the real trophy/result/impact frame. This establishes
actual victory, not its still-pending complete replay/Player acceptance.

The subsequent `runtime.compare_player` attempt with only a checkpoint label
starts fresh Menu runs rather than replaying the accumulated paused-session
input history. It is explicitly not accepted as victory parity. The bridge
requires a reproducible request, while accumulated `runtime.input` history
currently lacks a public export/Player-batch path. This remains a new engine
delivery gap; matching menu frames cannot close the actual win/loss comparison.

On installed Studio `ce2b0287…`, the actual Copilot discovers and uses
`runtime.advance_ticks` against session `session:d5b9cb2c942848c49ade72ae7429cc4f`,
generation 1. It retains paused state across 200-Tick requests. Tick 860 still
has HP 1/5, so its misleading checkpoint name is explicitly not accepted as loss.
At Tick 960, actual frame `b867902e04fcb788b2414793`, PNG
`1e23ae02c2b3770147db44ae23ac575434690350674db53083d1d94a34bcd9bf`,
shows HP 0/5, DEFEAT and the formal result panel. State hash:
`f5c7cf7735bd051dbf6d23def9cf7d9babed3b252efdf6d38f528fa022f9e324`.
The supervisor visually verifies the image, but does not sign all-state UI.
The attempted restart at Tick 964 (`f1baffeaf5bd461f40ea242c`) still shows
DEFEAT. Copilot correctly detects the failure and confirms queued/applied
same-Scene loading without restoration of the player; it does not alter game
logic to hide the engine defect. See `P21-SCENE-TRANSFER-EVIDENCE.md`.

Short-flow Studio/Player pairs have equal state and PNG hashes. The supervisor
inspects Player pause `247a52cfcee0dbdec467ee8b` and HELP
`e6fe5ef46ef73367f05d758c`. The latter's SPACE/FIRE line touches the decorative
lower bevel, so HELP layout remains an actionable visual issue despite empty
structured diagnostics and matching hosts.

Copilot's current Development and Release packages are independently copied
for read-only supervision in `artifacts/r5-package-review-OHtwiY`:

| Profile     | ZIP SHA-256                                                        | Verified content files | Manifest image hashes |
| ----------- | ------------------------------------------------------------------ | ---------------------: | --------------------: |
| Development | `e00f8855b1e2c25f0e1975e25a8e93c5591aa8f344d4cd1445ef58467a263d13` |                     43 |                     9 |
| Release     | `618abcdebc5348394554a13ca707c454aa5f516269a4fd322272e279bd896e28` |                     16 |                     9 |

Both run `--verify` successfully with only Windows runtime paths/environment,
without Node, Codex or provider credentials. The verifier executes three menu
Ticks and validates its two rendered images; this is not nine-image visual
coverage. All nine imported images are separately content-hash verified. Native
reports have `scriptStatus: completed`, no external dependencies and zero audio
clips; formal SFX is genuinely absent. All nine packaged inline provenance
records include provider/model/candidate/Skill/Brief hashes, license and
restrictions, including the supervised-not-independent review limitation.
These are startup/content checks, not final gameplay, offline-network isolation,
signed release or independent P33 acceptance. Later game/engine changes require
fresh package verification. The review helper initially used the wrong metadata
field and overestimated the entry-only renderer count; those probe assumptions
were corrected from actual schema/implementation before this result was recorded.

### Applied layout and regression evidence

The title repair `b0ff1910…` was applied and its 14 flow assertions passed.
Actual pause frames still put the title against the decorative bevel, so
Copilot proposed and applied reviewed `e9d5bdc2-1575-4880-84d7-9d435332e87f`:
proposal `44e5e0dab6a0511e003cf8dfb9dc62dc1ec8433da8ef8f473f197c5cc62d56f7`,
approval `4d75e1a05588a96d2fa82241e54aa80866a955cd49db48c1a75e42f378a82ca3`.
It moves the non-result title anchor to 0.455, uses a 30-pixel title and retains
all original assertions while adding the font-size check (15 flow assertions).
The supervisor inspected actual 960x540 pause frame `0bce36aec0be4db48725572a`,
PNG `d5fabb1ed6bf366b1980901f9bffe0acaf50d29d17641764013519f0f5e10dad`:
the title fits inside the green pane. This is a bounded layout review, not
all-state or independent visual acceptance.

Actual Arena loss frame `98164344a88d0065ee749f94`, PNG
`a83ef97a0e4547a986d47b792abc4a69731eccb4e88e59c5628e8305425dcd4d`,
exposed the same title/button bevel collision. Copilot applied reviewed
`fd25281b-968c-4036-8a62-de838ff65ca8`, proposal
`4fa43ee56d7606562092569bc5a1848798c96d457bf6ca9ab8d49462b51eb3f9`, approval
`8f494639c604dd1f7528d34c924565dbf5be46cbdb3bd508c5d083329c7472f6`.
Only result title/button anchors and their three expected layout values change;
all eight loss assertions remain. UI source now hashes to
`0f8078f5f8ef17552025c65ac6412f351226b7557d03746b8f69b82e8e22564a`.

The subsequent actual-project full test run completes all 14 files and 96
assertions with no diagnostics. The supervisor verified these persisted
reports, not just Copilot's summary. This is the post-layout regression;
formal SFX, actual after-frames, full Arena victory, Player parity and independent
package acceptance are still required.

| Test                    | Report                     | Assertions | Report SHA-256                                                     |
| ----------------------- | -------------------------- | ---------: | ------------------------------------------------------------------ |
| Audio state persistence | `9dded0b1e9a37077a714520a` |         12 | `438600200fed2cd3c60719f6e2355c53620178e26d08827b543f574172066f7e` |
| Collider offsets        | `16168126a76cf16e1a5099ed` |          8 | `5870285ddb32e5fa0b7b08e07b76316eef5caec5caa394b29a04b730c6bce957` |
| Combat loss             | `9a9717c730d1c66db498c514` |          2 | `7095aee8ce5fa0d7bfb65d48bc7f0e561849148a1be46060b66fcd041b2a629b` |
| Combat win              | `f4f218fdcbfa2618e8edbcd6` |          3 | `a7680f2f4575d1f440e1a1621aaebfc71903186eb7326fecdeaafef370a1803f` |
| Friendly fire           | `9f8f1280e0ca1987a64e3aaf` |          3 | `80a6f419b93518a862e7e0482201bf07d89a71073c776934c19057122c376a50` |
| Command routing         | `b6994909440ae2db2c974538` |          4 | `a059d8f26f475e2e043db51c4716b79494fc536601596df7decae2a4ffdaa201` |
| Smoke                   | `a66c3851dbc1c01f420fb5c8` |          8 | `a6a6d666e89a79b2824aa916ae31561deea3dd429fd399ef3f6f0dc95bb0492e` |
| UI flow                 | `959947e7b5d62f2251fa5fc4` |         15 | `48a085700088167c0d3f9bf8261c10844011fd0a0ffc4c667b62c68b2a1192e8` |
| UI layout               | `9ee20d2e62dd37d7c53cbc9e` |          6 | `4a937ecb63e0653bdcb3c3767632e9df84c58f21ae403736f550cef06d1a8fb9` |
| Menu muted/Help         | `211a3bf7b5c4a41c8711d259` |         10 | `eac3cb7627b777a23964a8479978faccbf6f65df8a6595173b944e73deb58f5e` |
| Result loss             | `374585aaddbf2ef13a4d430e` |          8 | `8baeb9800b97d81859565107bd6d9885729c380583ff79911535174496946da0` |
| UI safety               | `e129eb24db18fb7d98a0c9dd` |          7 | `008d25c9674f28626d1790385968ba7779c650e5868d1122c9a4a889583ffe8d` |
| VFX impact              | `77bad4404ac77532264ba0e9` |          4 | `7e45b40672828f8b60d315cd38e20782ed2def68062b5f8fe7c0cbc828ff3b81` |
| VFX lifecycle           | `f4ea57327de573a260e4c645` |          6 | `9ed226760dbb82cdbe58295bfa8612ed05d7154a4b4592f3d1ed935b2a9a413f` |

Documentation-only proposal `090064db-e820-4885-aeb6-9352d48d0b11`, hash
`234161218264b9ed39b33de6e02df3590c72e0c3cbd8c3887921d163ea0336dc`,
is rejected without application: it retains obsolete per-call approval/CNY 1
language and makes known pricing mandatory despite the owner's scoped
unknown-price authorization. Missing credentials remain a real blocker;
unknown cost must be disclosed but must not be confused with missing authority.
The default policy for unrelated jobs remains unchanged.

Replacement documentation proposal `741aef42-19c7-482e-b9c0-3efe2c402887`, hash
`5c882d5099f7bdc2d1117630cf66679caf430f0104ea3dd42b346c4667a3e52b`,
corrects the scoped authorization wording and records the production-credential,
same-Scene restart and batched Player-parity gaps. It is reviewed and approved
with content hash `8d9382f427715a3a82e6df900aa5d80da47d11f8b7a21a7550cbf51a7fc596cc`.
Actual Copilot application is verified; the two resulting file hashes are
`7b098a210345ff5f6ba8651cc571bb5efa2b433371e8cc32e2312f39caf3c6c2` and
`d83b0dbb61fea0cb60e11db438e767bb707f743e61fb630d8aeb3b473b6efcde`.
No gameplay or test expectation is changed by this document-only proposal.

## Verified post-upgrade regression, 19:02 local

Internal Copilot reran all 14 current `.test.json` files in the actual project
on the newly installed host. The supervisor checked each persisted report:
all complete without diagnostics, with 94 executable assertions in the current
test definitions. The longest test is 140 Ticks. This is a dated regression
baseline, not a final whole-game or sound-asset acceptance result.

| Test                    | Report                     | Assertions | Report SHA-256                                                     |
| ----------------------- | -------------------------- | ---------: | ------------------------------------------------------------------ |
| Audio state persistence | `1a4660dd9912290633ee4080` |         12 | `c7321a27c04984e67871dc3cfd5531fe89de0582e706a8c42f3145696a59114d` |
| Collider offsets        | `d51b3bb2ed653c1e56f80efd` |          8 | `c20805b0d5eb099eebef01c686044b24c2594c4905994aadf389730a9a2223a0` |
| Combat loss             | `c5469787af2554a89057a5f8` |          2 | `0092499e0596524a620339d26541e5c03c4dbf7061424439f1e97bc25337dcc9` |
| Combat win              | `9e7aa2dd3f9a63c5813ba092` |          3 | `643f82535e31db324b64bc4249757cefd7a195a364a129563b122f8f382dfba4` |
| Friendly fire           | `2b96175c31b6862623a948e6` |          3 | `3a22a76ac18ab99da252782d03446237082212ada31f111af8ef924a49208b2c` |
| Command routing         | `63e3f506000e07a8b650d004` |          4 | `69b1a0e36513caa4bc653e2d9ca3bae9c6ef8b26205eba859b288483511ca9ea` |
| Smoke                   | `3e941df7873d83965589b113` |          8 | `d0ec5a310c223216d45b4904bca8e10c2d17d671018606ff1a75b87651220d78` |
| UI flow                 | `fc01baf8496bb2abb4be45d7` |         13 | `17a9ebdb1841d67a0c8e1608d960d22c4d894d59d3b3ee4b14ecc6cb2f815b9d` |
| UI layout               | `e1a139acfb96c0f113c23697` |          6 | `49afa8d94ab3435531078eb598f1b45d0aac70bd2f71f2034f970754ec8ce6ac` |
| Menu muted/Help         | `5b7d66a6adfdd1aec4029785` |         10 | `9f046fedd4b7f118c2e7ac88e975f7bf7ddd1a68b00b63aa3ad8ba511d1854d2` |
| Result loss             | `0bc5cdbf9e587cb6d434f328` |          8 | `f69ccffbdbddd8fbc8fc8fa00ee8d89a4c771fbe4c52a5aed5d6294a5987841c` |
| UI safety               | `43ab37a8ea93c99ffc0f9200` |          7 | `62a85eaf85111370a2e54d4a89080acd219f6fce8206352a2826048c6632d1ca` |
| VFX impact              | `2c866b52b8b609528703d0ab` |          4 | `fb286c12d5994269333ec181ccf558816b059f6d938ccbb81f5c79abd2e4fa2f` |
| VFX lifecycle           | `b1d79627adaafa548006a5d2` |          6 | `6118034f95e363e73df84118a41aee356a3eda2d7c3278aa092440980fc57ea0` |

Actual menu frame `bd2178403088407647b23d6a` (PNG
`c9fbdab517209961bbbab37c0cf537ae2786cce8b207f7a5f3752282f8da9062`)
and pause `a4de2aa3f1928afa9bc0bf63` (PNG
`205010920f5c3d6186ae6f28bc19a1dc839831bd0d55fc2581b300c712f78abe`)
are inspected by the supervisor. Menu controls are visible, but the Pause title
touches the decorative panel border. Copilot independently proposes its repair
`b0ff1910-319b-4883-b704-3d52f2f3c55e`, proposal
`1b716199fa2367d567fe904fb13875d7c33566870816dffface769a1a585b232`.
The supervisor approves it with content hash
`db3cc722144482697799c4b07b918cab74d9083d2d83c31e2e1f6e5e2cabc387`:
one title anchor changes; all 13 old flow assertions remain and one is added.
Application, targeted rerun and after-frame inspection are separately required.
The loss fixture image `b5a5987a565a369c6c8d66e8` is explicitly not the actual
Arena loss-state visual result.

## Latest supervised follow-up, 18:40 local

The supervisor rejected proposal `e762c710…` before application because two old
UI assertions had not been migrated consistently. Internal Copilot submitted
replacement `8aac3679-be18-4798-9eab-306468a344f0` and applied it after review:
proposal `d55819e0d11cb95d3a57d6c025965b99c2a3dbb50874f67703a8958a38f787c8`,
approval `12daa950a02d677ce026047ffbd18541fd5c3c013ba2d6ac315ee8f255843fe9`.
It shows real muted state, removes unsupported separators, preserves icon
ratios, and separates pause buttons. Actual Help imagery still touched the
decorative panel edge, so the visual task remained open.

Copilot then applied reviewed `2c2354aa-528a-41bf-8a33-4f1c02d4509d`, proposal
`2179cf7409705eb7809d522a08680a5d248d3983aa1011d93f881bbc6fba2a47`, approval
`f4035ba714f1d336e19871b17f5079267afa2d9373d0c8c39594c894c1c74d3a`.
This reduces DEPLOY/BACK label size, moves HUD labels clear of their badges,
and retains the old assertions while extending the muted/Help test. The
supervisor inspected actual 960x540 play frame `031f416fba2e3b9a9cf522fb`, PNG
`f76a8466039fb67b6b1e71b8697152a6cc1c778a7426d91f91e92bc4dc9e1407`:
the formal tank/wall/ground images render and top HUD labels no longer overlap
their emblems. This partial frame review does not accept all UI/game states.

The next two-file typography proposal `f57f163b-cf27-402a-80a7-ba7b6cc787c4`
is reviewed and approved, proposal
`ff81cefdb65babefe0281f7bbdb5e5d4ba3de2957f6c7a07826883eb9fdd5b61`, approval
`039c358d0af7a759943f032e9e260f1a8973025dcf0fe6703cd05083963167a8`.
It adds Help/muted font-size checks and retains all previous checks. Application
and three post-apply reports are verified at 18:46 local:

| Test             | Report                     | Assertions | Report SHA-256                                                     |
| ---------------- | -------------------------- | ---------: | ------------------------------------------------------------------ |
| Menu muted/Help  | `484df8d9af933ea973843c7a` |         10 | `24747cad4eadbbb84988ed5022244a27f889c59a30e5b4a3c29b9f765e1d4be8` |
| UI render safety | `52dde9d8b1feb4984611415f` |          7 | `908e2a7ef133e69f633cd50a9d61f0db3cd52bb4a1218b06862a55516db17c6b` |
| UI flow          | `c8dbf3daa3a8ed7a90359d93` |         13 | `e5ce93ec98113eac4fb8666bebf902ba547a605760b86a7ec117bb373dcfb608` |

All three complete without diagnostics. The supervisor inspected 960x540 Help
`42ea9239b595cf0feecd3323` (PNG `45008aa1ee4e604117e38ae327e39982bcb515f2ed89a4e4a99d68dcdb407094`)
and muted settings `f0a75e350db5b2c8d067d574` (PNG `a7ea2ab09a97429fab41c2131f6f34fc0f977b09a608fa1396735abce497207b`).
Copy and BACK now fit their outer panel/button bounds; text sits close to the
decorative bevel, so these are bounded layout checks, not general visual polish
or formal audio acceptance. No repeat image-generation request was made.

Actual loss frame `cf3089985929e8d9962e3ca8`, PNG
`c3a76dd5b5e830139df02650b1d35914475990bc52aa3340fa048aac2326e92e`,
still shows a title on the panel edge, duplicated action copy and overlapping
result buttons. Copilot's targeted proposal
`414697f8-598e-4bc6-9f76-ddbe600b71eb` is reviewed and approved, proposal
`cb6349c427056f9d4b36c08e48ae2b9cc436763d1f6ae3f43c85f2b63b96347d`, approval
`26a1d3bc306d1af2d6a8aa9438ce67e8af698c8d975dfa71baac01992332aaaa`.
It changes only UI layout/copy plus a new eight-assertion loss fixture; existing
tests remain intact. Application is verified, but new test report
`f539d803718122643e1f360f` fails: the reduced fixture omits
`tank:object/arena/overlay-pause-icon`, which the UI system still toggles. The
old UI flow/safety/menu tests pass; the new failure is not counted as success.
Copilot proposes only the missing fixture UI objects in
`a2aadc5b-3f56-4be3-91cb-a1a1b3b042ce`, approved with proposal
`2f7c4dae9319e7435cac03506740c3f88f652f07a430507b5edd91776724c246` and approval
`fd199d4f85f403066978834d13d6c39cca918681db0cc19a56ad6d0242b01f1a`.
It does not delete assertions or change gameplay. Application is verified;
report `480562f802c425daafbea8fa` completes the eight-assertion test without
diagnostics, SHA-256
`35e2b366ea532573126e69aca3b4f4283b5a1f396b750ec8a2e4038f7c4cd5b8`.
This fixture result is not actual loss/win visual acceptance. Final
whole-project and standalone-game acceptance remain open.

The actual credential-summary check still contains only the existing OpenAI and
Bailian profiles, with no secret reads. The configured Bailian audio adapter is
text-to-speech, consistent with its [official TTS documentation](https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide).
This is not proof of standalone firing/explosion sound-effect support. No
additional account, credential or adapter was silently substituted, and no
placeholder tone or spoken imitation is accepted as formal SFX.

The old host's approximately 257-Tick long-checkpoint failure was isolated to
debug-history heap pressure, not proved to be a gameplay defect. The root
repaired the engine, not the game. All 260 snapshot records from an actual-project
copy match the old host, and the original 64 MiB project budget now succeeds.
See `P30-DEBUG-HOST-PERFORMANCE.md`. Full and installed tests now pass for
Studio ZIP `2d68aba9…`. At 19:00 local its 287 verified content files replaced
the canonical package, with the old package retained as a recoverable backup.
The actual Tank project, conversation and Goal reopened. The supervisor sent
the new-host diagnosis and remaining regression/checkpoint/package requirements
through Studio's Copilot composer; no game file was edited by the supervisor.
Actual post-handoff game evidence is still required. Formal SFX and independent
human gates remain open; delegated engineering supervision cannot close them.

## UI migration checkpoint, 18:15 local

Internal Copilot applied reviewed ChangeSet
`59f033d6-e7fd-447f-aeb9-7e07869519dc`, proposal
`0355fba3bcbe4c596640fd6e4b76a94d3527cac7f41ae214ddbfcfd41fd283c7`,
approval content hash
`777fc40035c3119d266a64a2953b4ce7ddfd4884f87da251693beba3992ff30a`.
The nine imported images are now wired, including real UI Components rather
than decorative sprites behind old world-space labels. Old assertion IDs are
retained, with wording/anchor expectations migrated and eight additional checks.
The six-check menu layout report `afa19b913d7f0a126b276408` passes with zero
diagnostics, SHA `3f5eb630b393b3a9be1ff1deaa9df0dd3455c57f7072f544f0e3e90d99df8bd6`.
The 13-check UI-flow rerun `ebdee1312f33583372095af0` also passes, SHA
`ecec6fdc7d4235886a476211fcfb01e8cf7f2a258bdf6ddb110779dfe3c92e15`.

This is not visual completion: the supervisor viewed actual 960x540 frame
`a57d1f74f5f6ff767fc21b38`, SHA
`5f050591759e5dddfbc6f4f7c8774c0230a0ede5992d377521d11fa7144884fe`,
and found overlapping pause-button labels and unsupported separator glyphs.
The muted-menu frame `2883cc407323d9339787b994` still shows volume without muted
state and spills settings text below its panel. The internal Copilot is checking
and repairing these actual frames; zero structured diagnostics did not close UI.

The missing `author-ui` Skill is reproduced by a failing P19 executable check
and added to the engine's base template. The same check now reads it from Empty,
Empty 2D and Empty 3D projects, authors UI through an approved capability/Scene
ChangeSet, and verifies exact manifest/Scene rollback. The Skill validator and
P19 gate pass. This fixes new-template delivery, not an automatic change to this
existing Tank project's Skills or a declaration of independent P33 acceptance.

- Project: `<tank-project>`
- Conversation: `01a065c3-df50-7d11-87f5-d5c2f60cab69`
- Completion Run: `completion-run:04cbbf5e6852ed06bc7a9cc6`
- Checkpoint: nine images imported and wired; UI visual refinement is ongoing. VFX lifecycle and Scene
  audio-state transfer verified; menu/UI presentation remains in progress.

## Four real imported images

Each job made one provider attempt and returned two PNG candidates. Actual
cost is unknown, not zero. Selection and import retain their original review
decisions; a stale import proposal was re-proposed without another paid call.

| Resource          | Job ID                                 | Selected candidate                     | Imported SHA-256                                                   |
| ----------------- | -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Player            | `2e3558e7-73be-4e5d-ae61-4ba70bf24375` | `d98fbab2-279e-4658-9c4f-4cabd4d74d03` | `0475f10ec66895eb5189f15a605a1e0ffd1f449cebc09818f59f530121494b09` |
| Enemy             | `35052cbd-8f3a-4fc6-853b-532d109d7309` | `12393222-487a-491e-9f24-d4aa2825c84a` | `e7af7deaa8096f65963e5bd009e55dc4d57549de066733054781f3d0ad1042cb` |
| Projectile        | `4a7ec612-4d6a-4045-9591-7104f5fabea8` | `88e889e0-a491-4dce-a5a2-6ce7e2db55cc` | `a3206e5721de649d4ac4c10b49620d87862f41beb492853606acb01d7f7ffdc7` |
| Destructible wall | `35f7c568-f93c-4aa8-a0c2-981370796881` | `d6a2351b-04be-4e7d-a018-dfcc977c0fe5` | `4ff6cc97e48f6314c3a9c016463ff49e7ce94cdd28e8a45979bdcc228a1d576c` |

The supervisor verified actual imported bytes against the asset manifest.
All four records bind the art-direction Skill hash
`ebb98216d00a64829d52a6db81fd41c3d8443c1257ff1c8eb16d596afe108040`
and asset-brief hash
`2652cba78a27818c82aaecaaff8e23c776a4e447c763d0b09c05936c993605a9`.
Import is not proof of correct gameplay-scale rendering.

## Executable game tests

Reports live under `.aigame/local/test-results/` in the actual project, named
`test-run_<ID>.json`. These were read and checked, not inferred from Copilot's
completion text.

| Test                         | Report ID                  | Outcome                                                       |
| ---------------------------- | -------------------------- | ------------------------------------------------------------- |
| UI/help/pause/audio controls | `88bc9fa938579fd8291c0e15` | Completed; 13 assertions; no diagnostics; six AudioBus events |
| Win                          | `57907a0ea5205c8fb112da76` | Completed; 3 assertions; no diagnostics                       |
| Loss                         | `a812416d42a09adebd8ea542` | Completed; 2 assertions; no diagnostics                       |
| Friendly fire                | `4bbc54b0d5b18e5ec75dfe35` | Completed; 3 assertions; no diagnostics                       |
| Deliberately wrong score     | `2a32fc9a0129542dbcedf1bd` | Failed correctly: expected 999, actual 100 at Tick 79         |

Additional internal-Copilot tests passed after Studio restart:

- `tests/command-routing.test.json`: four assertions;
  `test-run:8950ec540970a6bc93092955`, completed, no diagnostics.
- `tests/smoke.test.json`: eight assertions;
  `test-run:9dbc3778f80193f338b11824`, completed, no diagnostics.

There are 33 passing executable assertions across these six positive tests. The
negative fixture was removed from test discovery by internal Copilot through
approved `project.file.trash` ChangeSet
`3e8176a5-6c2a-4565-9768-9de49ba88330`; its failing report and reversible change
history remain. This negative score check does not replace the checklist's
separate wrong-pause/UI regression.

## First installed Sprite integration

Internal Copilot applied reviewed ChangeSet
`f7ada5b5-10e3-4ee6-a2ab-a90ff4ddbbcc` in the verified `3f2be8db…` package.
Its final diff changes only the player's visual Component in the Prefab and
Scene, retaining the existing Component IDs, authored placement and gameplay/
collider values. The explicit source/instance mapping is accepted by the new
Prefab implementation. The visual uses source-pixel crop `181,47,664,926` and
world size `1.35 × 1.88`, preserving the crop's aspect ratio.

The three actual-project reruns complete with no diagnostics:

- Command routing: `test-run:2e6a731177a5f5afa893e2e5` (four assertions).
- UI: `test-run:2347532a6c6d7175a1e5989b` (13 assertions).
- Smoke: `test-run:269871fa645172615414e04a` (eight assertions).

Studio observation `observation:3e241948ce92fb9416d58e9e` records Arena Tick 3,
1280 × 720; PNG hash
`fa437749b0181ee2840ddedb373e4025ecfc766fab2c4ca63ab2565afea624d6`.
The supervisor inspected the actual PNG: the player renders with transparency
and no rectangular background. Enemy/wall/ground placeholders and clipped lower
HUD text remain visible. This frame is a partial visual checkpoint, not acceptance
of the complete game or all UI.

## Enemy, projectile and wall integration

The internal Copilot subsequently applied these reviewed ChangeSets:

- Enemy: `0d6c56c4-f514-4198-b2a6-383a08e7a89f`, source plus six instances.
- Projectile: `6c108c3a-02b5-4d0f-a420-f8b68cd8431f`, source plus runtime
  spawning; static visual and collider overrides were removed from the weapon
  script. The prior full-override proposal `1133f435…` was rejected, not applied.
- Destructible wall: `92826af0-097b-40ff-a98d-833f66c04d3b`, source plus eight
  instances, preserving authored positions, scales, collider dimensions and health.

After the enemy integration, all seven tests completed without diagnostics:
command routing `8b96b8b87ad11b17a5a8f2ad`, UI `c43f6052133fe724373e92fd`,
smoke `627d13210bd8707e0a5be6e8`, win `164c3a4562c44f78294aa198`,
loss `3220ecc5a9d99e85e256c7e6`, friendly fire `107c90975a7f3f1861eac2bb`,
Collider offsets `7b37d5a8374b41756394b1d5`. The Collider test's eight executable
assertions bring verified coverage to 41 assertions across seven tests.

After wall integration, smoke `70481ce3ab5ca96072b79d0f`, routing
`4e6a46e3771ab16c5f74b27f`, win `da14e3fb6508ff76758eb034`, loss
`1796f0699db28fe08ce323c6`, friendly fire `323281a7aec39387d40827ed` and
Collider `874be4eb7ba7c8c237244d69` all complete with no diagnostics.
All IDs above are durable `test-run:` reports in the actual project.

The supervisor inspected projectile frame `e45a3601301dae444ecae188` (Tick 5,
PNG SHA-256 `6888a46430dcac3e9e8a9d673a6c5adbf559bbacff0530a3880d6b2ea8ad4497`)
and wall frame `062580a1cf99e0355040b085` (Tick 2, PNG SHA-256
`f8802b67c354c63e3bb13770079aaf28ff0402d1fd1078ecb3675aa17a284cbc`).
Both show real resource-backed gameplay objects without missing-resource fallback.
The enemy checkpoint `38f720bf…` also exposed an initial overlay occluding an
enemy. Lower HUD text is clipped and the percent glyph is unsupported; these
were explicitly returned to Copilot as unfinished UI work. No visual-completion
or human-acceptance claim follows from the resource-resolution checks alone.

## UI safety and ground integration

Internal Copilot applied `71517d1f-a3c4-4aa4-af7c-c3b9590c00ea` for lower-HUD
placement, initial overlay visibility and supported text. Its added five-assertion
UI safety test correctly failed (`test-run:3eb33a5d8da7d081869819e5`): at Tick 0
the hidden title still contained `PAUSED`, not the expected empty string.
The follow-up `9a4650b1-fa77-4f62-b20b-c4b49cf9d20e` cleared only the two hidden
static labels; no test expectation was weakened. The UI safety rerun
`bedc12d833a8f009369118b3` passes, as do UI flow `57815cf022c51b4719963775`,
command routing `ce640d6d91f118eb9d19050e` and smoke `ec9a46894f218221cb5cb285`.
There are now 46 positive assertions across eight test files (not a final
post-completion regression). Frame `48fdc71cdc5d2a6dd19a174f`, PNG SHA-256
`49622f0ba2f08c5bd239b4fad3cd9d8db90a4054135281aadc86cae443ec4af0`, retains
the same visible corrected HUD; the initial overlay no longer hides enemies.

Ground job `b78b56c6-238f-4736-8947-00ea3e166d92` made one production provider
attempt with two 1024² PNG candidates; actual cost is unknown, not zero.
After inspecting both, the delegated supervisor selected candidate
`3ceb1da4-c121-451e-a526-5a390bd47ef9` (less distracting texture), SHA-256
`348e4e5651d30500a5bd05c3b2c745eb8b062bbe8dc8f762b42d014f10cc10b2`.
The automatic import `3d1d629a…` lacked Skill/Brief hashes and was rejected.
Copilot's replacement `65db96de-74a6-4d85-af75-575054797dd8` includes the
existing Skill/Brief hashes, the same selection record and an explicit delegated
review restriction; it is applied. This is the fifth real imported image.

Scene integration `8a54a007-a60f-4f85-9174-f77ce4de0dba` changes only the
existing background Component to Sprite2D. Actual frame `a9ed0ab8…` exposed an
old rotated/scaled background Transform. Copilot repaired that visual-only
Transform in `18e230e7-18cf-40a9-ad22-5e179c5ef1b2`, leaving gameplay placements
and colliders untouched. Reviewed frame `31091d1d25eaae543594c221`, PNG SHA-256
`21b02f53d06cef5209afec53842200424073109d9358266d2a7f0632eb6e8494`, shows the
ground filling the battlefield. HUD backing/style and remaining effects are
still unfinished; this is not complete UI acceptance.

Cross-Scene audio proposal `c0fde8d7…` was rejected without application because
its mutable module global is not snapshot state. The engine repair and isolated
continuous/split-request evidence are in `P21-SCENE-TRANSFER-EVIDENCE.md`.
The new engine is installed after a full check pass. Copilot's SDK sync
`2fa27477-dac2-47e2-a8cd-f90cd1750ff7` is applied; the supervisor verified its
only changed file exactly matches the installed canonical SDK. Actual audio
logic and resumed-run verification are still Copilot work at that checkpoint.

Copilot then applied `279b208d-da6d-4fe6-95c9-5756f6c17608`, routing both input
and command Scene transitions through stable destination UI Component IDs.
It changes only two script files and adds an audio-session Replay/test; no
Scene data or existing tests are weakened. Twelve new assertions verify 70%
volume and mute true through menu entry, arena restart and return, for both
input and command routes. `test-run:e520139f2df0597b5d08c28e` passes, report
SHA-256 `959c0f880d0319813c2c87c1950d44e58839288f3ec8cffa53162d7b62758f1e`.
The supervisor also checked actual master-bus events: transitions at Ticks
8, 16, 24, 32, 40 and 48 emit volume 0.7 and mute true, not the default 0.8.
UI flow `e0445dd6bff307509e822b50`, routing `a0ea84797712b9defc7b8019` and
UI safety `fd5c3d354665062a1cb2d8a6` pass without diagnostics. Coverage is now
58 positive assertions across nine files; this is not final full-game coverage.
Copilot then ran the actual persistent session
`session:edd372f9379c48079149778d0e41b8cf` one Tick per request, checking 70/true
at all six transition checkpoints. The supervisor independently read its live
Tick-50 result (`tick:51`) and compared it with the immutable continuous test's
Tick-50 snapshot: both have state hash
`367e923ebdbae7bf00fc0308df32fa3d6bfa637c3bf18c6628f8605621d5db65`, with the
menu's original UI Component ID and no diagnostics. This is supervised live
evidence, not P33. `runtime/latest.json` is disposable and subsequent checks
overwrite it; it must not be cited as an immutable capture. Formal audible
output remains unchecked because a production SFX route is still unconfigured.

## Actual pause/UI negative evidence

Copilot applied the isolated temporary test `bc0edc50-c6d2-4d75-911d-22e5ba28840f`.
Report `test-run:83197d48e98fdfc1fc5c75af` has status `failed` and
`TEST_ASSERTION_FAILED` at Tick 8: `tank:object/arena/match`, Component
`tank:component/2e4345ec`, field `screen`, actual `paused`, deliberately wrong
expected `playing`. Report SHA-256 is
`892c89a78579b6fba0cfbd1cf8e3fa727547b0d0b695540b3815fe1eabf67b41`.
This is a pause/UI assertion failure, not the earlier score-only negative.

Reviewed cleanup `59f82829-e10e-43a3-89bb-7e319e0aa02b` is applied. It moves
only `tests/ui-intentional-failure.test.json` into recoverable project history;
the supervisor verified it is absent from active tests while the failed report
remains. It does not remove any positive regression or weaken its expectations.
Final post-transformation positive regression remains required.

## Solid wall and VFX review checkpoint

Solid-wall candidate `41dad930-53b9-4bdf-bf02-5f272086cc9f` was selected after
both images were viewed. Its reinforced structure has no damage cracks that
could confuse it with destructible cover. SHA-256:
`bf70d18db4383a5da6e15c75118e34bab3b4b1454a19392bdd52867787f0cb96`.
Copilot import `03b26067-514e-444f-9ee4-680e98e2a51a` replaces the rejected
missing-provenance auto-import, includes the Skill/Brief hashes and delegated
review restriction, and is applied. It is the sixth imported image.
Integration `2b95b8c9-7eb7-4ed5-9908-40c95c083378` is applied, preserving the
Prefab/Scene visual Component IDs, all four boundary transforms and colliders.
UI flow `264a1cf7f6388830a3154967`, smoke `354b5a1ee181244cf545e9a3`, Collider
offsets `ec94633f99541d1ad882baf8` and UI safety `b00fdc5ba5b7ac0a55a6fd3d`
complete with no diagnostics. Reviewed frame `227fd797642922c950ec36ae`, PNG
SHA-256 `a4e0fb279ddd1a61cdfb7be54d12b367547ec828ad80fdd942488ba4138817bd`,
confirms texture-backed boundaries. Vertical stretch is visible and has been
returned to Copilot for refinement; resource resolution alone is not visual
acceptance. The six images are now wired, but full presentation is incomplete.

Copilot refined the two vertical crops in `74634372-ce7f-4bdc-a9ee-5577c72d4018`:
only `atlasRegion` changes to `503,336,20,365`, matching the vertical aspect
instead of squeezing the full horizontal strip. No IDs, transforms, colliders
or sizes change. Applied frame `09bafdd494f241ff30d4e9aa`, PNG SHA-256
`513dc5e75b8ef89f43349923351f8e17da32cd27013caf8e306fd033a09c17d1`, was viewed
by the supervisor and no longer shows the thin stretched pattern. Final
cross-screen art consistency and HUD backing remain required.

VFX job `da76b3c7-2760-4909-8fa3-842500d541fe` completed one provider attempt
with two transparent 1024² image candidates; actual cost remains unknown.
After viewing both, the supervisor selected candidate
`db4d497c-6ea3-470f-998a-abf5e69884f0`, SHA-256
`e424a562bf492c0fb5173080c1d69e95e6c33ddc7bb62362270c3c630e1268c8`.
Its three effect silhouettes have clearer separation and scale hierarchy.
This selection still requires crop and gameplay-frame verification; shared
low-alpha glow must not become a clipped rectangular artifact in-game.
Auto-import `559bcf84-6c36-4fa5-a01c-a245e20d0046` was rejected because its
Skill/Brief provenance is empty. Reuse the selected candidate and review record;
this rejection does not require another paid generation request.
Replacement `853cfab6-f5fb-4af5-81c7-7fca368442fd` supplies the matching
Skill/Brief hashes, same selected candidate/reviewDecision and delegated-review
restriction. It is applied; no new provider attempt was requested for import.

Combat VFX wiring `12ad4b38-b613-480a-bd25-4e1e67bb4848` is applied after review
of its seven files. A reusable Prefab and Tick-driven lifetime system provide
impact, hit and destruction feedback without changing collision geometry.
`test-run:b0e3f6fcf930cb883ed8344f` completes six lifecycle assertions with no
diagnostics; report SHA-256 is
`a56aa5048fd3b2a120e12fca7c4b4e5f4ccfe66ba215a108a342c957be445557`.
Small-impact visibility refinement `f9d14b4c-d7a5-4906-aa56-bb1d0050a2c7`
changes only impact size from 1.1×1.71 to 1.8×2.8 and adds four impact assertions.
It is applied. Report `test-run:d0818ef101dd1d97999c2341` passes with SHA-256
`6308c77a355f950a7959b3d81ea1f752ecdb456673f2c471763521cfe7b90ad5`.
The current positive coverage is 68 assertions across 11 tests, not final
post-transformation regression.

The supervisor inspected hit frame `fb82cd185a97e5de3f9ddb0e`, destruction
`51d1047c1e747d7731eb8bd5` and refined impact `1e5e0b266ebb960bdac980d8`.
Their PNG hashes are respectively `1e50489eab21983b3e7800de57d990a76b74155110bb630c7d83b0ba9a4a9fd9`,
`7ef9dfe0069c0d3e4e35d81407930ba4e6f56c40d3bd38c0c6f9df65076e4b8a`
and `57e0fb6df0f73ea03665256a8912ada31d520b2ec06333cce4ad11669ebd36ca`.
No obvious rectangular glow boundary is visible. These are combat test fixtures:
their block actors and overlapping fixture HUD are not the final arena, and
these captures must not substitute for actual-game presentation acceptance.

## Menu/UI candidate checkpoint and corrected alpha judgment

Menu backdrop job `409f7989-a675-4558-b38b-990575f835c9` made one provider attempt
and returned two 1536×1024 candidates. The supervisor selected candidate 1,
`442258c9-8797-4322-a7b5-fdc486795e5b`, for its quieter center and sparse edges;
PNG SHA-256 `89a8346d5814ee2784f3f8beffe92e4b7dd4a76eb90ffc89d5b65663292ab9f0`.
Auto-import `6978212c-ed54-4c74-bcaf-458946d93609` lacked Skill/Brief provenance
and was rejected. Replacement `67519dc6-6e6a-4777-83e6-25e989cdd637` includes the
original review, full hashes and delegated-review limitation, and is applied.
This is not a second generation request.

UI kit job `039c0bd2-e249-4092-a371-24b294ed415c` also produced two candidates
in one attempt. Copilot initially inferred an opaque sheet background from the
image viewer. Read-only inspection of actual PNG alpha contradicts that inference:
candidate 1 has 437,952 fully transparent pixels; alpha at (0,0), (512,0),
(0,512), (512,400), (512,590) and (1000,1000) is zero. Studio's checkerboard
also shows through. RGB color retained beneath zero alpha is not a visible
background. The supervisor canceled the rejection dialog without submitting it,
selected candidate 1 `39209199-a147-4e8e-a9c3-0b11f5a3059a`, and asked Copilot
to correct the unsupported inference and verify real-game crops before any
regeneration. Candidate SHA-256:
`629d63acd4be8763b276e21f8fe38fd24a6828f6467827be9c6cf9e3abd3d563`.
The generated auto-import `c23fe94d-9ee1-4b0f-a52a-7da751a93595` was rejected
only for missing provenance; the selected candidate and review decision remain.
Neither selection is independent P33 evidence, and actual costs remain unknown.
UI replacement `ae88ea21-ca70-457f-a4b0-87e21d2b15d2` was reviewed and applied
with complete provenance and an explicit real-frame transparency condition.
The supervisor verified all nine imported image hashes against the manifest.
Menu wiring `b4b72391-2f14-428e-baa1-33e49e045061` is approved: it preserves
all Scene IDs and state, uses a centered 1536×864 crop and corrects only the
background's anomalous visual Transform. It is applied. Actual menu observation
`d05f82ebf3375730849f3574`, PNG SHA-256
`c5223ba631580d25e605d244241355baef4b251e5b4c26ae73a27183c719882f`, shows
the formal backdrop covering the viewport, but the old menu prompt is visibly
clipped at both sides and the title hierarchy/placement still needs work.
These labels are `render:text2d`, so this observation's `ui` list is empty;
zero structured diagnostics is not proof of readable menu layout. Final UI
integration must repair this and pass real-frame review, not just state tests.
The supervisor rejected unapplied UI batch
`9f532f98-c1ba-42c3-a01a-2bd65aaf9521`: it only attached frames beneath the old
text and stretched the pause-icon crop (185×165 pixels) into a 12×7-world-unit
overlay. It did not repair the captured prompt clipping. The replacement must
address text fitting, icon proportions, layout and readable pause/summary
content together; importing an atlas does not itself complete game UI.

## Still required

The Prefab preview exposed ID regeneration; the unsafe proposal was rejected.
Engine source regressions are documented in `P17-PREFAB-IDENTITY-EVIDENCE.md`;
the supervisor restarted Studio in the verified `3f2be8db…` repair package;
the four source/instance integration batches above were then applied. During inspection,
internal Copilot used read-only PowerShell image analysis and installed-source
search outside Engine MCP. No game mutation was made by those reads, but they
are an external-tool deviation and cannot qualify as tool-only P33 evidence.
Further implementation must use the supported project tools and report missing
introspection rather than counting this workaround as a passed workflow.

The follow-up `ea90d416-24d0-47cd-9192-95db1908ecc1` was also reviewed and
rejected without application. Its runtime bootstrap would remove the authored
player from the Scene and change existing Component IDs in three tests. That
workaround is unnecessary once the engine's ID-preserving Prefab repair is
installed. The authored player, placement and executable test references remain
unchanged in the replacement implementation on the repaired engine.

- Real Prefab reuse and resource-backed rendering for every required object.
- Final cross-screen art consistency and UI resource coverage.
- A configured production sound-effect route and reviewed formal sound assets.
- Formal audible output; cross-Scene volume/mute state checks passed above.
- Final movement/combat/scene/restart/replay regression; pause/UI negative evidence
  is already retained above.
- Actual frame/audio review, Studio/Player parity and standalone packages.
- Independent participant Journeys A–E. None is signed by this checkpoint.

## 2026-09-06 — resumed native build and cardinal-direction repair

After the owner closed Studio normally, verified audio build `aa63a769…` was
installed with all 287 content hashes checked and the previous installation
backed up. The original Copilot conversation resumed through Studio; no new
external game author was started. See `R5-BLOCKED-HANDOFF.md` for installation
and Computer Use recovery details.

Copilot independently reproduced the reversed Up/Down input and opposite tank/
projectile artwork direction through four authored-Menu runtime observations.
Its first nine-file proposal, `changeset:b0d156c7-61f5-4051-a9ce-ebadd8c98302`,
was rejected rather than applied. In an isolated copy, its new cardinal test
produced 11 assertion failures on old code. Applying the proposed production
repair preserved all 17 existing passing tests, but six new angle assertions
used unnormalized PI values instead of the engine's 12-decimal snapshot values.
The exact failures remain in `artifacts/r5-direction-proposal-review-gojZNQ`.

Copilot's replacement `changeset:3700cba2-82fc-4ff8-8525-bc620b99704a` changed
only those six expected angle values relative to the reviewed proposal; all
production file hashes, the 20 cardinal assertions and eight smoke assertions
were retained. The supervisor's second isolated run preserves the old-code
11-failure result and passes 18 tests / 127 assertions after staging the repair.
Original project authority remained unchanged throughout that diagnostic.
Evidence: `artifacts/r5-direction-proposal-review-YwEOKN/summary.json`.

- Proposal SHA: `029d00d981367bfb8e4231b8a9dbc0a8073a84cefc47e26552d3a482805f667b`.
- Approval content hash: `0260d33000c93bf2d5f117c56dfe935b58142487e065a268d9d2b78a8667020d`.
- Original Copilot turn `01a0724f-aae6-7980-8825-9cc42ac7d54f` then invoked
  `change.apply`; the supervisor verified status `applied` and all nine actual
  file hashes against the approved proposal. The supervisor did not apply it.
- Actual-project cardinal test `test-run:44c0f446c261963250a5e538` is completed
  with zero diagnostics. The supervisor subsequently inspected all 18 distinct
  actual-project reports written after 2026-09-06 00:03 Asia/Shanghai: all are
  completed with zero diagnostics, covering 127 assertions in the current test
  definitions. These are separate from the isolated staging-copy results.
  The cardinal report SHA-256 is
  `0534b41ba292650e01a19f873ea5c04806f482cf5f5ce95d67d9f169047fa4cc`.

The repository-wide `npm run check` also finished with exit 0 after resumption,
including real Electron gates, native GPU-window checks and release/install/
upgrade/crash-recovery gates. Its isolated regression package
`AI-Game-Studio-0.3.0-preview.1-r5-owner-resumed-check-win-x64.zip` has SHA-256
`bde4add8470fd148a481825fb2089c95a7df26ff045949b25ca5ce1d6ffd6dc2`.
It was not installed over the running owner build: the owner installation
remains the verified `aa63a769…` audio/native repair package. These engine gates
do not substitute for rebuilt, playable actual-Tank packages or P33 acceptance.

Three UI inset repairs, new-revision normal-input victory/loss/muted restart,
two-resolution Studio/Player comparison, replacement real game packages,
formal sound effects and independent P33 remain open. None is closed by the
direction patch or by the already passing engine/native-window fixtures.

The first inset proposal, `changeset:3def30a1-1b52-49d6-b806-889420b9391b`,
was rejected after isolated regression, without applying it to game authority.
Its production changes are limited to the Menu/Help anchors, the Arena body
width and three-line audio copy; existing actions, IDs and assets are retained.
All three amended tests fail on the old production code as expected. After
staging the proposal, 17 tests pass but `ui-flow` has one failing new assertion:
at Tick 31 the volume state is 70 while the presented label still reads 80.
The existing volume assertion itself passes. The replacement must test the
stable presentation tick, preserve the 70% state expectation and retain all
assertions; it must not conceal the failure by weakening the test. Evidence:
`artifacts/r5-inset-proposal-review-tR5WQJ/tests_ui-flow.test.json.green.json`
(the filename labels the staging phase, not a passing result). The review
feedback was delivered in original Studio turn
`01a07255-fa1a-71b2-a181-68fcb9714909`, which resumed the same Goal.

The follow-up `changeset:e44e50d8-de10-41d3-8bc5-975cef60461a`, proposal
`3d93215682f36ae413bde2022f0904a9a953652562aa7668a57cee5fee322bbc`, moves only
that presentation assertion to Tick 32. The isolated review in
`artifacts/r5-inset-proposal-review-mlEpet/summary.json` passes 18 tests / 131
assertions and retains three old-code red tests. Nevertheless, it was rejected
without application after inspecting six 960×540 / 1280×720 rendered frames.
Menu root copy improves, but the Help final line still overlaps the luminous
bottom border and Arena Audio's third line crosses onto the metal frame. Button
labels also lack horizontal breathing room. A passing anchor/width assertion
does not establish safe glyph bounds. Copilot must revise content fit and add
meaningful multiline/safe-content checks before fresh actual-game logs and
packages. The supervisor's renders are staging diagnostics, not native-window
or independent participant evidence; the game remains at the approved direction
repair, with the actual 18-test / 127-assertion baseline unchanged.

The next six-file proposal, `changeset:0f4f3d2c-3338-4a26-b238-c6f12afded68`
(`0e7c00d180e0efadfbe03686c6323f37da6f47d8ee330364b1be0bc2501fe35a`), splits
copy into addressable lines and enlarges proportional frames. Its Scene changes
remove no objects and change no non-UI Components. It was nevertheless rejected
without application: `writeLineSet` checks `context.objects.includes(id)`, but
that System's query selects only `tank:ui-state`, not the text objects. Isolated
evidence in `artifacts/r5-inset-proposal-review-CFi429/test-summary.json` shows
failed Menu/Arena copy and the existing final-score regression. The supervisor
delivered this concrete failure in original Copilot turn
`01a07263-38f7-7630-92d8-2cb7ea865ebc`, which is preparing a replacement without
weakening tests or changing the System query/gameplay.

The same review exposed the missing test-level UI containment operation. The
engine now has source and compiled-MCP tests for additive `fitsUiContent`,
sharing observation measurement instead of inserting pseudo-measurements into
game Components. See `P31-UI-CONTENT-EVIDENCE.md`. Full regression and installed
delivery are pending; the owner build remains `aa63a769…`. The game author was
explicitly told not to use the new operator before it is installed.

The corrected replacement `changeset:bfc57eb9-ee25-4a47-ba43-d3fc1edbf363`
(`08ec0ff852a3b86f995c0470bfbc982352e9deee8ae429c3ee4ade94e880db05`) retains
the six-file proposal and replaces only the erroneous existence check with
`context.get(id, "ui:text")`. The isolated review preserves three old-code red
tests, then passes all 18 tests / 164 assertions. Nevertheless, six actual
rendered frames show Menu Help's last line on the raised bottom trim and Arena
Audio's title on the top trim, at both 960×540 and 1280×720. It was rejected,
not applied. Evidence: `artifacts/r5-inset-proposal-review-r9aldV/summary.json`
and its six PNGs; the original revision remains
`f6c4388ac9997a7d461a96c88fabf45cf7517140dc1f8f802b3d9971b1f146c9`.

Original Copilot turn `01a07269-242f-7c02-93bb-198d57f36051` received this
feedback through Studio. It is measuring current observations and planning
real interior clearance before the upgraded engine is delivered. Fixed-anchor
assertions cannot certify the artwork's usable rectangle. No rejected UI
proposal, staging copy, or fixture gate has become game authority or P33 proof.

The full repository check subsequently exited 0; the UI-containment candidate
`383d6b45…` passed release/install/upgrade/recovery and was installed after a
normal owner-app close, with all 287 manifest hashes checked and a complete
recoverable prior installation. The installed runtime/MCP probe also passes
(`P31-UI-CONTENT-EVIDENCE.md`). The same original Tank project and Copilot
conversation reopened; the supervisor delivered the exact `fitsUiContent`
format through its Goal composer. The game remains at revision `f6c4388a…`.

The Copilot then authored `changeset:0bd86864-a77a-460c-a7fd-3c2234acbc38`
(`8cb539bb2eb4995c83b88affa29b10fe35611973ddc1ee9a17aa2c048bc713c5`): eight
files, 19 tests / 244 assertions, including 76 two-resolution `fitsUiContent`
checks. All existing assertion IDs and non-UI gameplay Components were retained.
The isolated run passes 15 tests and fails four. It was rejected, not applied.
Evidence: `artifacts/r5-inset-proposal-review-mhFq7I/test-summary.json`.
Arena Help's first line exceeds the left interior by 44.17 / 33.13 pixels;
Menu root's first line has only 2.83 / 2.12 pixels of horizontal clearance.
New Pause presentation checks also precede the stable presentation snapshot.
The run separately exposed the transparent-own-button checker false positive
documented in `P31-UI-CONTENT-EVIDENCE.md`; no game styling workaround is required.

This feedback was delivered through the original Studio Goal composer in turn
`01a0727d-e690-7b92-b622-6ae00cbb284d`. Copilot acknowledged the exact defects and
is preparing a minimal replacement with all gameplay and containment coverage
retained. New engine packaging, replacement review and actual application remain
open; staging tests are not evidence of a changed owner project or P33 acceptance.

The next replacement, `changeset:c070ef34-830a-43b3-b42a-f5d91e27e61e`
(`4014e6e9822680b892f369023833ef335b2ac80d3df4210a8f39e7cdb5b78f42`), fixes the
two real content overflows and moves only the new Pause presentation checks to
Tick 9. With the source engine's transparent-button correction, 18 of 19 tests
pass (244 assertions total). The remaining failure is real Pause-button geometry:
Resume's text is 167.14 pixels wide inside a 160-pixel hit area; Audio has only
4.14 / 3.11 pixels of horizontal margin at the two viewports. The fix correctly
exposes this formerly hidden failure instead of accepting oversized text.
Evidence: `artifacts/r5-inset-proposal-review-uf2LKs/test-summary.json`.
The original project still hashes to `f6c4388a…`. This proposal was rejected and
the concrete measurements sent through original Studio turn
`01a07282-9a2a-7341-87d7-ad318b8a9db2`; Copilot is preparing a bounded button-size
replacement without weakening the six-pixel contract or changing font/action IDs.

`changeset:ae7b1408-4381-4012-9fc8-47811b4a7bd2`
(`2182e5c193c8261f397861dc5409795d6ca372e946b956c8c6643bc8a72be9fc`) changes
only Resume and Audio widths relative to c070 (188 and 172). The isolated review
now passes all 19 tests / 244 assertions and preserves old-code failure evidence.
All sixteen PNGs at both viewports were inspected; the targeted panel/button
containment defects are fixed. Evidence:
`artifacts/r5-inset-proposal-review-5YuVH6/summary.json` and
`artifacts/r5-ui-review-ae7.md`.
This is eligible as an incremental repair after engine delivery, not final UI
acceptance: final score and Restart/Menu rows have very little vertical
separation and need a follow-up. Later exact measurement is 1.6 / 1.2 pixels
at 1280 / 960, correcting the initial under-one-pixel screenshot estimate.
The four result frames use explicit fixtures,
not normal victory/loss logs. Original-game application is still pending.

After full regression, candidate and installed-runtime checks passed, owner
Studio was upgraded to `6c4d0ffc…` and the same project/conversation reopened.
The supervisor approved ae7 with content hash
`4fe3219b7ad78540ba8f56900600fa044565848a9492c50f07e67f2db935db54` through the
shared review service, without applying it. Its Goal composer received the
installed-engine evidence and instructions to apply, run the actual 19 tests,
then separately propose measured line-spacing improvements before fresh real
logs and packages. Final game completion and P33 are not implied by this approval.

Original Studio turn `01a0728f-80b1-7b71-a7de-61a464b499b0` subsequently invoked
`change.apply` and all nineteen actual project tests. They pass 244 assertions,
including all 76 `fitsUiContent` checks. The supervisor's read-only audit verifies
all eight applied files against the approved hashes and the fresh durable MCP
test reports, without rerunning or modifying the game:
`artifacts/r5-applied-ui-audit.json`. Actual revision:
`aff3a2757a51b0533625987f088fef633d29b8f2baf0784e8869859ca9dcad1f`.
The new containment capability is now used in the actual internal-author loop.
Copilot continues with observation-backed row spacing; formal SFX, new normal
gameplay logs/packages and P33 remain open.

The independent spacing proposal is
`changeset:5820aaf8-6bc4-4eac-af88-2a201878d0e9`
(`690881c862d2cc1ce9d7f241acd80fa344ecde30859d4ad8e4867e6ceb68f06f`). It moves
Menu root's first row from .834 to .825 and only the result score from .520 to
.510, preserving Pause and all other states. Fonts, actions, copy, gameplay and
all 76 containment assertions are unchanged. Two score-anchor regressions are
added. Isolated evidence in `artifacts/r5-inset-proposal-review-NMclEw/summary.json`
passes 19 tests / 246 assertions. All six changed frames were inspected; the
other ten PNG hashes match the previous review exactly.

The executable supervisor-only `row-gap-audit.json` fails against the prior
snapshots and passes the new snapshots. Actual gaps at 1280 / 960 are Menu
8.96 / 6.72 pixels and result score-to-actions 8.8 / 6.6 pixels. The proposal was
approved through the shared review service with content hash
`a130eabc92b736c49ebbf0c4c28acd0683293580286329c4ddcb8dd0747f8a93`; the same
Studio Goal was told to apply and run actual tests, then continue new-revision
normal gameplay logs, Studio/Player comparison and independent game packages.
This checkpoint records approval, not yet actual application of the spacing batch.

Original Studio turn `01a07296-6c8f-7391-a77d-145eec1e9d73` then applied the
spacing batch and reported all 19 actual tests / 246 assertions passing, with
76 containment checks retained. The supervisor's separate read-only audit is
`artifacts/r5-applied-spacing-audit.json`; it checks the five approved file hashes
and the actual MCP test reports newer than approval. Copilot has advanced to
recording new normal-Menu-entry battle logs and the installed Player/build tools.
The audit confirms actual revision
`17ae462e17c7de09b9697c372386b2d9387d42c9550ed98fb1d163796dc4b26b`.

### Fresh 17ae normal-entry recordings

The original Copilot recorded loss at Tick 1312 with seed 20260906, starting
from the authored Menu. Its only four input edges toggle mute and start the
game; `commands` and `controls` are empty. Log
`input-log:e65286445f2dcd99281eee1feb7dd9c759c206751a446d91b3b13c37264a3a53`
has state hash
`7030ec9aa61eff046a8822b88c3eeb5d9221c74512a8107864c018c6a076f1f6`.
The read-only supervisor audit in
`artifacts/r5-recorded-parity-1Q00U8/summary.json` confirms actual Studio/Player
state, drawables, audio-event identity and PNG hashes at 960 and 1280. No
resource fallback or diagnostic is present. Actual Player state is lost,
six enemies, zero score; UI `muted` and `appliedMuted` and the last master-bus
mute event are true. Both result frames were inspected and remain legible.

The audit executable `artifacts/r5-audit-recorded-parity.ts` also rejects the
same loss log when asked to prove victory (`lost !== won`). It cannot turn a
fixture or failed session into a passing outcome and does not run or edit the
game. The subsequent normal-input restart is exported at Tick 1320 as
`input-log:4c1a2bdc9a02a0782218446e8c270d98c6e80f678ee3998c2928fc5dfa4ee113`.
Its two actual Studio frames were inspected; independent parity is pending.
Copilot has started a separate normal-entry victory recording. Final audio,
new independent packages and P33 remain open.

The new normal-entry victory log is
`input-log:7647a694267663f28e6ce712b0660f96433826cac6667d6c74e688c1a3e16f4b`:
Tick 952, seed 20260907, 96 input edges, no commands or controls, same `17ae`
revision. The supervisor's read-only audit
`artifacts/r5-recorded-parity-jgeeRT/summary.json` verifies both actual Player
results are won / zero enemies / score 600, state hash
`dac7c67b1790ee122e24e8bd502dabedab479adad9298fcef281d419489de28f`.
Studio/Player PNGs match at 960 (`c509630a…`) and 1280 (`3da47d5f…`), as do
drawables and audio events, with no diagnostics or resource fallbacks. Both
frames were inspected: HUD shows HP 2/5, and the title, score and actions fit
the decorative panel without overlap. This is current-revision supervised
evidence, not formal SFX or unassisted P33 acceptance.

The muted-restart pair subsequently passes the same read-only audit at both
resolutions (`artifacts/r5-recorded-parity-cycI6P/summary.json`): playing, six
enemies, zero score, retained UI/applied mute and master-bus mute events. The
independently extracted **actual** Development and Release archives also pass
all three logs, both viewports, startup verification and native `wgpu-surface`
five-frame smoke capture without a Node/Codex/provider environment:
`artifacts/r5-recorded-package-review-or8dUZ/summary.json`. All 50 Development
and 16 Release content hashes pass (51/17 files including each manifest).
Both carry six Prefabs and nine formal images, not formal audio.

- Development ZIP: `0f140cfcd3d2b5de3bef8c7bc1bac34a0610bce2de6a6d84853bb5253fbe2b68`.
- Release ZIP: `4ae391a8b294c14431ebdc68027a47d51230aad054c1baf9fc4d9886e1d3f6a0`.

This closes current pre-audio packaged replay/startup verification, not final
audible or P33 acceptance. The actual internal Copilot lacks a guarded Release
launch/observation tool; supervisor executable verification does not demonstrate
that it can perform that step itself. That tool-surface gap remains open.

The later documentation-only proposal `2d74ca53-986d-4b19-b07e-fd6dbe5ec683`
(`b7c038bdfe540fde711da951acc1e70953a4cc62025357ab576d6ab182941ad6`) is
retained but rejected at this checkpoint: applying project documentation changes
the conservative project revision and invalidates all three current log IDs;
the report also predates the supervisor Release-startup evidence. Current
findings are recorded in this workspace's evidence instead. No game file is
changed and the actual game remains `17ae462e…`. Original Copilot is waiting
for formal SFX / Release-tool / independent-human prerequisites; the root Goal
remains active while Studio feedback and tool-surface work can proceed.

The actual owner Studio test pane additionally showed fixtures as runnable tests
and no previous results after MCP tests. Read-only source inspection confirms
`kindFor()` classified every `tests/` file as a test, and the renderer read only
component-local `testRuns`. New regression `check-p31-test-report-sync.ts`
first fails on fixture discovery. Source repair is underway; UI delivery is not
yet claimed. These are Studio integration defects, not failed Tank assertions.

The follow-up now passes cross-registry test history, corruption and fixture
negatives, actual 960×640 / 150% Electron feedback and the new shared UI/MCP
`build.verify_package` / `build.read_verification` startup checks. See
`P31-TEST-REPORT-FEEDBACK.md` and `P31-PACKAGE-VERIFICATION.md`. Full regression
uses the isolated `r5-package-verification-check` candidate; the owner is still
on `6c4d0ffc…` until that check, installed probes and recoverable replacement
finish. No new paid call or original-game change was made by the supervisor.
