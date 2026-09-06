---
name: author-gameplay-feature
description: Add or change runtime gameplay using project scripts, semantic engine tools, ChangeSets, and deterministic tests.
---

# Author a gameplay feature

Keep mutable gameplay/session values in Component data, not module/global
variables: script modules can be recreated between runtime requests. For Scene
transitions, the installed SDK supports `loadScene(scene, { componentOverrides:
[{ objectId, componentId, data }] })`. Address destination IDs and pass only the
data fields that must carry over (for example volume/mute). Patches shallow-merge
before destination `onStart`/`onEnable`; invalid or duplicate targets fail without
switching Scene. Nested values replace a field rather than deep-merge. This is
session transfer, not a disk save or automatic persistent-object system. Check
`script.api` before using it in an older project. Test transitions and compare a
continuous replay with paused/single-step or resumed execution.

1. Inspect the active Scene, relevant objects/Components, `scripts/runtime.json`, TypeScript modules, message payload Schemas, input actions, and existing tests.
2. State the intended player-visible behavior and deterministic acceptance scenario.
3. Discover registered Component schemas. Declare every behavior/System module, System phase/order/query, Command, and Event in `scripts/runtime.json`; never target renderer or ECS handles.
4. Put authoritative mutation only in `onStart`, `onEnable`, `onFixedUpdate`, input, Command/Event, collision, disable, destroy, or declared System callbacks. Keep `onFrame` presentation-only.
5. Use typed payload Schemas, stable IDs, fixed Tick, `context.randomU32()`, and queued Events. Create/remove runtime objects with `context.spawn` and `context.destroy`; use `context.setVisible` for UI state and `context.loadScene` for restart. Emit audio only through the versioned context methods and ready manifest assets.
6. Never use wall clock, ambient random, filesystem, network, process, dynamic native modules, synthetic collisions, or reentrant Event delivery.
7. Present the complete ChangeSet and expected effects before approval.
8. After approval, apply atomically and add or update a deterministic replay with per-Tick state hashes where relevant.
9. Run `runtime.run`, `runtime.read_trace`, `replay.run`, and the affected tests. Inspect Event Timeline, System trace, lifecycle operations, physics contacts, audio events, watches, budgets, and structured source diagnostics; roll back if invalid.
