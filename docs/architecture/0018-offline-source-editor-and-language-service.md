# ADR 0018: Offline source editor and project language service

- Status: Accepted
- Date: 2026-09-03

## Decision

Studio embeds Monaco and its editor, JSON, and TypeScript workers in the desktop
package. It does not load an editor or language worker from a CDN. TypeScript,
JSON, WGSL, Markdown, and plain text share one central document type. The editor
provides completion, hover, definition, references, rename, symbols, formatting,
markers, keyboard editing, and local undo; Studio owns file persistence,
conflict checks, project history, and audit.

The main-process `StudioLanguageService` supplies headless project search and
structured diagnostics. Project-wide replacement is a single semantic
transaction in `StudioCommandRegistry`, so it can be previewed by Codex,
audited, undone, and redone. Monaco markers and headless diagnostics both use
project-relative path, line, and column locations.

Generated `scripts/game-sdk.d.ts` is part of Empty projects and the same API is
registered as a Monaco extra library. The `typescript` compiler package is
external to the Electron main bundle and copied into the standalone Studio;
this avoids bundler rewrites of Node platform code while preserving offline
diagnostics.

Git workspace Diff and Codex ChangeSet Diff use Monaco's read-only side-by-side
editor. Neither Diff surface mutates project authority.

## Security consequence

Monaco positions view lines with inline `style` attributes. The renderer CSP
therefore permits only inline style attributes via `style-src-attr
'unsafe-inline'`; scripts remain `script-src 'self'`, workers remain
`worker-src 'self'`, and network connections remain disabled.
