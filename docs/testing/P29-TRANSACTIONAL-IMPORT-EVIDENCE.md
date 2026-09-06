# P29 transactional-import evidence

## Re-proposed import reconciliation (2026-09-05)

`check:p29:import` now covers a selected candidate whose old proposal is
rejected, then re-proposed by MCP on the current baseline. An awaiting or merely
approved replacement cannot become imported. After apply, the broker verifies
the original review decision, candidate hash, selected import operation,
approved ChangeSet, manifest and actual file bytes before linking the replacement.
It records `asset-import.relinked`, preserves the original candidate selection,
and follows rollback back to review. The regression failed before the fix and
passes afterwards. This repairs stale UI/job status without approving, applying,
regenerating or charging on the agent's behalf.

- Status: machine gate passed; independent human Journey B remains open
- Gate: `npm run check:p29:import`
- Date: 2026-09-05

## Proven behavior

- Generated candidates remain under `.aigame/local/asset-candidates/` and do
  not enter the project asset manifest before a recorded review decision.
- Candidate identity is stable. Image metadata includes dimensions, format,
  alpha state, byte count, hash, and a renderable data URL. Audio candidates
  expose duration, codec, sample rate, channels, hash, and a playable data URL.
- Codex can attach an evidence-backed recommendation through
  `asset.recommend`; it cannot forge the human selection event. Rejection and
  regeneration preserve decision IDs and parent candidate ancestry in the
  durable local audit.
- Human selection creates a pending ChangeSet rather than writing project
  authority. The exercised ChangeSet covered the selected binary, stable Asset
  ID and manifest record, provenance, import settings, and owned Scene
  Component reference in one five-file review.
- Provenance records provider, model, job, candidate, review decision, prompt
  hash, parameter hash, art-direction Skill ID/hash, asset-brief ID/hash,
  source hashes, derived-content hashes, license, and restrictions. It does not
  copy the raw prompt or credential.
- The candidate hash is checked before proposal and again after apply. Reopening
  the registry, ChangeSet service, and broker while waiting for approval
  restores the same pending import.
- Apply uses the existing prepared/applied workspace journal. Rollback removed
  only the transaction-owned imported file, manifest record, provenance,
  settings, and Scene reference, restoring the exact pre-transaction project
  fingerprint. A tampered candidate was rejected before proposal.

## Open human evidence

The machine gate cannot claim subjective acceptance or discoverability. Journey
B still requires an independent participant to compare candidates in Studio,
select/reject one, understand the ChangeSet, apply it, inspect provenance, and
roll it back without coaching or external tools.
