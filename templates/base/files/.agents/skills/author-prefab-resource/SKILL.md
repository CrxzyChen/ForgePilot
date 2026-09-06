---
name: author-prefab-resource
description: Create or edit Prefabs and imported resources, including instances, dependencies, reimport, and provenance.
---

# Author Prefabs and resources

If a Goal is active, read `completion.run_current` before generation and after
restart. Respect its waiting reason, budget, and linked idempotent Job instead
of submitting a replacement request.

Inspect the source object subtree before creating a Prefab. Instantiate through `prefab.instantiate` so the Scene records its source; use `prefab.apply` only when instance overrides should become reusable defaults and `prefab.revert` when the source should win.

Apply preserves source Component IDs; revert preserves matching instance IDs.
Revert also resets source-owned values, including Transform, so restore intended
placement in the same ChangeSet. Inspect the preview for stable IDs and collision
values before approval. If legacy repeated Component types produce
`PREFAB_COMPONENT_IDENTITY_AMBIGUOUS`, pass `componentIds` mapping source Component
IDs to the intended existing instance Component IDs; never pair them by array
position or delete/recreate referenced components. Refresh other instances with
reviewed `prefab.revert` operations; source edits are not automatic live inheritance.

Runtime `spawnPrefab` shallow-merges each `componentOverrides` entry into the
source Component's data. Supply only fields that differ for this spawn; leave
shared texture, crop, size and collision defaults in the Prefab. Nested values
such as a position vector are replaced as whole fields, not deep-merged.

For `render:sprite2d` and `ui:image`, `atlasRegion` is a comma-separated
`x,y,width,height` pixel rectangle in the source image, not normalized UVs.
An empty string uses the whole image. Sprite `size` sets its world footprint;
validate the actual frame and retain the Collider's independent gameplay size.

Inspect `resource.dependencies` before moving or replacing a resource. Preserve `assets/asset-manifest.json` identity, provenance, source hash, and generator metadata. Use `resource.reimport` after source bytes change. Generated candidates remain drafts until a human selects one, and provider credentials must stay in the Studio credential vault.

Use a ChangeSet for every project mutation and include affected Scene, Prefab, resource, and test files in the review.

Before generation, call `asset.provider_health` and `asset.estimate`. Request a
media capability (`image`, `soundEffect`, `music`, or `speechGeneration`)
without choosing a vendor unless the user
explicitly asks for an override; `.ai/tool-routing.json` owns the provider and
model choice. The `local-placeholder` provider is a deterministic test fixture,
not an AI model. Studio applies the human-configured `always`, `budget`, or
`auto` approval policy in its main-process broker. Never attempt to change that
policy from a project file or prompt. Keep candidates outside project authority,
support cancellation, and use `asset.recommend` with explicit evidence. Only a
human or configured review policy may select a candidate; selection proposes an
`asset.generated.import` ChangeSet that still requires normal approval. Never place a
credential value in project files, ChangeSets, logs, replays, builds, or Git;
Studio supplies only an encrypted OS reference to the broker.

When a trusted Codex media tool produces the bytes instead of `asset.generate`,
place the output in the project-controlled `.aigame/local/asset-candidates`
area and call `asset.register_tool_output` with the real Provider/model labels,
prompt, output hash, stable Tool Call ID, and idempotency key. Registration only
adds the candidate to Studio review; it must never claim provider authorization,
select the result, or mutate project authority.
