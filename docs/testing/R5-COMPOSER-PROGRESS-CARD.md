# Composer-adjacent Goal / Plan card

Date: 2026-09-06. This supersedes the placement described by the earlier
conversation-layout follow-up, without changing R5's independent acceptance state.

## Behavior

- One compact Goal / Plan card sits immediately above the composer, after
  attachments and outside the conversation's scrolling content.
- Collapsed: status, objective/current-step summary, and applicable actions remain
  visible. Goal stop/resume/remove and Plan turn stop/retry reuse existing APIs
  and their existing restrictions.
- The disclosure button and action buttons are siblings. Operating a task does
  not accidentally toggle the card. Expansion is keyboard accessible and exposes
  `aria-expanded` / `aria-controls`.
- Expanded: the details scroll within a bounded height; per-section decorative
  frames were removed. Conversation following, reading-position preservation,
  history loading, and jump-to-bottom are unchanged.
- The accepted placement is recorded in `docs/design/STUDIO-UI-SYSTEM.md`.

## Verification and delivery

- `npm run typecheck` and `npm run check:studio-ui-contract`: passed.
- `npm run check:p15:quality`: passed in real Electron at the minimum window
  size and 150% scale. Assertions cover adjacency above composer, visible
  collapsed actions, objective summary, expansion, eight Plan states, seven dock
  layouts, and all previous conversation-scroll regressions.
- `npm run check` with `AIGAME_STUDIO_PACKAGE_VARIANT=composer-card`: exit 0,
  including packaged clean startup and installed-style lifecycle/data retention.
- Full log: `artifacts/r5-composer-card-check.log`.
- Initial screenshot evidence: `artifacts/p32-plan-status-ui-hB9a9n/`.
- Visual review: 9/10, no zero category; Midnight Workshop tokens and density
  retained, with the new progress card aligned to the composer.

Executable:
`D:/game-creator/artifacts/studio-windows/AI-Game-Studio-0.4.0-preview.1-composer-card-win-x64/AI Game Studio.exe`

ZIP SHA-256:
`2ce8b14d8244add622daa1cfb9e790050ad3df0a143a9ac72335c6e787d8bb36`

Save and close the older Studio before running this executable. This working-tree
preview has its own directory and does not overwrite the previous UI-fix build
or the immutable R5 clean-source candidate. No owner Tank files, provider
settings, or approval authority were modified; no paid generation was invoked.
