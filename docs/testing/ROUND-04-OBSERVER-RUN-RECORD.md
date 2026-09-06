# Round 04 independent observation run record

This record is completed by the observer. Do not give it to the participant
before or during the run; the participant receives only
`ROUND-04-PARTICIPANT-TASKS.md`, the candidate ZIP, and its SHA-256 sidecar.

## Identity and environment

| Field                                                 | Recorded value                                            |
| ----------------------------------------------------- | --------------------------------------------------------- |
| Observation ID                                        |                                                           |
| Date and timezone                                     |                                                           |
| Observer and signature                                |                                                           |
| Participant identifier and signature                  |                                                           |
| Participant experience                                |                                                           |
| Confirmation participant never used this Studio build |                                                           |
| Consent for screen/voice recording                    |                                                           |
| Windows version and clean-profile evidence            |                                                           |
| Display resolution and scale                          |                                                           |
| Candidate filename                                    | `AI-Game-Studio-0.3.0-preview.1-scene-ux-fix-win-x64.zip` |
| Verified SHA-256                                      |                                                           |
| Start / end / active duration                         |                                                           |
| Test-provider credential label, not secret            |                                                           |

## Journey result

| Journey                     | Started | Completed without help | Active time | Output project/package hash | Recording time range | Result |
| --------------------------- | ------- | ---------------------- | ----------: | --------------------------- | -------------------- | ------ |
| A — Workspace and Play Mode |         |                        |             |                             |                      |        |
| B — Complete 2D mechanic    |         |                        |             |                             |                      |        |
| C — Honest minimum 3D       |         |                        |             |                             |                      |        |
| D — IDE and provider        |         |                        |             |                             |                      |        |

## Observation events

Add one row for every hesitation, wrong turn, failure, recovery, use of visible
help, crash, or possible data/credential issue. Do not omit a finding because
the participant later recovered.

| Time | Journey/step | Visible state | Participant expectation | Actual result | Recovery/assistance | Severity | Owner | Evidence |
| ---- | ------------ | ------------- | ----------------------- | ------------- | ------------------- | -------- | ----- | -------- |
|      |              |               |                         |               |                     |          |       |          |

Severity uses the authoritative definitions in
`ROUND-04-HUMAN-OBSERVATION.md`: blocker, major, or minor. Any observer coaching
makes the affected step a failure.

## AI, runtime, and package evidence

| Evidence                                | ID, path, or hash |
| --------------------------------------- | ----------------- |
| Codex task IDs                          |                   |
| Plan and ChangeSet IDs                  |                   |
| Applied and rolled-back transaction IDs |                   |
| Test result artifacts                   |                   |
| Runtime session and replay hashes       |                   |
| Development package hashes              |                   |
| Release package hashes                  |                   |
| Crash/recovery evidence                 |                   |
| Credential scan evidence                |                   |
| Screen/voice recording hash             |                   |
| Collected project archive hashes        |                   |

## Findings and retest decision

| Finding ID | Severity | Owner phase | Status | Fix evidence required | Clean-profile retest required |
| ---------- | -------- | ----------- | ------ | --------------------- | ----------------------------- |
|            |          |             | open   |                       | yes                           |

- [ ] No terminal, external IDE, engine checkout, direct JSON edit, DOM
      automation, private MCP call, or manual workaround was used.
- [ ] No coaching occurred.
- [ ] Studio and standalone behavior matched for all required features.
- [ ] No credential appeared in projects, Git, logs, ChangeSets, replays, or
      packages.
- [ ] All output artifacts and recordings were collected and hashed.
- [ ] No blocker remains open, or every fixed blocker passed a new clean-profile
      retest.

Final decision: `PASS / FAIL / RETEST REQUIRED`

Observer signature/date:

Participant signature/date:

## Evidence validation handoff

After both signatures are present:

1. Save the completed record under the adjacent `evidence` directory.
2. Put the consented recording, two project archives, Development and Release
   packages, test results, replay evidence, and credential scan evidence under
   that same directory.
3. Fill `OBSERVATION-RESULT.json` with the durable IDs and relative evidence
   paths. Do not copy a credential or other secret into this file.
4. Run `Validate-Human-Evidence.cmd` from the observer directory.

The command rehashes the approved Studio candidate and every collected evidence
file, rejects missing journeys, coaching, external tools, open blockers, or
missing AI/ChangeSet evidence, and writes `ACCEPTANCE-PROOF.json`. A generated
proof does not authenticate the signatures and does not replace the original
recording or signed record.
