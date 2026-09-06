# P31 completed project handoff

- Source author: original Studio Copilot, thread `01a065c3-df50-7d11-87f5-d5c2f60cab69`
- Game revision: `d7ea102d392376aaddecd5a0923ca9c70c811f7622c76bd06716a94e86e1d78f`
- Evidence: `artifacts/r5-completed-project-export-nmj4eW/summary.json`
- Supervisor role: read original bytes, copy, scan and validate an isolated copy;
  no game authoring, regeneration or build replacement

## Delivered local artifacts

All three archives are under `artifacts/r5-completed-project-export-nmj4eW/`.

| Artifact                              | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `Tank-Completed-Project-d7ea102d.zip` | `0868333e93d6d2177306f2f0ecc5be21d8f417fadc8af853438d703f89dc8a3d` |
| `Tank-0.1.0-development-win-x64.zip`  | `112c2b31707d4d79f90a710557ffdccde831747f35d02bc7585bcb2a4f9b5d97` |
| `Tank-0.1.0-release-win-x64.zip`      | `95aac9da3c83ed6f4bc0ad94b44c8c606d981a1335f3ffd206c3aa147fa1b448` |

To play, extract the Release archive and run `Tank.exe`. To inspect or continue
authoring, extract the completed project archive and open its project folder
from Studio. Account credentials are configured separately in Studio.

## Verified scope

The project archive preserves 163 source files exactly, including the 19 selected
assets, provenance sidecars, project instructions and portable engine MCP
configuration. It excludes `.git`, `.aigame`, account state, build output,
dependencies and environment files. The original project retains its full
conversation, jobs, reviews and audit history; this source archive intentionally
does not transplant that local history into a new project.

The isolated copy passes Project Doctor and the actual `project.validate`
command. Doctor records the expected absent-Git and unavailable-MCP-handshake
warnings; those were not converted into false handshake evidence. Asset bytes,
all provenance sidecars and license/restriction metadata are present. Both
existing game archives retain their exact hashes and exclude AI/local state.
Credential-shaped text scans passed across source and package text. Extraction
and re-hashing prove the source archive preserves every supplied file. Original
full source-file hashes and game revision match before and after this operation.

The stronger gameplay, dependency reachability, deterministic replay and native
runtime evidence is in `P31-FINAL-PLAY-EVIDENCE.md`: all 19 assets and six Prefabs
are reachable, with no orphaned assets. No tests or gameplay were rewritten for
this handoff.

These checks do not detect every possible concealed secret, prove commercial
asset licensing, establish physical network isolation or replace independent
Journeys A–E. The recorded `provider-output` license field is metadata, not a
commercial legal clearance. This is the test-project handoff, not a public Store
release or a signed human acceptance result.
