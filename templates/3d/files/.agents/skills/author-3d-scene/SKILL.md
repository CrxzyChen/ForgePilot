---
name: author-3d-scene
description: Compose a 3D Scene with Transform3D, Camera3D, mesh, material, light, and collider Components.
---

# Author a 3D Scene

Use only Component schemas returned by `component.types`. Every visible 3D Scene needs a primary Camera3D and appropriate lighting; reference meshes, materials, and textures by project resource path rather than renderer handles.

Keep simulation independent from frame rate and viewport. Prefer Prefabs for repeated object graphs. After the ChangeSet is approved, validate references and run a deterministic behavior test when gameplay changed.

Resolve ray-pick results through `scene.object.pick` and stable object IDs. Apply viewport-equivalent edits with `scene.transform.move`, `scene.transform.rotate`, and `scene.transform.scale`; never persist renderer handles or guess object array positions.
