# P30 Studio / Player parity evidence

- Date: 2026-09-05
- Gate: `node scripts/check-p30-agent-observation-bridge.ts`
- Result: passed

## Scope and newly exposed actual-game gap

Follow-up source gate passes a 551-Tick combat recording through MCP paused
session inputs and `runtime.export_input_log`. Studio and native packaged
Player independently execute 200/200/151-Tick requests with identical final
state, PNG, resource and audio semantics. Label-only requests, missing,
tampered, stale-version and overridden logs fail. Session tests cover consumed
inputs, same-Tick ordering, future-input exclusion, mixed-version invalidation
and fresh restart. Full check/package installation and actual Tank long-run
acceptance are still pending.

Complete `npm run check` subsequently passes, including P20's 100-run
deterministic/performance checks, clean installation, upgrade, renderer-crash
recovery and user-data preservation. The recorded-input Windows candidate is
`AI-Game-Studio-0.3.0-preview.1-r5-input-log-check-win-x64.zip`, SHA-256
`19410ce98235b60671cbcbea641fb9b9ac8e5da2c3d45df47224e96539c879d8`.
All 287 manifest content hashes are independently verified. After the complete
P30 and post-checks below pass, the supervisor normally closes Studio, backs
up the prior canonical tree, installs this candidate and independently verifies
all 287 installed hashes. The original Tank project is reopened, not copied
or rewritten. Its internal Copilot acknowledges the new tools and keeps the
same Goal/Plan/Completion Run. Actual recorded-game acceptance is still separate.
Complete `check:p30` subsequently passes on the final source, followed by
TypeScript, lint and formatting checks. The recorded combat gate again reports
551 Ticks and exact Studio/Player identity. This establishes the machine
delivery gate; actual-project installation/recording is still separate.
The full-check run's early typing/style checks are supplemented after the final
recording-guard optimization. Batches reuse authoring inputs already read by
the runtime instead of rescanning media (measured full scan: about 41 ms on the
actual project). The session regression asserts no extra full-scan calls during
advancement. A Windows test-cleanup race is fixed by awaiting child exit before
removing its own temporary directory; the final targeted gate exits zero.

The first Player combat test fails at Tick 2: Prefab definitions are omitted
despite being listed as reachable. The repair packages the actual definitions
and supplies them to native play, verify and observation paths. The same firing
route then passes. A test's package-directory typo after parity is corrected;
the final gate verifies packaged shell Prefab contents as well as all parity
and negative assertions. No gameplay code is changed by the supervisor.

The passed machine result below covers an explicitly specified, short input
recipe. It does not prove recovery of an arbitrary paused live session.
During the actual supervised Tank run, the Copilot reaches real Arena victory
at Tick 2340 using many `runtime.input` / `runtime.advance_ticks` calls. Calling
`runtime.compare_player` with only that checkpoint label starts default Menu
runs instead of looking up the accumulated input history. The result is not
accepted as victory parity. Current `checkpointId` labels observations; it is
not a replay recipe by itself. The installed bridge at that failure does not
export the accumulated recipe or provide a guarded long-Player replay path.

Before closing actual long-session parity, an executable acceptance slice must
retain the original Scene/seed and every semantic input with exact Tick/order,
export an addressable reproducible recipe, replay it in bounded Player batches,
and compare true win/loss/restart states and resources. Missing/stale history,
changed project versions and label-only misuse must return a clear failure,
not a successful comparison of unrelated default states. Keep per-batch safety
guards and distinguish this from rendering a supplied Studio snapshot (which
would not prove independently executed Player state).

## Passed short explicit-recipe gate

The project Engine MCP exposes:

- `runtime.capture_frame`
- `runtime.navigate_checkpoint`
- `runtime.read_observation`
- `runtime.compare_observations`
- `runtime.compare_player`

The gate navigated a menu checkpoint, read its durable observation, compared it
with itself, then asked `runtime.compare_player` to build and execute a real
Development package. Studio and Player used the same
`input-log:p30-studio-player-menu` identity.

The comparison reported:

- authoritative state hash match;
- Drawable identity/projection match;
- resource identity/source-hash match;
- audio identity match;
- identical rendered frame SHA-256;
- zero mismatches;
- a stable reproducible package-core hash.

The MCP contract contains no screen-coordinate, DOM-selector, private renderer
handle or direct candidate-selection operation. Repairs remain proposal-only
until the normal human ChangeSet approval boundary is crossed.
