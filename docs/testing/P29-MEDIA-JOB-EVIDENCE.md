# P29 media-job evidence

- Status: machine gate passed; independent human Journey B remains open
- Gate: `npm run check:p29:media`
- Agent bridge: `npm run check:p29:agent`
- UI contract: `npm run check:studio-ui-contract`
- Real Electron quality: `npm run check:p15:quality`
- Date: 2026-09-05

## Proven behavior

Scope correction: the original MP3 provider fixture tested transport only and
was not valid audio; it did not establish Player decoding or real production
SFX. The follow-up `P29-AUDIO-CODEC-FOLLOWUP.md` replaces that fixture with a real
encoded signal, fixes Player MP3 support and measures metadata from bytes.
Actual Tank SFX generation and audible acceptance remain open.

- Project Codex can call `asset.generate` for `image` and `soundEffect`
  without providing a provider, model, credential, endpoint, or secret. The
  authenticated main-process bridge resolves project routes.
- New jobs use `image`, `soundEffect`, `music`, or `speechGeneration`; legacy
  `audio` is deterministically migrated to `speechGeneration` with an explicit
  migration record.
- Fixture-based adapter conformance covers OpenAI/Bailian image, Bailian speech,
  ElevenLabs sound-effect, and ElevenLabs music. This gate alone does not prove
  real provider execution; actual Tank SFX remains open. Provider model lists
  come from the selected named credential's provider API; parameter contracts
  are versioned in `schemas/media-generation-parameters.schema.json` and are
  validated before network access.
- A job persists its effective provider, opaque credential reference, model,
  endpoint class, effective parameters, estimate/unknown-price state, stable
  job ID, idempotency key, progress, attempts, candidates, and structured
  failure. Credential values are never serialized.
- `always`, known-budget, and explicit pre-authorization policies remain
  Studio-profile authority. Unknown-price jobs do not pass a bounded-budget
  policy. Retries are re-authorized.
- Every outbound attempt carries the same durable idempotency key. HTTP quota,
  rate limit, invalid parameter, safety refusal, transient failure, and
  ambiguous timeout are distinct. An ambiguous timeout blocks retry until
  reconciliation; confirming execution keeps duplicate work blocked.
- Cancellation states that remote cancellation is not guaranteed. Job and
  candidate lifecycle events are appended to a local redacted audit.
- A hostile transport-error fixture deliberately repeats the resolved
  credential as a raw value, a Bearer token, and an `api_key` value. The broker
  removes the exact resolved secret before classifying, returning, or
  persisting the failure. A second sanitization boundary protects structured
  `failure.message` as well as the display-oriented `job.error` field.
- Studio polls durable job state while the Assets panel is visible and shows
  route, price state, progress, attempt count, idempotency identity, diagnostics,
  image previews, and playable audio without introducing a second mutation
  path.

## Evidence output

The media gate passed all four capability contracts, three directly exercised
production adapters, provider discovery, five HTTP failure categories plus a
secret-bearing transport exception, same-key retry after confirmed-not-run
reconciliation, restart persistence, cancellation, and secret scans. The
exception canary is absent from the returned Job, structured failure, simulated
Copilot tool transcript, durable Job store, JSONL audit, and every scanned
project text file. The agent gate sent capability-only image and sound-effect
requests through the built Engine MCP sidecar and confirmed that `asset.select`
is not agent-callable.

The aggregate `npm run check:p32:clean-profile` composes this gate with P26
ChangeSet/project scans and the P20 build, Git-input exclusion, build-report,
Release package, and installed-Studio archive scans. Together these close the
machine credential-redaction and package boundary without inspecting or using
the user's real provider credentials.

`npm run check:p15:quality` also passed at 960×641 and 150% display scaling with
no root overflow, styled compact controls, working pointer/keyboard splitters,
and the Midnight Workshop UI contract intact.

## Open human evidence

No participant result is inferred from these tests. A person must still approve
a paid call, watch progress, compare/play candidates, cancel/retry, and explain
the wait/cost state in installed Studio during Journey B.
