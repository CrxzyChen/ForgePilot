# ADR 0013: Studio manages Codex; the engine exposes MCP tools

- Status: Accepted
- Date: 2026-09-02

## Decision

Studio integrates Codex through the official App Server protocol and manages a
pinned compatible sidecar as part of the product installation or through a
verified Studio-owned install/update channel. A normal user does not install a
global Codex CLI or Node.js. Studio owns authentication UI, process lifecycle,
project working directory, streamed events, approvals, version compatibility,
and crash recovery.

Each generated game project includes root `AGENTS.md`, project-scoped
`.codex/config.toml`, and workflows under `.agents/skills`. Studio supplies an
`ai-game-engine` MCP server for semantic project queries and edits, runtime
debugging, deterministic tests/replays, asset jobs, and builds.

The App Server and MCP protocol are orchestration boundaries, not sources of
game truth. Mutating MCP tools adapt to the same Command Registry used by human
UI actions. AI-originated writes still produce hash-bound ChangeSets and pass
preview, validation, explicit approval, atomic application, test, audit, and
rollback.

The integration follows the official
[Codex App Server](https://developers.openai.com/codex/app-server),
[MCP](https://developers.openai.com/codex/mcp),
[AGENTS.md](https://developers.openai.com/codex/guides/agents-md), and
[skills](https://developers.openai.com/codex/skills) contracts.

## Consequences

Codex can operate the engine directly instead of imitating a human through the
Studio UI. Projects remain understandable and usable by Codex outside a single
open Studio window because their instructions and workflows are files.

Studio must ship or securely manage a compatible sidecar and generated protocol
bindings, handle account/network limitations honestly, and prevent tool-call
replay after crashes. MCP tools require stable schemas, semantic IDs,
idempotency, path containment, permissions, and structured diagnostics.
