# P22 Round 04 baseline evidence

- Date: 2026-09-03
- Phase: P22 — Truthful baseline and executable contracts
- Result: Passed
- Placeholder closure result: Expected failure with 12 open probes

## Artifacts

- `docs/rounds/ROUND-04-REAL-GAME-AUTHORING.md`
- `docs/rounds/ROUND-04-CHECKLIST.md`
- `docs/testing/ROUND-04-HUMAN-OBSERVATION.md`
- `docs/audits/ROUND-04-PLACEHOLDER-INVENTORY.md`
- `docs/architecture/0022-shared-runtime-session-and-projections.md`
- `docs/architecture/0023-runtime-adapters-and-determinism-boundary.md`
- `schemas/runtime-session.schema.json`
- `schemas/runtime-projection.schema.json`
- `schemas/preview-host.schema.json`
- `studio/runtime/runtime-session-protocol.ts`
- `scripts/check-p22-contracts.ts`
- `scripts/check-p22-placeholders.ts`

## Commands and results

`npm run check:p22:baseline` passed with:

- protocol version `3.0.0-preview.1`;
- six required specification/architecture/observation documents;
- three JSON Schema 2020-12 protocol files;
- 20 source-backed inventory entries;
- all 12 known placeholder probes reproducing their open baseline state.

`npm run gate:round04:placeholders` exited with code 1 and
`failed-open-placeholders`. This is the required P22 result: it proves that the
final Round 04 gate cannot pass while the audited placeholders remain.

`npm run typecheck` and `npm run lint` passed after the protocol TypeScript and
checks were added.

## Open probe ownership

| Probe                                                                                            | Owner   |
| ------------------------------------------------------------------------------------------------ | ------- |
| DOM viewport, bounded runtime, replayed step and runtime report                                  | P23     |
| Synthetic collision, Player without physics, Sprite/audio absence                                | P24/P25 |
| Isometric 3D projection                                                                          | P25     |
| Placeholder provider, ineffective settings, inert menus, false test success and inert extensions | P26     |

The probes are closure guards, not implementation claims. Each is removed or
changed only with replacement evidence and its named human retest. Overall
human acceptance remains open under `R4-OBS-001`.
