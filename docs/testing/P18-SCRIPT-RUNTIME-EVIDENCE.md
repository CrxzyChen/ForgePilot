# P18 script runtime evidence

- Gate: `npm run check:p18:runtime`
- Native host: `crates/script-host/src/bin/project-script-host.rs`
- Studio orchestrator: `studio/runtime/project-script-runtime.ts`
- Debug UI: Game Runtime document, Problems, Profiler, Event Timeline
- Engine MCP: runtime, replay, breakpoint, watch, trace, and hot-reload tools

The gate creates an Empty 2D project outside the repository, declares custom
Velocity and Stats Components, attaches a TypeScript behavior, registers a
query-based movement System, and declares typed Command/Event payload Schemas.
It verifies all eleven lifecycle/input/Event callbacks, stable System order,
non-reentrant typed Event delivery, Scene state mutation, watches, snapshots,
budgets, bundle provenance, Studio command routing, and Engine MCP discovery.

The authoritative run is repeated 101 times in independent native QuickJS
processes. Every run must produce the same per-Tick snapshots and final SHA-256
state hash. A semantic breakpoint must pause at the declared behavior hook.
A wrong replay hash must identify the failing Tick and snapshot phase. A
deliberately failing System must identify Tick, phase, System, matching object,
module, project source file, line, stack, and relevant Scene state. Invalid
typed Command payloads must fail before project code executes.

Machine evidence does not replace the Round 03 clean-install human journey.
