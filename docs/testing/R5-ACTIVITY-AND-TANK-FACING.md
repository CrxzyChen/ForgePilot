# R5 follow-up: Copilot activity and Tank facing

## Scope and responsibility

This follow-up is supervisor-authored, not new proof that the in-Studio Copilot
completed these fixes independently. Existing unrelated working-tree changes
and installed packages are preserved. P33 independent human acceptance remains open.

## Copilot feedback

- Composer shows the current running tool, concurrent tool count, elapsed time,
  last event age, waiting-for-user state and explicit turn termination.
- Transcript activity disclosures show MCP/dynamic calls, commands and bounded
  stdout/stderr, changed file paths, search/image-view and compaction activity.
- Items retain semantic event IDs; completion replaces the matching item.
- Cross-thread and stale-turn events cannot alter the active feedback state.
- History projects supported tool items instead of keeping only MCP names.
- Tool arguments use a small safe metadata allowlist. Raw tool results, images,
  private reasoning and arbitrary argument payloads are not forwarded. Command
  text/output receives common credential redaction and strict length bounds.
- Unfinished tools at turn end are marked unconfirmed, not fabricated successes.
  No-event age does not diagnose a hang and no completion percentage is invented.
- Existing Goal/Plan card, Stop control and transcript follow/jump behavior remain.
- Midnight Workshop tokens, typography and disclosure styling are preserved.

Checks passed: activity reducer, P32 bridge/scoping/coalescing, P15 Electron
quality (960x640 / 150% scale), typecheck, lint and format. Live activity screenshot:
`artifacts/p32-plan-status-ui-wOEa63/activity-running.png`.

## Rotation diagnosis and fix

The previous Copilot diagnosis that Sprite rotation was unimplemented was too
broad. The existing Canvas, native WGPU shader, software renderer and observation
bounds all consume **degrees**. Tank wrote `Math.atan2(...) - Math.PI / 2`, i.e.
radians. A requested quarter turn therefore rendered as approximately 1.57 degrees.

Preserve the existing engine unit to avoid breaking authored scenes. Expose
`unit: "degrees"` from `component.types`, show `(°)` in Inspector, and document
the conversion in the scripting contract and runtime projection schema/type.

Original project: `<tank-project>`.
Applied audited ChangeSet: `changeset:bcd3fd8e-a6f5-4aca-83ac-d1cd7ed84455`.
Only two gameplay angle expressions and the eight corresponding rotation test
expectations changed. Preview/base hashes and rollback bytes remain in the normal
ChangeSet store. Supervisor repair was performed under the user's repair authority.

Evidence:

- Isolated copy: `artifacts/tank-angle-units-UYsGX4`, 22 tests passed.
- Original project: `artifacts/tank-angle-units-cxcUo8`, 22 tests passed.
- Native GPU gate: `artifacts/r5-angle-gpu.log`, four rotations, 16 quadrant
  pixel assertions around a noncentral pivot, plus the existing 10 pixel checks.
- Actual authored input, release-to-hold and four-direction firing:
  `artifacts/tank-facing-IBD5Xa`. Runtime-generated scenes were frozen into
  disposable native WGPU render fixtures for visual inspection, not substituted
  for game input replay or gameplay acceptance.
- Separate real input sequence proves a tank can turn left after firing right
  while the old projectile retains -90 degrees.

New source revision:
`27bc3a91418f683116213c9b979924566fce4398fca9d17c82571c7deaf45da1`.

## Game packages

`artifacts/tank-facing-delivery-BBjbRp/delivery.json` records both packages built
from an identical-revision isolated copy. Each actual ZIP was extracted and
verified through the existing hash/startup/native-window gate. Original game
build outputs were not replaced.

- Development SHA256: `79dd15141369303f4d09f03e2ed007b3756dc3019719bfd58f5fa6c058aef802`.
- Release SHA256: `ffffa36175bc78774e56873d5d4db25cda8fdb963c908524e389f092f97ea174`.

These are repair packages, not re-certification of every historical long replay
or independent P33 acceptance.

## Studio delivery gate

`npm run check` exited 0, including isolated `activity-feedback` Windows
packaging, clean-profile startup and actual archive extraction/installed-style
lifecycle checks. Full log: `artifacts/r5-activity-full-check-2.log`.
The earlier log stopped on the accessibility lint rule requiring an `output`
element instead of a `div` with status role; that defect is corrected.

Studio bundle:
`artifacts/studio-windows/AI-Game-Studio-0.4.0-preview.1-activity-feedback-win-x64`.
ZIP SHA256: `0520a5c05bbfd7d5742eb54399d20792bbc1cff97685ab997c9f566834709b76`.
289 files; user data preserved. No old running installation was overwritten.
This is a tested working-tree repair preview, not a new immutable clean-source
R5 release candidate. The final source additions also pass format, lint,
typecheck, UI contract and P32 progress checks.
