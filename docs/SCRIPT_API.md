# AI Game Studio TypeScript API — 0.2.0 Alpha

Project scripts are declared in `scripts/runtime.json` and import types and
helpers from `@aigame/sdk`. The generated `scripts/game-sdk.d.ts` in every new
project is the editor-readable API contract.

For an older project, Engine MCP `script.api` returns the installed engine's
canonical SDK, its hash, and `projectMatches`. Synchronize stale declarations
with a reviewed ChangeSet rather than assuming an API is absent. See
`docs/testing/P31-RUNTIME-ASSERTIONS.md` for executable test assertions;
descriptive strings do not validate gameplay.

## Behavior lifecycle

Attach a behavior source to an object with the `core:script` Component. Its
`data.path` must match a manifest module whose `kind` is `behavior`.

```ts
import { defineBehavior } from '@aigame/sdk';

export default defineBehavior({
  onStart(context) {},
  onEnable(context) {},
  onFixedUpdate(context) {},
  onFrame(context) {},
  onInput(action, value, context) {},
  onCommand(command, context) {},
  onEvent(event, context) {},
  onCollisionEnter(otherObject, context) {},
  onCollisionExit(otherObject, context) {},
  onDisable(context) {},
  onDestroy(context) {},
});
```

`onFixedUpdate` runs at `settings/project.json.tickRate` and may update
registered Component data. `onFrame` is presentation-only and has no mutable
API. Use fixed-Tick state for gameplay and frame interpolation only for visual
presentation.

## Context

- `tick`, `deltaSeconds`, `objectId`: deterministic execution identity.
- `get(component)` / `get(object, component)`: return a copied read-only value.
- `set(component, value)` / `set(object, component, value)`: replace registered
  Component data in authoritative callbacks.
- `query(componentTypes)`: stable-ID-ordered enabled objects containing all
  requested Components.
- `emit(eventId, payload)`: enqueue an immutable declared Event.
- `spawn(object)`: queue a complete, schema-valid object with an explicit stable
  semantic ID. It becomes visible at `engine:post-update`.
- `spawnPrefab(prefabPathOrId, options)`: materialize a packaged Prefab with an
  explicit stable root ID, deterministic child/Component IDs, optional
  Transform2D position, and typed Component overrides.
  Each override shallow-merges fields into source data. Keep shared defaults in
  the Prefab and pass only instance differences; nested values replace a whole
  field, rather than deep-merging it.
- `destroy(objectId)`: queue an object subtree for deterministic removal and run
  `onDestroy` before removal.
- `setEnabled(objectId, enabled)` / `setVisible(objectId, visible)`: queue
  runtime lifecycle or presentation visibility changes. Enable transitions call
  `onEnable`/`onDisable` as appropriate.
- `loadScene(scenePathOrId, options?)`: switch at `engine:post-update` to another
  packaged Scene. Optional `componentOverrides: [{ objectId, componentId, data }]`
  addresses destination semantic IDs and shallow-merges selected data fields
  before its `onStart` / `onEnable`. Unspecified destination fields and all IDs
  remain unchanged. Nested values replace a whole field. Invalid shapes or
  duplicate targets report `SCRIPT_SCENE_OVERRIDE_INVALID`; unavailable targets
  report `SCRIPT_SCENE_OVERRIDE_TARGET_NOT_FOUND`. No partial destination switch
  is committed on these errors. Calls without options retain authored defaults.
  After destination validation, enabled Behavior components on all outgoing
  objects (including disabled objects) receive `onDestroy` in stable ID order,
  before destination `onStart`. Same-Scene restart follows this path too.
  Release Behavior-owned looping audio with `stopAudio(instanceId, busId)` there.
  `stopAudio`, `pauseAudio`, and `resumeAudio` accept an optional second Bus ID.
  For custom buses, pass the same ID used by `playAudio`; omission preserves the
  legacy `audio:bus/master` default. No hidden instance history or device timing
  is inferred across script-host requests. Empty or non-string buses fail before
  emitting an event. Use `script.api` to retrieve the installed SDK and migrate
  project typings through a reviewed ChangeSet, not a direct file overwrite.
  Continuous and one-Tick resumed execution preserve the same play/stop order.
- `randomU32()`: deterministic seeded randomness. `Math.random()` is rejected.

Lifecycle operations are ordered by their stable behavior/System execution and
request sequence. Spawn never invents an ID, and a duplicate or unavailable ID
is a structured runtime error. Snapshots and traces include the active Scene and
queued/applied lifecycle records.

Mutable module/global variables are not saved game state: the script host can
recreate modules between requests. Store authoritative values in Components.
To preserve session preferences across menu/play/restart, pass only those fields
to the destination via `loadScene`; the transferred values then enter Scene
snapshots and hashes. This does not write project files, save to disk, or retain
state after a new runtime session. Validate both continuous replay and resumed
single-Tick execution (`check:p21:tank-enablers` includes that regression).

## Text and UI

`render:text2d` provides dependency-free world-space text with `text`,
world-unit `fontSize`, `color`, and `align`. `ui:text` uses the same fields with
`core:ui-transform`; its font size is pixel-oriented and its anchor maps to the
viewport. The Alpha player renders a deterministic built-in bitmap font for
ASCII letters, digits, and basic punctuation, so scores, instructions, and game
state remain available in independent Windows builds without a system font.
The volume-control glyphs `%`, `[` and `]` are supported as well; unsupported
characters still render the visible question-mark fallback.

## Systems

Systems are module exports registered in `scripts/runtime.json` with a phase,
integer order, and Component query. `context.objects` is the stable ordered
query result. Equal phase/order values are resolved by System ID.

```ts
export const movement = defineSystem({
  onFixedUpdate(context) {
    for (const object of context.objects) {
      const transform = context.get(object, 'core:transform2d');
      // Replace the complete schema-valid value with context.set(...).
    }
  },
});
```

## Commands, Events, and replay

Each Command/Event declaration names a project JSON payload Schema. Commands
enter at `engine:input`; Events are delivered at
`engine:gameplay-events`. Event delivery is non-reentrant: new Events emitted
by a consumer are delivered on the next Tick.

A replay JSON may contain `ticks`, `seed`, `commands`, `inputs`, `collisions`,
`controls`, and `expectedHashes`. Expected hashes address `{ tick,
stateHash }`. Use the same file from Studio, Engine MCP, tests, and CI.

## Debugging

Use Studio's Game Runtime document, Problems, Profiler, and Event Timeline. The
same information is exposed to Codex through `runtime.read_trace`.
`debug.breakpoint.set` addresses stable module/System/object IDs and a hook;
`debug.watch.set` records a Scene state path on each snapshot. Runtime failures
include Tick, phase, System, object, module, project file, line, stack, and
relevant Scene state.

Hot reload uses `restart-authoritative` by default: source is recompiled and the
Scene reruns from Tick 0. This prevents an unversioned VM heap from becoming
game state.

## Runtime resource budgets

`scripts/runtime.json` keeps explicit memory, stack, instruction-per-Tick, and
Event-per-Tick limits. New projects reserve 64 MiB of QuickJS memory so a
medium Scene can retain deterministic per-Tick snapshots and Timeline evidence
for normal headless replays. Projects may lower or raise that value through a
reviewed ChangeSet; the runtime always enforces the project-declared limit.

## Transform2D angle contract

`core:transform2d.rotation` is in **degrees**, counter-clockwise in the Y-up
world. `0` preserves the source image orientation. For art pointing upward,
use `(Math.atan2(direction.y, direction.x) - Math.PI / 2) * 180 / Math.PI`.
Up/down/left/right therefore use `0 / -180 / 90 / -90` degrees. Copy the
angle at projectile spawn; subsequent tank turns must not change that projectile.
`component.types` exposes `unit: "degrees"` on the rotation field. Never infer
radians from a small numeric value: 1.57 is a legitimate angle in degrees.
Sprite vertices rotate around their pivot; GPU shaders consume radians only
after the renderer converts the public degree value. Snapshot equality alone
does not establish visual correctness: verify asymmetric sprites in GPU frames.
