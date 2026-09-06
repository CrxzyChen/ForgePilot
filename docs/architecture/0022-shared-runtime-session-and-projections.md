# ADR 0022: one persistent runtime session and versioned projections

## Status

Accepted for Round 04 implementation.

## Context

Round 03 has three different approximations of a running project: a bounded
QuickJS request in the Studio command registry, a DOM Scene projection in the
Electron renderer, and a native wgpu Player that advances one script request
per frame. Pause and step do not retain a Studio VM, collisions can be injected
as fixture arrays, and Studio never displays the Player render path.

Keeping these paths independent would make visual parity, debugging, hot
reload, physics, assets, and AI observation impossible to prove.

## Decision

Round 04 introduces one versioned Runtime Session protocol defined by:

- `schemas/runtime-session.schema.json`;
- `schemas/runtime-projection.schema.json`;
- `schemas/preview-host.schema.json`;
- `studio/runtime/runtime-session-protocol.ts`.

A session owns one authoritative world, script host, fixed-Tick counter, input
queue, physics adapter, resource resolver, and deterministic event queue. It
has a stable `session:*` ID and a monotonic message sequence. It transitions
only through the documented state machine:

```text
stopped -> starting -> playing <-> paused -> stopping -> stopped
                               |-> stepping -> paused
                               |-> reloading -> playing/paused
                               |-> failed
```

`pause` stops fixed-Tick advancement without destroying the session. `step`
advances exactly one fixed Tick in the same world and returns to `paused`.
`restart` creates a new session generation and reports it. `reload` declares
whether authoritative state was migrated or restarted; presentation must not
label a replay-from-zero operation as resume.

Input is represented as semantic actions and assigned a target fixed Tick.
Window key codes, pointer handles, DOM nodes, winit device IDs, and physical
addresses do not cross the protocol.

The authoritative world publishes disposable projections:

- `RenderSnapshot` — cameras, stable drawable IDs, transforms, layers and
  stable asset references;
- `AudioEvent` — one-shot/control event using stable clips and buses;
- `DebugSnapshot` — watches, diagnostics, system trace and budgets;
- `PhysicsEvent` — enter/stay/exit facts using stable object/collider IDs.

Studio Game view and exported Player consume the same projection schema and
resource resolver. Scene view consumes the same render projection while adding
editor-only grid, picking, selection and gizmo overlays. The DOM may host the
canvas and IDE chrome but cannot be the game renderer.

The native Preview Host is an isolated child process. It performs a versioned
handshake, owns the native surface/device, accepts session commands and input,
publishes frames/observations, and reports crash/exit. Studio survives Preview
Host failure and offers an explicit restart without mutating project files.

## Authority and determinism

- Project files remain the durable authority.
- Runtime state is authoritative only for the lifetime of a session and can be
  reproduced from project version, seed, fixed-Tick input log and approved
  nondeterminism policy.
- A resumed live world must not overwrite the authored Scene library. The
  native request carries the current `scene` separately; `loadScene`, including
  same-Scene restart, clones authored defaults and applies only its explicit
  transfer overrides. Source fixtures outside the normal Scene directory are
  loaded from their own file, not seeded from an already-mutated live snapshot.
- Render and audio are presentation projections and cannot mutate game state.
- Physics advances only in the fixed physics phase and emits queued immutable
  events for later script delivery.
- `sequence` orders transport messages; `tick` orders authoritative facts.
- Missing or mismatched protocol, capability, resource hash or generation is a
  structured failure, never a silent fallback.

## AI and human parity

Studio controls and Engine MCP call the same session service. MCP uses stable
session, object, component, collider, asset and watch IDs. It may start, pause,
resume, step, stop, restart, inspect and capture evidence without clicking the
Studio DOM. Destructive durable changes still use ChangeSets; transient runtime
controls are audited session commands.

## Consequences

### Round 05 replayable session evidence

`runtime.export_input_log` records a successful paused session's authored
starting Scene, seed, consumed semantic inputs (including earlier batches),
commands, controls, final Tick/state hash and source revision. Session ID,
generation and expected Tick must match. Records are content-addressed local
derived artifacts governed by `schemas/runtime-input-log.schema.json`, not
game source and not a replacement for reviewed release replays. The conservative
revision covers non-local project files; agent/credential/output state is
excluded. Authoring-input changes seen by a runtime batch invalidate the recipe,
even if later reverted. Batch checks reuse already-read Scene/Prefab/module/
manifest inputs; they do not rescan all media files on each live Tick. Full
content-revision checks run at recording start, export and log loading.
Unsupported resumed snapshots or presentation reloads do not claim
complete recording.

`runtime.compare_player` accepts that ID, a replay file or an explicit recipe;
a checkpoint label alone fails. Recorded recipes cannot be overridden. Missing,
changed or stale logs fail. Both Studio and independent packaged Player execute
at most 200 Ticks per native request, up to 10000 Ticks total, without relaxing
native memory or deadlines. Player continuation carries only its own prior
world/random/events/pending lifecycle/contacts; the Studio world is never injected into Player.
The tool verifies the recorded final state and aggregates per-batch audio
events before comparing actual observations. Final snapshots are not claimed
to contain the full replay history. Reachable Prefab definitions must be in the
package and supplied to all Player paths, not merely listed in a build report.

### Round 05 bounded paused advancement

`runtime.advance_ticks` advances an already paused session by 1–200 fixed Ticks
and returns to paused, without starting the live playback timer. Requests carry
the observed session ID, generation and expected starting Tick; a conflict
rejects stale or duplicate advancement before mutation. This is not restart or
replay-from-zero. Existing `step` still means exactly one Tick; `resume` still
starts live playback. Per-batch project budgets and native execution deadlines
remain unchanged. Results retain every snapshot in the requested batch; they
do not claim to contain earlier batches' history. Queued future inputs, Scene,
random state, pending events, pending lifecycle and physics contacts carry forward as in ordinary
session stepping. The acceptance slice compares all concatenated snapshots
against continuous execution and tests stale/retry rejection, no live timer,
and real Engine MCP use.

### Round 05 late-phase lifecycle continuation

Systems scheduled after `engine:post-update` may enqueue semantic lifecycle
operations. These remain due at the next post-update, not at a request boundary.
`pendingLifecycle` is an ordered private host-continuation value containing only
operation kinds and semantic payloads (spawn/destroy/enabled/visible/load-scene).
Studio sessions, one-Tick native Player execution and bounded independent Player
replays carry their own returned queue forward. Stop/restart clears it. It is
not an MCP authoring command, public renderer handle, or durable game authority.
Player continuation fails when this required field is missing; malformed queue
entries fail explicitly. The schedule and continuous-run snapshot timing remain
unchanged. Tests compare every split/continuous snapshot and cover late Scene
switches, UI visibility, lifecycle reset and actual Player stepping.

### Round 05 Scene replacement cleanup

Scene replacement validates the destination and transfer overrides before
destroying outgoing Behavior bindings. It invokes their existing `onDestroy`
hook in stable object/module order, including enabled Behavior components on
disabled objects, then starts the new Scene. This also applies to same-Scene
restart; bounded request boundaries do not themselves destroy a world.
Behavior-owned audio can therefore emit a stop before the next instance starts.
This is a lifecycle implementation correction, not an audio-device dependency
or hidden global state. The native regression covers ordering, same-Scene
restart, invalid destinations and continuous/single-Tick event equivalence.

### Round 05 bounded debug-history storage

Fixed-Tick scene snapshots are immutable observation records, not live script
state. The native script host retains their serialized JSON in a private,
64 MiB-capped history buffer and decodes the complete ordered records before
returning the existing snapshot protocol. The sink is captured by the trusted
prelude and removed from the global object before project modules load. It has
no filesystem, network, process, clock or random capability. Exceeding the
history cap fails explicitly with `SCRIPT_SNAPSHOT_BUDGET_EXCEEDED`; it never
silently samples or discards snapshots. The buffer is detached on successful
and failed runs, and reset before each request.

This avoids charging hundreds of historical JavaScript object graphs against
the live gameplay heap. Project memory/instruction/event limits and the 25/30
second execution guards are unchanged. Total native process memory is not the
same metric as the interpreter heap. Snapshot hashes, JSON shape, Tick count,
Scene transitions and replay semantics must remain identical. P18 runs native
history completeness/privacy/budget/reset tests; P30 retains checkpoint parity.

- P23 must replace `StudioCommandRegistry`'s bounded-run metadata with a real
  session client rather than layering another UI state on it.
- Player and Studio may use different windows but not different world,
  resource, physics, or projection semantics.
- Headless tests can omit GPU/audio devices while consuming the same projection
  messages and hashes.
- Adapters can be replaced without changing public project or MCP IDs.
- Protocol version negotiation and crash recovery become release gates.
