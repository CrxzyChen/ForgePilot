# Third-party notices

ForgePilot's original code is licensed under Apache-2.0 (see LICENSE).
Third-party code, generated upstream protocol bindings, dependencies and assets
retain their own licenses; the root license does not relicense them.

## OpenAI Codex 0.152.1

Studio distributes the pinned Codex CLI/App Server as a separate, unmodified
sidecar. The generated/codex-app-server directory contains protocol bindings
generated from that version; ForgePilot's connection layer is separate code.

- Upstream: https://github.com/openai/codex/tree/rust-v0.152.1
- License: third-party/codex/LICENSE (Apache-2.0)
- Upstream attribution: third-party/codex/NOTICE (preserved verbatim)
- Source license: https://raw.githubusercontent.com/openai/codex/rust-v0.152.1/LICENSE
- Source notice: https://raw.githubusercontent.com/openai/codex/rust-v0.152.1/NOTICE

The upstream NOTICE identifies Ratatui-derived MIT-licensed code. Its copyright
attribution remains in that NOTICE; the MIT terms are included alongside it.
Do not remove upstream attribution or license text when redistributing.
If modifying upstream code in future, prominently identify modified files.

The Studio packager includes these documents in resources/app and includes
Codex's LICENSE and NOTICE in resources/app/vendor/codex. Electron's existing
license files at the distribution root are not overwritten.

## Other dependencies

This notice addresses the bundled Codex integration; it is not an exhaustive
license inventory of all transitive npm, Rust or Electron dependencies.
Preserve those components' license and attribution files when redistributing.
Generated media may also have provider-specific usage terms. This license does
not grant OpenAI trademarks, model weights, or access to paid model services.
