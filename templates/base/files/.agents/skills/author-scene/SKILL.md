---
name: author-scene
description: Create or restructure Scenes, object hierarchies, and Components in an AI Game Studio project.
---

# Author a Scene

Inspect `scene.list`, the target Scene, and `component.types` before editing. Choose Component types only from capabilities enabled in `project.aigame.json`.

Use stable object and Component IDs; use semantic `scene.*`, `scene.object.*`, and `scene.component.*` tools instead of editing array positions. Preserve parent relationships and reject hierarchy cycles. Scene creation, startup selection, visibility, locking, reparenting, duplication, and Component fields must remain reproducible in the authoritative files.

Submit all mutations as one coherent ChangeSet when they implement one intent. Explain the resulting hierarchy and expected diagnostics, then wait for human approval before apply. Validate the project and add a deterministic test when the Scene affects runtime behavior.
