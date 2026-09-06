# ADR 0014: Asset generation uses a provider-neutral broker

- Status: Accepted
- Date: 2026-09-02

## Decision

Project skills describe asset intent and workflow but do not call vendor APIs
directly. They invoke provider-neutral engine tools for image, voice/audio, and
video generation. A broker owned by Electron main selects configured adapters,
holds credentials, estimates cost, enforces permissions and budgets, manages
asynchronous jobs, and imports a human-selected result through a ChangeSet.

Studio presents credential management, generation-tool routes, and execution
policy as separate management concerns. A credential is a named provider
profile: its provider-specific endpoint/region/workspace fields live beside its
write-only secrets, and one provider may have multiple profiles. A generation
capability independently selects provider, named credential, and model. The
model catalog is queried from the selected provider API and retains a manual
model-ID fallback when discovery is unavailable.

Projects store art direction, tool routing, budgets, permissions, generated
source files, and provenance. API keys and refresh tokens stay in the OS
credential store and are never placed in project files or Codex context.

Every selected asset records its brief and style/skill versions, provider/model,
parameters and seed when available, source/imported hashes, transformations,
cost, selection, license, and restrictions. Paid work requires policy
evaluation. The Studio user chooses per-call approval, known-budget
auto-approval, or explicit pre-authorization; project prompts and MCP tools
cannot modify that global setting. Expanded outbound-data scope keeps its own
explicit permission.

## Consequences

Projects and skills remain portable across Alibaba Bailian, OpenAI, local
models, and future providers. Durable job IDs and idempotency prevent duplicate
billing after restart. Studio must implement candidate review, secret
redaction, untrusted-download handling, retry/rate-limit behavior, and rights
metadata instead of treating generation as a synchronous file download.

The first OpenAI adapter uses GPT Image 2 behind the same image capability as
Bailian. Studio owns an ephemeral authenticated loopback bridge so the Engine
MCP subprocess can request generation without receiving provider credentials.
Provider model IDs are not release-bound to Studio: the broker accepts a
compatible dynamically discovered image/TTS model while its local adapter and
project cost policy remain authoritative.

Images are delivered first, audio/voice second, and video third. Video is not a
dependency for the Tank Arena gameplay milestone.
