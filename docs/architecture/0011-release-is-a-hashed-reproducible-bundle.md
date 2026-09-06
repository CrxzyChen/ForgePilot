# ADR 0011: Release is a hashed reproducible bundle

- Status: Accepted
- Date: 2026-09-02

## Decision

The Windows MVP is built only through `npm run package:windows`. The command
uses `npm ci`-compatible lock data, Cargo `--locked`, Rust 1.91.1, release-mode
native binaries, and the production Studio build. It creates a versioned folder
and ZIP plus a SHA-256 sidecar. `BUILD-MANIFEST.json` records the toolchain and
hash of every payload file without timestamps. Two builds must reproduce the
native binaries, protocol, Game IR, source, launchers, and documentation under
one `reproducibleCoreHash`, and must retain the configured Studio application
build ID. Vinext currently salts internal production chunks; those filenames
are integrity-hashed per release and functionally smoke-tested instead of being
claimed as byte-identical across builds.

The bundle includes Runtime, kernel CLI, Studio, its local control bridge,
generated Codex protocol types, Game IR schema, the complete sample/replay, and
user documentation. Node dependencies are installed from `package-lock.json` on
the first Studio launch rather than embedding an opaque `node_modules` tree.

## Consequences

Release contents are inspectable and individually verifiable. The stable core
is byte-reproducible under the pinned toolchains, while the framework-generated
Studio chunk graph is reproducibly buildable and independently checksummed. The native game
runs without a compiler. Studio needs Node and network access for its first
locked dependency install; natural-language planning additionally needs Codex
CLI. A fully offline Studio installer remains outside this MVP.
