---
name: author-2d-scene
description: Compose a complete 2D Scene with camera, sprites, physics, input, audio, and viewport UI.
---

# Author a 2D Scene

Use only Component schemas returned by `component.types`. Treat Transform2D positions as continuous scene units unless the project defines explicit snapping. Keep simulation independent from camera, viewport, and frame rate; gameplay input uses semantic actions rather than physical keys.

Create one primary `render:camera2d`; its Transform2D position and `zoom`
define the same orthographic projection in Studio and Player. Prefer
`render:sprite2d` for shipped visuals. Reference a ready manifest asset by
stable ID, then set world-unit `size`, normalized `pivot`, `tint`, `filter`,
`layer`, and optional pixel `atlasRegion`. Never embed a texture or native
renderer handle in Scene JSON.

For physical interaction, combine `physics:collider2d` with an optional
`physics:rigidbody2d`. Put authoritative responses in collision enter/stay/
exit hooks and verify object ID, Collider ID, phase, normal, contact point, and
Tick from the runtime trace. Do not manufacture collision events as inputs.

Prefer reusable Prefabs for repeated object graphs. After the ChangeSet is approved, validate object references and run a deterministic behavior test when gameplay changed.

Use `render:text2d` for world labels and `ui:text`, `ui:image`, and `ui:button`
with `core:ui-transform` for viewport-anchored menu, HUD, pause, win, and lose
states. Declare physical bindings in `input/actions.json`; UI buttons emit the
same semantic actions. Use `context.playAudio` with a ready manifest asset and
a bus from `audio/buses.json`. Validate the persistent Studio session and the
standalone reachable-resource package.

Resolve selections through `scene.object.pick` and stable object IDs. Apply viewport-equivalent edits with `scene.transform.move`, `scene.transform.rotate`, and `scene.transform.scale`; never guess array indexes or rewrite the whole Scene for a gizmo-sized change.
