# ADR 0008: Codex plans; the control plane commits

- Status: Accepted
- Date: 2026-09-02

## Decision

Studio embeds the official open-source Codex App Server over its default JSONL
stdio transport. The client performs the required `initialize` / `initialized`
handshake, starts workspace-scoped threads and turns, and exposes streamed
notifications without translating them into UI mouse or keyboard actions.
Generated App Server TypeScript bindings are committed and checked for drift
against the installed Codex CLI.

Codex runs as a read-only planner. A natural-language request becomes a typed
patch proposal, then `KernelControlService` independently reads the authoritative
Schema and Game IR, applies the patch in memory, and validates it through the
Rust kernel. Planning never writes a project file.

Mutation is a separate control-plane capability. A ChangeSet must still match
its base hash and receive a one-use human approval grant before an atomic write.
Post-write validation restores the original bytes on failure. Explicit rollback
is allowed only while the applied hash still matches, preventing newer human or
agent work from being overwritten.

The tool surface is newline-delimited JSON and intentionally omits a `jsonrpc`
header to match App Server conventions. Stable methods cover schema/project/world
queries, plan/validate/approve/apply/rollback, simulation run/snapshot/compare,
failure explanation, and audit retrieval.

## Consequences

Model output is never trusted as proof that a change is valid or approved. The
same control service can be called by the future React Studio, tests, or another
agent harness. Project paths remain inside the configured workspace, write
access is explicit, every mutation is auditable, and failures preserve a valid
project. Live model calls remain optional; protocol handshake and transactional
behavior are testable offline without spending inference tokens.

The integration follows the official Codex App Server lifecycle and transport
contract: <https://developers.openai.com/codex/app-server>.
