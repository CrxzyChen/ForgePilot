# P31 asset panel refresh backpressure

## 2026-09-06 regression

The original Studio resource panel retained the preview state captured when
its one-second interval was created. Each poll requested every candidate again,
including synchronous audio inspection in the Electron main process. Slow list
requests could also overlap. This explains a reproducible source of growing
input/Goal notification delay; it is not a claim that every possible stall has
the same cause.

The real Electron WAV/MP3 gate was extended **before the renderer fix**. Both
candidates decoded and played successfully, but each was requested **five times**
over the observation interval. The new `previewsLoadedOnce` assertion failed.

## Fix and executable evidence

- `asset-panel-requests.ts` owns one workspace-scoped, hash-bound preview cache.
  Only one preview IPC is outstanding; successful results are reused across
  polls and panel re-entry. Changed hashes invalidate old URLs.
- Hidden panels stop issuing queued preview requests. Disposed workspaces
  ignore late responses; Workbench is keyed by project root.
- Failed previews have a 30-second local retry cooldown. This is a **local
  preview read**, not a provider-generation retry or a paid operation.
- Job refreshes are single-flight. Concurrent manual requests coalesce into
  one trailing fresh read; recurring polling schedules from completion.
- No credentials, generation approval, candidate review, import validation,
  audit, rollback, or authoritative project files are bypassed or modified.
- The Midnight Workshop shell, tokens, typography and component grammar are
  unchanged, following the Studio UI maintenance skill.

Verified commands:

1. `node scripts/check-p31-asset-panel-requests.ts`: slow IPC serialization,
   cached images/audio, changed/new candidates, removal, panel re-entry,
   bounded failure retry, disposal, trailing read, polling recovery all pass.
2. `npm run check:p31:candidate-audio`: real WAV and MP3 each requested **once**
   across multiple polls, both playable, external media still blocked by CSP.
3. `node scripts/check-p31-studio-candidate-review.ts`: all nine image previews,
   review actions, filter counts and unchanged project authority pass.
4. `node scripts/check-p15-ui-quality.ts`: 150% DPI, 960px viewport, keyboard /
   pointer resizing, source/Inspector/generation styles, focus, crash recovery,
   test feedback and P32 rejection/history/conflict controls pass. Evidence:
   `artifacts/p31-test-feedback-ui-2zoM8X` and
   `artifacts/p32-review-feedback-ui-fJwX0L`.
5. `npm run lint`, `npm run typecheck`, `npm run check:studio-ui-contract` pass.

The lifecycle unit gate is included in the normal P15 quality command, and
the repeated-preview assertion remains in both real candidate review gates.
Full regression/package qualification and owner installation are tracked below;
passing the focused gates alone does not mean the user's executable is updated.

## Delivery checkpoint

Full `npm run check` **passed** with package variant
`r5-resource-polling-check`, including P14–P21, native GPU/audio checks, three
examples repeated 100 times each, archive-extracted clean install and upgrade /
recovery / uninstall-preserves-user-data gates. The exact archive is
`AI-Game-Studio-0.3.0-preview.1-r5-resource-polling-check-win-x64.zip`, SHA-256
`87cb8897522a37332d15ce871c274b6d41bc6b6cd8c36b1374ca837792d8165e`, with
287 hashed content files plus the manifest itself. P32 progress, scoped authorization, recovery,
retry bounds, ChangeSet isolation and agent bridge checks also pass.
The previous `r5-confirm-review-check` full gate passed but predates this fix
and is not its release evidence.
The old owner Studio has exited normally after its close confirmation. The
original Copilot's latest turn was blocked on confirm wiring review; its source,
conversation, credentials and pending ChangeSet are retained.

The qualified archive has now been installed into the usual owner path
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-win-x64`; all 287
manifest hashes match before staging, after staging and after replacement.
The previous installation is recoverable at
`artifacts/studio-windows/AI-Game-Studio-0.3.0-preview.1-r5-pre-resource-polling-20260906-135915-cf7207f4-win-x64`.
No game source or credential store was changed by the installation.
Actual installed-program gates **pass** in
`artifacts/r5-polling-delivery-grO5uf/summary.json`: P15 at 150% DPI and 960px,
all nine image previews requested once, and four original-game replay cases
match old/new runtimes exactly (bundle, scene, state, snapshots and audio).
The supervisor did not mutate the original project. Native Studio startup and
the recent-project entry reopened the original Tank directory with visible
project-load progress; the approved confirmation wiring is ready for the
original Copilot to apply.
