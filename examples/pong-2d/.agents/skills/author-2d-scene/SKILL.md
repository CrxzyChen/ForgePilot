---
name: author-2d-scene
description: Compose a 2D Scene with Transform2D, Camera2D, Shape2D, and Collider2D Components.
---

# Author a 2D Scene

Use only Component schemas returned by `component.types`. Treat Transform2D positions as continuous scene units unless the project defines explicit snapping. Keep simulation independent from camera, viewport, and frame rate; gameplay input uses semantic actions rather than physical keys.

Prefer reusable Prefabs for repeated object graphs. After the ChangeSet is approved, validate object references and run a deterministic behavior test when gameplay changed.

Resolve selections through `scene.object.pick` and stable object IDs. Apply viewport-equivalent edits with `scene.transform.move`, `scene.transform.rotate`, and `scene.transform.scale`; never guess array indexes or rewrite the whole Scene for a gizmo-sized change.
