# Round 05 independent observation run record

This record is completed by the observer. Do not give it to the participant
before or during the run. The participant receives only the contents of the
kit's `participant` directory.

## Identity and environment

| Field                                               | Recorded value |
| --------------------------------------------------- | -------------- |
| Observation ID                                      |                |
| Date, timezone, start, and end                      |                |
| Observer identifier and signature                   |                |
| Participant identifier and signature                |                |
| Participant experience                              |                |
| Confirmation participant did not implement Round 05 |                |
| Confirmation participant never used this candidate  |                |
| Consent for screen and voice recording              |                |
| Windows version and clean-profile evidence          |                |
| Display resolution, scale, and locale               |                |
| Candidate filename and verified SHA-256             |                |
| Input Tank archive and verified SHA-256             |                |
| Named credential labels, never secrets              |                |
| Provider approval mode and maximum test budget      |                |

## Journey result

| Journey                               | Started | Completed without help | Active time | Recording range | Output hashes | Result |
| ------------------------------------- | ------- | ---------------------- | ----------: | --------------- | ------------- | ------ |
| A — Goal/Plan and readiness           |         |                        |             |                 |               |        |
| B — Media review and import           |         |                        |             |                 |               |        |
| C — Tank completion and repair        |         |                        |             |                 |               |        |
| D — Interruption and recovery         |         |                        |             |                 |               |        |
| E — Offline packages and continuation |         |                        |             |                 |               |        |

## Scheduled interruption matrix

Use separate clean runs or independent checkpoints. Record the operation ID
before interruption and after recovery.

| State                          | Before ID | Interruption | Restored state | Action | Duplicate side effect | Evidence |
| ------------------------------ | --------- | ------------ | -------------- | ------ | --------------------- | -------- |
| Provider executing             |           |              |                |        |                       |          |
| Waiting for paid approval      |           |              |                |        |                       |          |
| Waiting for candidate review   |           |              |                |        |                       |          |
| Waiting for ChangeSet approval |           |              |                |        |                       |          |
| Runtime/test running           |           |              |                |        |                       |          |
| Build running                  |           |              |                |        |                       |          |

## Observation events

Add an immutable row for every hesitation, wrong turn, diagnostic, failure,
recovery, contextual-help use, crash, direction change, approval, coaching
event, forbidden workaround, or possible data/credential issue. A later fix
does not erase the original row.

| Time | Journey/step | Visible state | Expected | Actual | Recovery/assistance | Class | Severity | Owner | Evidence |
| ---- | ------------ | ------------- | -------- | ------ | ------------------- | ----- | -------- | ----- | -------- |
|      |              |               |          |        |                     |       |          |       |          |

Class is `direction`, `required-gate`, `clarification`, `coaching`, or
`forbidden-workaround`. Severity is `blocker`, `major`, or `minor` as defined
by `OBSERVATION-PROTOCOL.md`. Coaching fails the affected step.

## Durable AI and engine evidence

| Evidence                                      | IDs, paths, hashes, and counts |
| --------------------------------------------- | ------------------------------ |
| Goal and initial prompt hash                  |                                |
| Plan steps and versions                       |                                |
| Tool Calls and failures/retries               |                                |
| Provider Jobs and idempotency keys            |                                |
| Estimates, approvals, and actual/unknown cost |                                |
| Candidate review decisions                    |                                |
| ChangeSets proposed/applied/rolled back       |                                |
| Runtime sessions and observations             |                                |
| Tests and Replay                              |                                |
| Development and Release builds/packages       |                                |
| Audit export and Completion Run checkpoint    |                                |
| Credential/project/package scans              |                                |
| Screen/voice recording                        |                                |

## Completed-game outcome

| Outcome                               | Result | Evidence |
| ------------------------------------- | ------ | -------- |
| Existing gameplay preserved           |        |          |
| Coherent reviewed visual assets       |        |          |
| Required audio and effective controls |        |          |
| Menu/help/HUD/pause/win/lose/restart  |        |          |
| Copilot runtime diagnosis and repair  |        |          |
| Deterministic tests and Replay        |        |          |
| Studio/Player checkpoint parity       |        |          |
| Offline Development package           |        |          |
| Offline Release package               |        |          |
| Credential and package security       |        |          |
| Restart/idempotency/budget integrity  |        |          |
| No coaching or forbidden workaround   |        |          |

## Findings and retest decision

| Finding ID | Journey/step | Severity | Owner | Status | Fix evidence | New clean-profile retest |
| ---------- | ------------ | -------- | ----- | ------ | ------------ | ------------------------ |
|            |              |          |       | open   |              | required                 |

- [ ] No terminal, external IDE, engine checkout, direct file repair, DevTools,
      DOM access, private API, or coordinate automation was used.
- [ ] No observer coaching occurred.
- [ ] No provider, import, ChangeSet, test, build, or package side effect was
      repeated because of restart.
- [ ] Budget and cost evidence reconciles to provider-visible operations.
- [ ] Studio and both standalone packages match at required checkpoints.
- [ ] No credential or private provider response appears in collected project,
      transcript, audit, logs, Diff, build, or package evidence.
- [ ] Every output and consented recording was collected and hashed.
- [ ] No blocker remains open; every fixed blocker has a new clean-profile
      retest record.

Final decision: `PASS / FAIL / RETEST_REQUIRED`

Observer signature/date:

Participant signature/date:

## Evidence handoff

1. Save this signed record under `observer/evidence`.
2. Add consented recordings, input and completed project archives, runtime
   observations, tests, Replay, audit/cost exports, scans, and both packages.
3. Complete `observer/OBSERVATION-RESULT.json` using only relative paths and
   stable IDs. Never record a credential secret.
4. Run `observer/Validate-Human-Evidence.cmd` while offline.
5. Preserve `ACCEPTANCE-PROOF.json` together with the signed record. The proof
   rehashes evidence but does not authenticate handwritten/digital signatures.
