# P31 Tank completion foundation evidence

- Gate: `npm run check:p31:foundation`
- Candidate UI gate: `npm run check:p31:review-ui`
- Status: machine passed; visual candidates await human selection
- Date: 2026-09-05

## Established foundation

The Tank project now contains a validated `tank-art-direction` Skill, a
ten-item placeholder inventory, sixteen versioned asset briefs, and a coverage
matrix spanning world presentation, UI, sound effects, and music. Nine distinct
OpenAI image-tool candidates are retained under the controlled
`.aigame/local/asset-candidates/p31-neon-bastion` directory. The gate verifies
their PNG identity, dimensions, stable filenames, and content hashes without
treating them as selected project assets.

`npm run check:p31:tool-output` additionally proves the Agent-native handoff:
`asset.register_tool_output` accepts only a hash-matched file inside the
controlled candidate directory, reuses a stable idempotency key without a
second side effect, exposes the candidate through `asset.job_list`, and lets
Codex attach an evidence-backed recommendation. `asset.select` remains absent
from the Agent tool surface. The nine Neon Bastion candidates have been
registered as `awaitingReview` jobs by
`npm run prepare:p31:visual-review`; this still records no selection and makes
no authoritative project change.

`npm run check:p31:visual-candidates` reopens the prepared review queue and
independently matches every one of the nine image briefs to exactly one Codex
media job, stable job/candidate/artifact/tool-call identity, and a contained
candidate file. It checks the actual PNG signature, byte count, SHA-256,
dimensions, 8-bit color type, required alpha-channel presence, provider/model
route, evidence links, and `awaitingReview` state. It also proves that no
candidate has a selection, review decision, import asset, or import ChangeSet.
This is technical readiness evidence only; it deliberately cannot assert
composition, readability, seamless tiling, or aesthetic acceptance.

`npm run check:p31:review-ui` starts the real Electron renderer with an
isolated Studio profile and a copied Tank project, opens the normal Resource
panel, and waits for the current nine candidate images to decode. All nine
previews, dimensions, SHA-256 summaries, `awaitingReview` states, and
select/reject/regenerate controls are present within the Midnight Workshop
dock geometry. The panel defaults to the `待审核` view and reports `9`, while
`全部` reports the complete `13`-job history; the five status views make the
current queue distinct without deleting or rewriting older imported jobs. A
digest of all authoritative project files is identical before and after
inspection,
proving that merely viewing candidates neither selects nor imports them.

The runtime and project also establish reusable `player-tank`, `enemy-tank`,
`player-shell`, `solid-wall`, `destructible-wall`, and `explosion` Prefabs.
Project TypeScript can instantiate a Prefab by stable path or semantic ID using
`spawnPrefab`; the sandbox derives stable object and Component IDs, applies
typed overrides, and preserves the Prefab reference in lifecycle evidence.

The machine scenario proves a projectile and its impact explosion are spawned
from Prefabs, a destructible wall emits `tank:wall-hit`, help can be shown, mute
and volume alter audio buses, and the repeated state hash is deterministic.
The pre-existing complete Tank loop continues to pass after the project script
memory budget was raised from 64 MiB to 128 MiB for the larger 900-Tick state
history.

## Deliberately open gates

- No generated candidate is authoritative until a human selection is recorded.
- Selection will only propose an import ChangeSet; project mutation still needs
  separate human approval.
- Sound-effect and music candidates have not yet been generated and reviewed.
- Prefabs still reference the prior placeholder resources until the reviewed
  import transaction is approved.
- P31 visual, audio, package, and unassisted human exit gates remain open.
