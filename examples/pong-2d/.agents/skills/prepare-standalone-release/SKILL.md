---
name: prepare-standalone-release
description: Validate and package a standalone player-facing game build without Studio, Codex, source instructions, tests, caches, or credentials.
---

# Prepare standalone release

1. Run Project Doctor, project validation, deterministic replay suites, and the configured performance budget.
2. Inspect the release target and compute the transitively required runtime and asset set.
3. Build through `build.windows`, then read the machine-readable build report.
4. Reject any package containing Studio, Codex, AGENTS.md, Skills, provider configuration, credentials, tests, caches, drafts, or source-only assets.
5. Verify per-file hashes, license notices, provenance summary, clean-machine launch, save location, and uninstall/delete behavior.
