# Round 05 gap ownership and evidence map

- Status: Frozen P28 baseline
- Date: 2026-09-05
- Source specification: `docs/rounds/ROUND-05-COPILOT-GAME-COMPLETION.md`
- Rule: each row starts failing or explicitly unproved. It closes only when the
  named probe and human journey both pass with linked evidence.

| Gap ID    | Starting gap                                                                                 | Owner   | Failing/unproved probe                                  | Target evidence                                                                         | Human journey                                             |
| --------- | -------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| R5-GAP-01 | Public generation kinds are only `image` and ambiguous `audio`                               | P29     | `npm run check:p29:media`                               | `docs/testing/P29-MEDIA-JOBS-EVIDENCE.md`                                               | Journey B                                                 |
| R5-GAP-02 | Production game sound-effect and music adapters are absent                                   | P29     | `npm run check:p29:providers`                           | `docs/testing/P29-PROVIDER-EVIDENCE.md`                                                 | Journey B                                                 |
| R5-GAP-03 | Provider failures, cost, retries, and ambiguous timeouts are not a complete durable contract | P29/P32 | `npm run check:p29:media`; `npm run check:p32:recovery` | `docs/testing/P29-MEDIA-JOBS-EVIDENCE.md`; `docs/testing/P32-GOAL-RECOVERY-EVIDENCE.md` | Journey B/D                                               |
| R5-GAP-04 | Candidates lack complete image/audio metadata, comparison, rejection, and ancestry           | P29     | `npm run check:p29:review`                              | `docs/testing/P29-CANDIDATE-REVIEW-EVIDENCE.md`                                         | Journey B                                                 |
| R5-GAP-05 | `asset.select` imports directly instead of proposing a ChangeSet transaction                 | P29     | `npm run check:p29:import`                              | `docs/testing/P29-TRANSACTIONAL-IMPORT-EVIDENCE.md`                                     | Journey B                                                 |
| R5-GAP-06 | Runtime exposes projection metadata but no inspectable addressable frame artifact            | P30     | `npm run check:p30:observation`                         | `docs/testing/P30-RUNTIME-OBSERVATION-EVIDENCE.md`                                      | Journey C                                                 |
| R5-GAP-07 | UI bounds, fallback rendering, and audio playback failures are not fully queryable           | P30     | `npm run check:p30:diagnostics`                         | `docs/testing/P30-DIAGNOSTIC-REPAIR-EVIDENCE.md`                                        | Journey C                                                 |
| R5-GAP-08 | Studio and standalone Player checkpoints are not compared from one input log                 | P30     | `npm run check:p30:parity`                              | `docs/testing/P30-STUDIO-PLAYER-PARITY-EVIDENCE.md`                                     | Journey C/E                                               |
| R5-GAP-09 | Tank still includes placeholder/debug presentation and incomplete release feedback           | P31     | `npm run check:p31:tank`                                | `docs/testing/P31-TANK-COMPLETION-EVIDENCE.md`                                          | Journey C                                                 |
| R5-GAP-10 | One Copilot Goal has not produced reviewed assets, repairs, tests, and both packages         | P31     | `npm run check:p31:completion-run`                      | `docs/testing/P31-COPILOT-RUN-EVIDENCE.md`                                              | Journey A–C/E                                             |
| R5-GAP-11 | Long Goal restart, reconciliation, exactly-once effects, and budget integrity are unproved   | P32     | `npm run check:p32:recovery`                            | `docs/testing/P32-GOAL-RECOVERY-EVIDENCE.md`                                            | Journey D                                                 |
| R5-GAP-12 | No uninvolved participant has completed the installed-Studio workflow without coaching       | P33     | `npm run check:p33:human-evidence`                      | `docs/testing/ROUND-05-OBSERVATION-RESULT.json`; `docs/testing/P33-RELEASE-EVIDENCE.md` | Journey A / Journey B / Journey C / Journey D / Journey E |

## Claim-to-observation rule

| Implementation claim                               | Machine gate                       | Required human outcome                                                                                                                        |
| -------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability routing and provider authorization work | P29 media/providers                | Participant identifies the effective capability, provider, model, credential reference, cost state, and wait reason without seeing a secret   |
| Candidate review and transactional import work     | P29 review/import                  | Participant compares playable/renderable candidates, selects or rejects one, reviews the ChangeSet, verifies import, then verifies rollback   |
| Runtime visual/audio diagnosis works               | P30 observation/diagnostics/parity | Participant understands the captured evidence and accepts the Copilot diagnosis without coordinates, DOM, terminal, or direct file inspection |
| Copilot completes the Tank game                    | P31 tank/completion-run            | Participant plays menu-to-win/lose/restart in Studio and standalone Player and accepts the reviewed art/audio                                 |
| Goal recovery and budgets are durable              | P32 recovery                       | Participant interrupts every named wait/failure state and observes honest resume without duplicate provider or project effects                |
| R5 is releasable                                   | P33 human-evidence                 | An uninvolved participant completes Journeys A–E without coaching or forbidden workaround; every blocker is closed on a clean rerun           |

## Ownership policy

- Machine probes are maintained by the phase implementing the capability.
- Human outcomes are recorded only in
  `docs/testing/ROUND-05-HUMAN-OBSERVATION.md` and its signed result artifact.
- A row may be implemented before its human run, but remains `validation`, not
  `completed`, until both evidence columns resolve.
