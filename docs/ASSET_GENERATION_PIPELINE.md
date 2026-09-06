# Provider-neutral asset generation pipeline

## Purpose

Studio lets a project's Codex agent request images, sound effects, music,
speech generation, and later video without coupling project skills to one vendor. The pipeline makes
generation reviewable, budgeted, resumable, reproducible where providers allow,
and traceable after an asset ships.

Generation is not direct model access from project code. A project skill creates
an asset brief and calls a stable engine tool by media capability. Electron main
resolves the project route, applies the user-owned approval policy, calls the
provider while holding credentials, tracks the job, and imports only a reviewed
result.

## Separation of concerns

| Layer             | Responsibility                                                                         |
| ----------------- | -------------------------------------------------------------------------------------- |
| Art bible         | Declarative visual/audio direction, palette, proportions, naming, and reference policy |
| Project skill     | When to generate, how to construct a brief, required checks, and import workflow       |
| Engine asset tool | Provider-neutral request and result schema                                             |
| Provider broker   | Routing, credentials, estimates, quotas, retries, and vendor API translation           |
| Studio UI         | Cost approval, job progress, candidate comparison, selection, and provenance display   |
| Importer          | Deterministic processing into engine-ready project assets                              |
| Asset manifest    | Identity, source, hashes, rights metadata, dependencies, and transformation history    |

The initial provider-adapter boundary should support Alibaba Bailian, OpenAI, a
local model process, and future vendors without changing project skills. Actual
adapters are added only when their API, terms, output rights, and operational
behavior have a tested contract.

## Project files

```text
.agents/skills/game-art-direction/
├─ SKILL.md
├─ references/STYLE_GUIDE.md
├─ references/palette.json
├─ references/character-sheet.md
└─ assets/reference-images/
.agents/skills/generate-sprite/SKILL.md
.agents/skills/generate-voice/SKILL.md
.ai/
├─ providers.json
├─ tool-routing.json
├─ permissions.json
└─ budgets.json
assets/
├─ source/
├─ generated/
├─ imported/
└─ asset-manifest.json
```

`STYLE_GUIDE.md` is declarative and human-editable. `SKILL.md` defines the
workflow. Provider routing refers to aliases, not secret values.

Example routing policy:

```json
{
  "schemaVersion": "2.0.0",
  "routes": {
    "image": { "providerId": "openai", "modelId": "gpt-image-2" },
    "speechGeneration": {
      "providerId": "aliyun-bailian",
      "modelId": "qwen-audio-3.0-tts-flash"
    }
  }
}
```

Example budget policy:

```json
{
  "currency": "CNY",
  "monthlyLimit": 300,
  "perJobApprovalAbove": 2,
  "dailyJobLimit": 50,
  "allowUnknownPrice": false
}
```

## Stable tool contract

The executable Engine MCP tools are:

- `asset.provider_health` and `asset.estimate`;
- `asset.generate` with `image`, `soundEffect`, `music`, or
  `speechGeneration` (legacy `audio` migrates to `speechGeneration`);
- `asset.job_list`, `asset.cancel`, and `asset.retry`;
- `asset.recommend` and `asset.regenerate`.
- `asset.master_audio` derives a local, review-only audio candidate. Explicit
  crop/fade/gain parameters produce measured 48 kHz PCM16 WAV; original
  provider bytes and hashes remain available. It does not generate, select or
  import, and adds no provider call. See `testing/P31-AUDIO-MASTER.md`.
- `asset.inspect_candidate` returns actual decoded audio peak/RMS and metadata
  by Job/Candidate IDs; it does not listen, select or approve.

Candidate acceptance is deliberately not an agent tool. Codex can compare and
recommend by stable candidate ID, but a human or configured selection policy
records the review decision in Studio. That decision proposes an
`asset.generated.import` ChangeSet; normal ChangeSet approval applies or rolls
back the file, manifest, provenance, import settings, and owned Scene/Prefab
references together.

A generation request includes:

- stable project asset ID and intended use;
- structured brief and negative constraints;
- style-guide and reference-asset content hashes;
- media-specific dimensions, duration, format, transparency, or voice settings;
- provider capability requirements, but normally no hard-coded vendor;
- candidate count, reproducibility parameters, and maximum budget;
- license/rights metadata requirements;
- idempotency key.

The broker returns an estimate before submission, then a stable internal job ID.
Provider-native IDs and diagnostics remain available to the broker and audit log
without becoming the project's public API.

## Job lifecycle

```text
DraftBrief -> Estimated -> AwaitingApproval -> Submitted -> Running
     |             |              |                |
   Rejected      Rejected       Cancelled         Retrying
                                                   |
                     CandidatesReady -> ReviewDecision -> ImportChangeSet
                              |                 |              |
                            Rejected        Regenerated    Applied/RolledBack
```

The queue is persistent and supports resume, cancellation when the provider
allows it, bounded retry with backoff, rate limiting, concurrency limits,
provider failover under policy, and deduplication by idempotency key. Restarting
Studio must not submit the same paid job twice.

Per-call approval is a global Studio user preference and cannot be lowered by a
project prompt, Skill, MCP tool, or versioned project file:

- `always` holds every paid request at `awaitingApproval`;
- `budget` auto-approves only a configured CNY estimate at or below the user's
  per-job limit; unknown price still waits;
- `auto` is an explicit user pre-authorization for provider calls, while
  candidate review, audit, cancellation, provenance, and import remain intact.

Reference-image upload, voice cloning, and expanded external-data scope remain
separate permissions and are not implied by generation approval.

## Human review flow

1. Codex or the developer creates a structured asset brief.
2. Studio shows provider route, estimated price/range, data leaving the machine,
   expected outputs, and applicable permission.
3. The user approves, changes the route, or rejects the job.
4. Studio submits and displays durable progress, retry, and cancellation state.
5. Candidate files enter a quarantine/source area and are scanned and decoded
   with size and format limits.
6. Studio shows side-by-side candidates with the brief and current in-game
   preview context.
7. The user selects, rejects, or requests a controlled variation.
8. Deterministic processors crop, resize, slice, compress, normalize, or
   transcode the selection.
9. The importer writes the engine-ready asset and manifest update as one
   validated ChangeSet.
10. Relevant scene, visual, audio, and package tests run before commit.

AI may rank or explain candidates, but selection remains human-controlled in
this round.

## Provenance manifest

Every selected generated asset records at least:

```json
{
  "id": "tank-arena:sprites/player-tank",
  "kind": "image.sprite-sheet",
  "source": "generated",
  "requestId": "asset-job:01J...",
  "briefHash": "sha256:...",
  "skill": {
    "id": "project:generate-sprite",
    "version": "1.0.0"
  },
  "provider": {
    "alias": "bailian-image",
    "model": "configured-model-id"
  },
  "parameters": {
    "seed": 1842,
    "width": 512,
    "height": 512
  },
  "selectedCandidate": 2,
  "sourceHash": "sha256:...",
  "importedHash": "sha256:...",
  "transformations": ["crop:v1", "sprite-slice:v1", "png-optimize:v1"],
  "cost": {
    "currency": "CNY",
    "amount": 0.8
  },
  "rights": {
    "license": "provider-output-terms",
    "restrictions": [],
    "reviewed": true
  },
  "createdAt": "2026-09-02T00:00:00Z"
}
```

Provider-specific metadata can be namespaced, but the common fields stay
portable. Prompts or references that cannot legally be stored are represented
by a restricted audit reference and hash; release packaging includes only the
rights/provenance summary needed for the shipped asset.

## Secrets and data policy

- API keys and refresh tokens live in the OS credential store, scoped by
  provider alias and user profile.
- Secrets are available only to Electron main or the provider broker. They are
  never written to the project, rendered in logs, inserted into prompts, or
  returned by MCP tools.
- Studio previews the files and text sent to a remote provider.
- Reference assets have an explicit upload permission and rights declaration.
- Logs redact request headers, signed URLs, secret query parameters, and private
  account identifiers.
- Downloaded content is untrusted: enforce HTTPS where applicable, content and
  size limits, safe filenames, decoder isolation, hashes, and quarantine.

## Media rollout order

1. **Images:** icons, sprites, backgrounds, tile sets, UI, and texture sources.
   This is the first end-to-end production path.
2. **Audio and voice:** sound effects, music source, narration, and dialogue,
   with loudness, format, pronunciation, and voice-rights review.
3. **Video:** trailers and cutscenes after async jobs, cost controls, large-file
   storage, timeline import, and release transcoding are proven.

Video is not a prerequisite for Tank Arena gameplay and must not delay the image
or audio pipeline.

## Implemented capability routing and provider connections

Studio separates user/account connection data from project model policy:

- Credential Management creates named provider profiles. Provider-specific
  endpoint, region, workspace, and other non-secret fields are stored with the
  profile; secrets are encrypted by the OS, write-only in the renderer, and
  never duplicated in AI Tools settings. Multiple profiles may target the same
  provider;
- on startup, legacy `providerConnections`, provider-selection arrays, and
  global credential references are merged into their matching named profile
  and removed. Existing profile fields win over legacy values, so migration
  cannot silently replace an explicit newer configuration;
- `.ai/providers.json` schema `2.0.0` versions the provider-neutral model
  catalog, per-media defaults, adapter identifier, candidate limit, generation
  defaults, and optional project-maintained estimate;
- `.ai/tool-routing.json` maps `image`, `soundEffect`, `music`, and
  `speechGeneration` to a provider, opaque named-credential reference, and
  model, so Agent requests normally omit those fields. `audio` remains a
  read-compatible migration alias to `speechGeneration` only;
- each generation tool exposes separate provider, credential, and model
  controls. Studio queries OpenAI `GET /models`, Bailian `GET /api/v1/models`,
  and ElevenLabs `GET /v1/models`, then filters returned capabilities for the
  tool row. A
  remote-provider dropdown contains only that API response; project-bundled
  adapter models are never inserted as substitute choices. Manual model IDs
  use a visibly separate mode, including when an older project value is absent
  from the current API response. Only `local-placeholder` uses the built-in
  deterministic test catalog;
- schema `2.0.0` projects created before an engine-bundled provider existed are
  repaired with missing OpenAI/Bailian/ElevenLabs adapter definitions. Readiness uses
  the broker's real dynamic-adapter rules, so a newly discovered OpenAI image
  model is not mislabeled as route-only;
- the Studio tool registry exposes image generation, sound-effect generation,
  music generation, and speech generation as distinct executable rows. Video
  and speech recognition remain visibly unavailable rather than pretending to
  be callable;
- each persistent job snapshots `providerId`, opaque `credentialRef`, `modelId`,
  parameters, estimate state, and either human or user-policy approval evidence
  before a request can leave the machine;
- the project manifest records the selected model and parameter hash without
  copying the credential, account, or Workspace ID into the project.

The production adapters cover OpenAI image generation, Bailian text-to-image,
Beijing-region non-real-time Qwen Audio TTS, ElevenLabs
text-to-sound-effect, and ElevenLabs music composition. OpenAI base64 image
results, Bailian temporary URLs, and bounded ElevenLabs audio bytes are
normalized into the same local candidate quarantine. Studio candidate review
supports image rendering and audio playback before import. Adapter parameters
are versioned by `schemas/media-generation-parameters.schema.json` and validated
before the request leaves Studio.

Codex/MCP can create briefs, resolve a route, optionally override a project-listed
model, estimate, inspect, cancel, retry, recommend, and request regeneration.
Its capability-only request is
forwarded over an ephemeral authenticated loopback bridge to Electron main;
provider secrets never enter the Codex/MCP process. Paid jobs follow the Studio
user's approval mode, and every retry is evaluated again because it may incur a
new charge. Every outbound attempt carries the job's durable idempotency key.
An ambiguous timeout becomes non-retryable until reconciliation says the
original request did not run; confirming that it ran keeps duplicate calls
blocked.

ElevenLabs error handling reads at most 16 KiB of JSON for at most one second.
Only a finite allowlist of legacy `detail.status` and modern `detail.code`/`type`
values can produce fixed, actionable diagnostics. Provider messages, request
IDs, unknown fields, raw bodies and secret echoes are never persisted or sent
to the renderer/agent. Quota, credential, permission, model and parameter
rejections are non-retryable; a recognized rate error preserves retry only for
HTTP 429. Ambiguous timeouts retain their reconciliation requirement.
Unrecognized HTTP 400 is explicitly unresolved, not proof of invalid parameters.
Cancelling during diagnostic reading preserves the cancelled Job. Historical
generic errors cannot recover an omitted body and are not relabeled as a proven
cause. See `docs/testing/P29-PROVIDER-ERROR-DIAGNOSTICS.md`.

The ElevenLabs sound-effect adapter exposes `promptMaxCharacters: 450` in model
health and cost estimates. Submit and queued execution validate the trimmed
Unicode-character count before outbound work; prompts are never silently
truncated. Regeneration validates its complete combined prompt before rejecting
the prior candidate. Other adapters retain the existing 4000-character bound.
This follows the provider's
[documented sound-effect prompt limit](https://elevenlabs.io/docs/help-center/product/core-capabilities/sound-effects/what-is-sound-effects).

Legacy `1.0.0` `external-http`/single-model Bailian configuration and schema
`2.0.0` projects missing a bundled external provider are migrated
deterministically when the project opens. The encrypted credential reference is
kept in user settings and is not part of that project migration.

The bundled adapter catalog is versioned execution metadata, not a remote-model
dropdown fallback, selection ceiling, or live billing/availability truth.
Current endpoint families are based on the
[Bailian image model catalog](https://help.aliyun.com/zh/model-studio/image-model)
and [non-real-time TTS guide](https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide),
plus the ElevenLabs
[sound-effect](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
and [music](https://elevenlabs.io/docs/api-reference/music/compose) APIs.
When no project price is configured, Studio says that pricing is unknown and
requires the user to check the provider console; it never presents unknown cost
as free.

## Acceptance

- A project skill requests an image without naming a provider and routing selects
  a configured compatible adapter.
- Cost and outbound data are visible before a paid job is submitted.
- Killing Studio during a running job resumes status without duplicate billing.
- No credential value appears in project files, Codex context, renderer state,
  logs, or audit exports.
- A user can compare candidates, select one, import it, run the game, and roll
  back both asset files and manifest changes.
- Reimport from the recorded source and transformation versions produces the
  expected engine-ready content hash when the processors are deterministic.
- A release contains the selected runtime asset and rights summary, not provider
  credentials, drafts, rejected candidates, or private source references.
