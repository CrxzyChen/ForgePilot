---
name: author-3d-scene
description: Compose a 3D Scene with Transform3D, Camera3D, mesh, material, light, and collider Components.
---

# Author a 3D Scene

Use only Component schemas returned by `component.types`. Every visible 3D Scene needs a primary Camera3D and appropriate lighting; reference meshes, materials, and textures by project resource path rather than renderer handles.

For an imported static mesh, import a triangulated Wavefront OBJ asset, set `render:mesh3d.primitive` to `imported`, and set `render:mesh3d.mesh` to its stable asset ID. Set `render:material.texture` to a reviewed image asset ID. Both references must appear in `render.snapshot.payload.resources` and the reachable Windows package; a missing or invalid resource is an error, never a silent primitive fallback.

Keep simulation independent from frame rate and viewport. Prefer Prefabs for repeated object graphs. After the ChangeSet is approved, validate references and run a deterministic behavior test when gameplay changed.

Resolve ray-pick results through `scene.object.pick` and stable object IDs. Apply viewport-equivalent edits with `scene.transform.move`, `scene.transform.rotate`, and `scene.transform.scale`; never persist renderer handles or guess object array positions.
