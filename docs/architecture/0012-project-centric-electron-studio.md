# ADR 0012: Studio is a project-centric Electron IDE

- Status: Accepted
- Date: 2026-09-02

## Decision

Studio becomes an Electron desktop application organized around separate game
project directories. A game project is simultaneously the Studio workspace,
the Codex working directory, the Git repository by default, and the source of a
standalone game build.

Electron renderer contains the familiar IDE surfaces: project tree, scene
hierarchy, viewport, inspector, code/IR editor, asset browser, preview, console,
tests, replay, build, and Codex Copilot. Electron main owns filesystem and child
process access behind typed safe IPC.

Human editor actions and AI MCP calls share one semantic Command Registry. Game
IR and project files stay authoritative; no opaque Electron or editor database
becomes gameplay source. Projects are created from versioned layered templates
and open with a runnable scene, project instructions, skills, tests, and build
configuration.

## Consequences

Studio can bundle its application runtime and remove Node/npm as end-user
requirements. Desktop process ownership makes native runtime launch, Codex
sidecar management, credential storage, recovery, and packaging explicit.

The browser Studio remains useful as a review/demo artifact but is not the
Round 02 product shell. Electron increases packaging, update, IPC security, and
clean-machine test responsibilities. A feature is not complete when it exists
only as a special case in the engine repository or requires terminal work that
has no Studio workflow.
