# ADR 0002: Language and protocol boundaries

Status: Accepted

## Decision

Rust owns deterministic execution, scheduling, state transitions, resource
loading, rendering adapters, snapshots, and replay. TypeScript owns Studio,
Codex orchestration, developer workflows, and high-level tool composition. WGSL
is used for shaders.

Neither Rust nor TypeScript declarations are the cross-boundary authority. JSON
Schema defines Game IR and tool contracts; generated bindings and runtime
validators consume those schemas. JSON-RPC is the inspectable MVP transport.

## Consequences

- Cross-language APIs remain small, explicit, and versioned.
- Protocol fixtures must test Rust and TypeScript compatibility.
- A binary transport may be added internally later without replacing the public
  semantic contract.
