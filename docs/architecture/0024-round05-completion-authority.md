# 0024 — Round 05 completion-run and media authority

- Status: Accepted
- Date: 2026-09-05
- Scope: Round 05 P28–P33

## Decision

Round 05 uses five independent durable state machines joined by stable semantic
IDs. None may infer the authoritative state of another:

1. `CompletionRun` owns high-level Goal/Plan orchestration and links.
2. `MediaGenerationJob` owns provider execution, cost, retry, cancellation, and
   ambiguity reconciliation.
3. `GeneratedAssetReview` owns candidate inspection, recommendation, human or
   configured-policy selection, rejection, and regeneration ancestry.
4. `GeneratedResourceImport` is backed by a semantic `ChangeSet` and owns the
   atomic project mutation and its exact rollback boundary.
5. `RuntimeObservation` owns addressable frame, drawable, UI, resource, and
   audio evidence from one runtime checkpoint.

The versioned contracts are:

- `schemas/completion-run.schema.json`
- `schemas/media-generation-job.schema.json`
- `schemas/generated-asset-review.schema.json`
- `schemas/generated-resource-import.schema.json`
- `schemas/runtime-observation.schema.json`

## Authority boundaries

The project remains authoritative for Game IR, scripts, selected assets,
manifests, import settings, and project-local agent instructions. The Studio
profile remains authoritative for credentials, outbound approval policy, and
budget policy. Candidate files and provider-private responses remain under
`.aigame/` local state and are not project assets.

An asset provider call, candidate selection, and project mutation are three
different gates:

- **Provider authorization** decides whether an outbound or potentially billed
  request may run.
- **Candidate review** decides which result, if any, may be proposed for import.
- **ChangeSet approval** decides whether the reviewed result may mutate the
  project.

No project prompt, Skill, MCP request, or imported configuration may widen a
Studio profile's provider authorization or budget. ChangeSet approval remains
human-required in Round 05.

## Stable identity and idempotency

### Explicit owner delegation during supervised development

An owner may explicitly delegate review and necessary spending for a named
development Goal. This does not let project Codex approve its own ChangeSets
or edit the Studio profile. The supervising operator still inspects proposals
and records approvals through the shared Studio review service; Codex may
invoke `change.apply` only after content-hash-bound approval exists. It cannot
create approvals, apply modified content, or reuse a consumed approval.

Paid generation delegation is stored only in the OS-user AI Tools settings as
a `generationAuthorizations` grant with a stable ID, exact project root,
thread ID, purpose, authorization time, expiry and explicit unknown-cost
consent. It is effective only while that same Goal is active. A job must
belong to its current Completion Run; unrelated historical tests remain
unauthorized. Expiry, revocation, project/thread switch and terminal or paused
Goal state restore the unchanged global policy. Jobs retain the grant ID in
their approval record. A zero Completion Run budget limit means no stated
ceiling, not free generation; unknown costs remain unknown.

This supervised path is not independent human acceptance. It cannot populate
P33 participant evidence or remove the requirement for the unassisted
Journeys A–E. The owner authorization on 2026-09-05 applies to the internal R5
Tank run, not to the excluded historical generation test.

IDs are allocated before work starts. A Completion Run never uses array
positions, renderer handles, ECS handles, pointer addresses, DOM nodes, or
provider secrets as public identity. The canonical relationship is:

```text
completion-run → goal → plan-step → tool-call
                             ├── asset-job → attempt → candidate → review
                             │                              └── asset-import → change
                             ├── runtime-session → observation
                             ├── test-run
                             └── build → package
```

A media request has one durable idempotency key for its logical paid operation.
Retries create attempts under the same job. An ambiguous timeout is reconciled
against the provider operation before a retry can be authorized. A new prompt
or a human regeneration instruction creates a new job and records its ancestry.

Audio candidate metadata is evidence from decoded bytes, never from requested
duration, a MIME label or a fabricated channel count. The Studio broker uses
the bundled Player's bounded device-free codec inspector; it forwards no
provider credentials or inherited secret environment. Invalid or unsupported
media cannot become a reviewable candidate or enter an import transaction.
Preview/selection rechecks legacy audio metadata against the content hash.
Successful decoding is not subjective listening approval or game-audio coverage.

`asset.master_audio` is local candidate derivation, not a provider operation
or an authoring write. It reuses the bundled codec/resampler without an audio
device, arbitrary command, file argument or inherited credentials. Explicit
crop/fade/gain yields at most 60 seconds of 48 kHz PCM16 WAV. Original
bytes remain untouched; each derived candidate binds the parent hash, exact
parameters and processor hash. Identical requests reuse the durable candidate.
Only original pending candidates can be processed (no unbounded chains), with
16 candidates per job. A new candidate is always unselected and must pass the
same review, approved import and rollback as provider outputs. Processing does
not prove perceptual quality, silence-free transients or seamless musical loops.

ChangeSet apply is one-use and content-hash-bound. Generated import applies file
copy, manifest, provenance, import settings, and owned references as one
transaction. Rollback removes or restores only targets owned by that
transaction and refuses to overwrite an unrelated later human edit.

## Recovery

On restart, the Completion Run reconciles linked authoritative stores before
choosing its next Plan step. A UI status is never sufficient recovery evidence.
Stopping a Goal prevents new work but retains jobs, approvals, candidates,
costs, ChangeSets, runtime/test/build evidence, and already applied project
changes. Removing a terminal Goal only hides its presentation.

## Legacy audio migration

The legacy `audio` capability means speech synthesis only. It resolves to
`speechGeneration` through the named `audio-to-speech-generation-v1` migration
and emits a visible migration diagnostic. It never silently resolves to game
sound effects or music. New work must request `soundEffect`, `music`, or
`speechGeneration` explicitly.

## Evidence rule

An implementation claim is complete only when its named machine gate passes and
the corresponding Round 05 human journey records an observable outcome. A mock
provider, tool registration, UI control, schema, or developer-run demonstration
alone is not completion evidence.

## Consequences

- P29 must replace direct candidate import with a ChangeSet-backed transaction.
- P30 must create actual inspectable frame artifacts, not only render metadata.
- P32 can resume safely because provider work and project mutation have distinct
  identities and checkpoints.
- P33 may count human approvals as intended gates, but counts coaching, terminal
  use, direct file repair, or screen-coordinate automation as failure evidence.
