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

When discovery exposes `build.verify_package`, pass the built `profile` and
`expectedZipSha256` from `build.read_report`. The engine extracts that exact ZIP,
checks its contents and trusted Player, performs startup self-check and captures
five native GPU frames. It accepts no executable path or arbitrary arguments.
Inspect the returned PNG and retain `verificationId`; recover its receipt with
`build.read_verification({id})` instead of launching again just to recover feedback.

Old reports without `projectRevision`, changed source, or a changed installed
Player require a new build. Verification never silently rebuilds. The receipt
is bounded startup evidence, not gameplay completion, audible review, network
isolation or independent clean-machine acceptance. Keep those checks separate.
