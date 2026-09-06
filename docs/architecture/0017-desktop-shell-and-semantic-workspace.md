# ADR 0017: Desktop shell and semantic workspace

- Status: Accepted
- Date: 2026-09-03

## Decision

AI Game Studio is an Electron desktop application with a frameless native
window. React renders the project manager and docked IDE shell, while all
filesystem, runtime, build, settings, credential, and Codex operations execute
in the main process behind a narrow typed preload API.

The central surface is a multi-document workspace. A Scene is one document
type, not the application itself. The left side owns navigation and project
trees, the right side switches Inspector and Copilot, and the bottom side owns
diagnostics and observations. Local editor state is persisted separately in
`.aigame/local/workspace.json`; it is never gameplay authority.

UI handlers do not implement game mutations directly. They call the same
`StudioCommandRegistry` used by Engine MCP and headless gates. Project files
remain the durable source of truth and mutations enter the common history and
audit path.

Global, project, and secret settings are deliberately separate. Project
settings are versioned files. User/Agent settings live in Electron `userData`.
Secret values are encrypted with Electron `safeStorage`; only opaque references
may appear in project/provider files. When platform encryption is unavailable,
Studio fails closed instead of writing plaintext.

## Consequences

- OS drag, resize, snap, minimize, maximize, and close behavior remain native.
- Renderer compromise cannot directly access Node.js or arbitrary paths.
- Human and Codex workflows can converge on a shared semantic command layer.
- The Electron renderer can be replaced without migrating project authority.
- Browser-only Studio remains useful for documentation, but is not the Round 03
  authoring product.
