# P17 general authoring evidence

- Date: 2026-09-03
- Machine gate: `npm run check:p17:authoring`
- Result: passed

The gate creates a fresh Empty 2D project and verifies nested multi-Scene
create, switch/startup, rename, duplicate, protected delete, undo, redo, and
reopen. It constructs and reparents stable-ID object hierarchies, rejects a
cycle, edits visibility/lock/order, registers a project Component schema,
validates Component fields, creates and instantiates a Prefab, applies and
reverts an override, records resource import settings, reimports a resource,
resolves incoming dependencies, discovers a missing reference, and repairs it
transactionally. Project Component registration also carries a custom
Inspector editor ID.

The AI path proposes a Scene mutation and proves that it remains an
`awaitingApproval` ChangeSet while the authoritative Scene stays unchanged.
The live MCP protocol lists the corresponding authoring tools. A production
TypeScript/Studio/template scan excludes game-specific demo vocabulary; the
legacy Rust/Game IR prototype is explicitly not claimed by this scan and
remains an open P17/P18 extraction item.

Visual inspection used a fresh Empty 3D project with Camera, primitive Mesh,
Material, and Directional Light. The frameless Studio correctly displayed the
Scene/object tree, perspective Scene document, 3D object selection, and
schema-driven Transform3D/Mesh/Material Inspector without a game-specific
editor mode.

Workbench inspection additionally covers Ctrl/Cmd object multi-select, primary
Inspector selection, registered/generic Inspector routing, separate Scene and
Game Runtime documents, and material, animation, Diff, resource, Prefab, and
build-report document routing. Human clean-install exit tests remain pending.
