# ADR 0007: Renderer is a snapshot projection

- Status: Accepted
- Date: 2026-09-02

## Decision

The native runtime converts winit keyboard events into typed kernel Commands.
The kernel advances one fixed Tick and emits a canonical `RuntimeSnapshot`.
`kernel-renderer` may only construct a `RenderScene` from that snapshot; wgpu
objects, surfaces, frame times, cursor positions, debug overlays, and asset
handles cannot enter authoritative simulation state.

Sprites are sorted by explicit layer, stable entity ID, and logical asset
handle before batching. The MVP palette atlas lives entirely in the renderer.
Screen-to-world conversion uses the same explicit orthographic camera used by
the shader, so picking does not depend on backend-native handles.

## Consequences

The 2D runtime can be replaced or disabled without changing replay results.
The P3 gate runs the same three-Tick input once through a presented wgpu surface
and once through the headless CLI, then requires identical canonical hashes.
GPU initialization and average submitted-frame time are reported as structured
JSON for automated checks and the future Studio performance panel.
