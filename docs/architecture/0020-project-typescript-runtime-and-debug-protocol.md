# ADR 0020: Project TypeScript runtime and semantic debug protocol

- Status: Accepted and implemented for Round 03 Alpha
- Date: 2026-09-03
- Supersedes the spike-only boundary in ADR 0016

## Decision

Studio compiles every module declared by `scripts/runtime.json` with the bundled
TypeScript compiler to ES2022 CommonJS. The generated code, source-map hash,
source hash, compiler identity, SDK version, engine range, and output hash form
a reproducible bundle envelope. TypeScript and JSON project files remain the
only authority; JavaScript is never written back into the project.

`project-script-host` embeds QuickJS and is shipped with Studio and player
packages. It has no Node.js, filesystem, network, process, wall clock, ambient
randomness, or dynamic native-module access. Heap and stack are native limits;
callback/Event operation budgets and a hard native interruption deadline bound
execution. Project data crosses the process boundary only as JSON.

The runtime visits the manifest schedule in order. Behavior instances are
ordered by object ID then module ID. Systems are ordered by phase, declared
order, and System ID. Authoritative mutation is allowed in lifecycle, input,
Command, fixed update, collision, Event, disable, and destroy callbacks.
`onFrame` receives a read-only context and mutation fails with a structured
diagnostic.

Events are cloned, deeply frozen, queued, and delivered after their producer
phase. Events emitted while delivering an Event are deferred until the next
Tick. Timeline records include producer and consumer stable IDs. Commands and
Events must be declared in `scripts/runtime.json`; their payloads are validated
against project JSON Schemas. Script output is revalidated against registered
Component schemas before it is accepted.

The debug protocol is semantic and serializable. Breakpoints address module,
System, object, and lifecycle hook rather than VM instruction handles. Each run
returns source diagnostics, Event Timeline, System trace, state watches,
snapshots, per-Tick state hashes, resource budgets, and pause location. A
replay may carry expected Tick hashes; mismatch produces
`REPLAY_HASH_MISMATCH`. Authoritative hot reload recompiles and restarts;
presentation-only preservation is reserved by the manifest policy.

## Consequences

- Studio, Engine MCP, tests, and exported players can share the same native
  execution boundary without Node.js in a player.
- Re-running from the initial Scene is the Alpha implementation of pause/step,
  so deterministic state is reproducible and no opaque VM heap becomes project
  authority.
- The `instructionsPerTick` field is enforced as observable SDK operations,
  with a native wall-time interrupt as the fail-safe. Exact QuickJS bytecode
  instruction metering remains a documented Alpha limitation.
- Source line reporting maps QuickJS generated lines back to the declared
  project source identity. Full column-accurate source-map remapping remains a
  post-Alpha enhancement.
