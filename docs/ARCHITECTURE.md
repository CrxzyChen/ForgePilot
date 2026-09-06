# MVP architecture

> Historical P0-P13 architecture. The Round 03 production boundary is defined
> by `rounds/ROUND-03-GENERAL-AI-STUDIO.md`, `PROJECT_FORMAT.md`, and
> `ENGINE_MCP_AND_SKILLS.md`.

```text
Natural-language task
        │
        ▼
Codex App Server ──► typed ChangeSet ──► human approval
                                             │
                                             ▼
Game IR JSON ◄── atomic apply / rollback ─ Control service
     │                                       │
     ▼                                       ▼
deterministic Rust kernel ◄────────── headless validation/replay
     │
     ├──► canonical snapshot + event log + state hash
     │
     └──► read-only wgpu projection ──► Windows Runtime
```

Game IR is the only authored source of truth. Schema-generated Rust and
TypeScript types meet at JSON files and JSON-RPC; renderer handles, Studio UI
state, and Codex conversation state are never persisted as gameplay authority.

The Rust kernel uses fixed integer Ticks, seeded randomness, ordered maps, and a
stable Command → Movement → Production → Strategy → Interaction → Victory
schedule. The native renderer consumes immutable snapshots. The same project
therefore runs through a window, a CLI, WASI, a batch balance job, or the Studio
without changing simulation behavior.

The TypeScript control plane separates planning from mutation. Codex App Server
may inspect schema and world context and propose JSON Patch-like operations. A
candidate is previewed and validated before a human can issue a one-use approval
grant. Application is atomic and audited. Persistent transaction journals make
an interrupted write recoverable; hash checks prevent recovery or rollback from
overwriting newer work.

The MVP deliberately reuses wgpu/winit and does not implement graphics APIs,
modeling, animation, physics, audio codecs, or a general-purpose scene editor.
The AI-facing boundary remains stable even if those subsystems change later.
