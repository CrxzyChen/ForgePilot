# P29 bounded provider-error diagnostics — 2026-09-06

## Observed gap

Original Copilot's UI-navigation Job
`asset-job:5387ac2f-3cd6-4b5b-a88e-62b844a024d1` returned HTTP 400, one attempt,
no candidate and unknown cost. Its public numeric/model parameters match the
successful hit Job. The previous broker classified every HTTP 400 as invalid
parameters, without examining a safe error category. The actual provider cause
is still unknown; this document does not diagnose quota exhaustion.

The [official 400/401 guide](https://elevenlabs.io/docs/help-center/technical/api-error-code-400-or-401)
describes legacy error statuses including quota. The
[current error reference](https://elevenlabs.io/docs/eleven-api/resources/errors)
documents typed error codes. Only those finite identifiers are useful to this
boundary; raw provider text is not trusted.

## Red-to-green correction

A production-broker fixture returning HTTP 400 plus `detail.status=quota_exceeded`
failed with actual `invalid-parameter`, expected `quota`. After the correction
the same request reports quota, fixed guidance and retryable=false, preserving
one attempt, zero candidates, unknown cost and its durable identity. Reloaded
Job evidence retains the same safe reason. An unknown code remains explicitly
unresolved and cannot trigger a retry.

`readElevenLabsProviderFailure` bounds JSON to 16 KiB and one second; it copies
neither provider messages nor request IDs. Exact allowlist membership prevents
secret-bearing suffixes, prototype names, unknown strings or embedded messages
from becoming diagnostics. Non-JSON, malformed, oversize, stalled and errored
streams return no known reason. Cancellation cannot be overwritten by a late
failure. HTTP 408/504 ambiguity and server-failure handling are unchanged;
response text cannot grant a new retry allowance.

## Passing source checks

- `check:p29:media`: broker persistence/retry/idempotency/secret checks plus 12
  known diagnostic cases, hostile fields, body/latency bounds and cancel-during-
  read; all use isolated fixtures, no production provider calls.
- `check:p29:import`: reviewed atomic import, tamper rejection and exact rollback.
- `check:p29:agent`: compiled Engine MCP receives an actionable safe quota
  failure via the authenticated bridge; neither tool output nor stderr exposes
  the private response marker.
- `check:studio-ui-contract`: existing visual contract unchanged.

Aggregate `check:p29` passes. The fixed diagnostics/preflight baseline also
passes the complete `npm run check`, including clean install, upgrade and crash
recovery of archive `7dd822266c989d006abbcaf8189d143781372eb880c00290d3be73c599bb22a9`
(`r5-provider-diagnostics-check`). Owner installation and fresh production
execution remain separate checks. Historical failed Jobs, original game source,
credentials and provider policy were not modified.

## Prompt-length preflight follow-up

Read-only comparison found that the successful shooting/hit prompts contain
419/446 characters, whereas failed wall/UI prompts contain 474/506. The
[official sound-effect guide](https://elevenlabs.io/docs/help-center/product/core-capabilities/sound-effects/what-is-sound-effects)
documents a 450-character maximum. This is a concrete request incompatibility
and a plausible explanation, not retrospective proof of the discarded error
body. Neither the 0.7s duration nor missing credentials has been established as
the cause.

The first boundary test demonstrated that 451 characters were accepted locally.
The corrected adapter now exposes its limit through estimate/model metadata and
the MCP tool description. It rejects 451 before a new Job or outbound call;
450 ASCII or Unicode code points remain intact. Regeneration cannot reject the
old candidate when its combined prompt would be overlong. A queued pre-upgrade
451-character fixture fails before secret resolution, provider calls or attempt
increments, retaining its original prompt and idempotency key.

The earlier in-flight full regression overlapped the multi-part preflight edit
and stopped during compilation. It is not a complete pass or accepted package.
The subsequent fixed-source run passes, with the exact archive recorded above.
The subsequent combined AudioBus/provider full run also passes, producing
archive `ae576cfe0e623da2041a2ab517d93194c34244c81987e95c821723a8c286ccae`.
It is now owner-installed with all 287 content hashes checked and a recoverable
backup. Fresh production execution remains open; old HTTP 400 Jobs are not
rewritten or claimed diagnosed by these fixture results.
