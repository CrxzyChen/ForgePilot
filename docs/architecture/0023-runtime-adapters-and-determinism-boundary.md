# ADR 0023: mature runtime adapters behind semantic engine contracts

## Status

Accepted for Round 04 implementation.

## Decision

Round 04 will not invent general rendering, physics, image, audio, or model
algorithms. It integrates mature libraries behind engine-owned, versioned
semantic contracts:

- wgpu/winit remain the graphics, window, and device boundary;
- Rapier 2D/3D is the preferred first rigid-body and collision adapter;
- established Rust image decoding and game-audio libraries are selected by a
  short conformance spike before P24 implementation;
- a maintained glTF loader is preferred for the P25 static-mesh slice.

Library-specific handles, pointer identities, array indexes, body IDs, texture
views, audio sink IDs, device IDs, and filesystem absolute paths remain private
to an adapter. Public messages use stable semantic project IDs and session
generations.

## Determinism policy

The engine promises deterministic authoritative results only under a recorded
compatibility tuple:

```text
engine version + protocol version + project hash + capability versions
+ adapter/version tuple + target policy + fixed Tick + seed + input log
```

Physics uses a fixed step, stable object/collider insertion order, explicit
floating-point/target policy, deterministic event sorting, and snapshot hash
coverage. If cross-platform bitwise determinism is not proven, the manifest
must state the supported equivalence policy; the product cannot silently claim
it.

Image decode, GPU rendering, and audio output are presentation paths. Their
resource hashes and projection commands are reproducible, while device-level
pixels/audio timing use visual/audio tolerance tests rather than entering the
authoritative gameplay hash.

## Adapter conformance

Every adapter supplies:

- capability and version discovery;
- deterministic construction from stable sorted descriptions;
- explicit lifecycle and resource release;
- structured diagnostics without private handles;
- headless or null-device operation where meaningful;
- success, missing-resource, invalid-data, budget and recovery tests;
- MCP/Skill documentation through the owning engine capability;
- license and packaged-dependency metadata.

## Consequences

- Adding a dependency does not make a capability complete; its vertical slice
  must pass the Round 04 per-feature checklist.
- Adapters are replaceable implementation details, not project formats.
- The Preview Host contains GPU/audio/physics failures so Studio and project
  files remain recoverable.
- The release evidence records exact adapter versions and target policy.
