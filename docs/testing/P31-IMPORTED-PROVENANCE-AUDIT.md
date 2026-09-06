# P31 imported asset provenance audit

## 2026-09-06 supervised repair

Read-only audit `r5-imported-provenance-audit-TDzZTU` checked all 15 imports
(nine images, six audio masters) at original revision `cdffc27d…`. Imported
bytes, sidecar equality, candidate selection, review identity and approved
import chains matched. Three early audio assets lacked project Skill/Brief
context: player shot, battle music and tank hit. This was a metadata gap, not
corrupt audio or evidence of missing candidate review.

The supervisor sent bounded feedback through the original Studio Copilot
composer. Original conversation `01a065c3-df50-7d11-87f5-d5c2f60cab69`, turn
`01a07559-b603-7c53-b13c-f14a040a2cdf`, read the actual project through Engine
MCP and proposed `changeset:b3aba045-5690-4cb5-a5c2-deba10ac4c1a`, proposal
hash `b2db7d6e8f464a193b6b1bf3f476a8004b97a7f0336b692431f700f231e28c52`.

Only the manifest and those three provenance sidecars changed. Actual current
Skill/Brief IDs and hashes were linked, with an explicit **post-import context**
annotation. Historical processor hashes, source/derived audio hashes, provider,
Job, candidate, review identity, license and previous restrictions were preserved.
The supplement does not claim the provider received the Skill/Brief inputs and
does not provide legal clearance or independent P33 acceptance.

## Executable evidence

- `artifacts/r5-review-text-transaction.ts`: exact proposed files applied and
  validated on an isolated copy, then rolled back to the exact initial revision.
  Receipt: `r5-text-transaction-review-6JzseT`.
- `artifacts/r5-early-audio-context-review.ts --review`: exact semantic delta,
  unchanged other assets/audio/Jobs and still-unselected UI back verified.
  Receipt: `r5-early-audio-context-review-52omGj`.
- Delegated review approval at `2026-09-06T06:15:47.418Z`, content hash
  `f838af4bc38f400e30638b62dc15f78f8654f4b603eedf748e6c6efbc4410c6c`.
  Receipt: `r5-early-audio-context-review-dUhZAh`. The supervisor changed only
  review metadata, not original game source.
- Native Goal Continue resumed original turn
  `01a0755c-58f0-7c50-9178-2423a985bb04`; the original Copilot applied the
  approved proposal and ran project validation.
- `--audit-applied` verifies exact original file hashes and reviewed revision
  `b6e768694e155ee63bdc9af609035bd60ff1b803ad5b01517d6d27fae5e51130`.
  Receipt: `r5-early-audio-context-review-Az8Y8R`.
- `artifacts/r5-audit-all-imported-provenance.ts` rerun passes all **15** assets,
  with no remaining context issues. It also exercises missing/wrong context
  negative checks. Receipt: `r5-imported-provenance-audit-NBbTt9`.
- `npm run check:p29:import` passes transactional review/import, tamper rejection
  and exact rollback. Full `npm run check` also passed, using isolated package
  variant `r5-provenance-audit-check`: three examples repeated 100 times each,
  native GPU/audio, archive-extracted installation, upgrade, recovery and
  uninstall-preserves-user-data gates. Archive SHA-256:
  `ecbdcfba0229f0fdcd43d588db4c0de397dc244cf5dd7f1c4e1eec2aad369a06`.
  This is qualification evidence, not a replacement of the owner installation
  `87cb8897…`. `npm run check:p28:round05`, the board production build and
  formatting checks also pass; the existing local board returns HTTP 200 with
  the latest `b6e76869…` checkpoint. Remote Sites publishing remains unavailable
  from the previously recorded access failure; no new remote deployment is claimed.

The provider Job store is unchanged throughout this repair. No generation,
candidate choice, audio-byte edit, gameplay edit or test weakening occurred.
UI back candidate `c9965524…` remains awaiting the owner's listening choice.
Final audio coverage, mixing, final packages and independent Journeys A–E
remain open.
