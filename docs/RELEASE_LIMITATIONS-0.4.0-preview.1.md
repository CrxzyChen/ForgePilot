# AI Game Studio 0.4.0 Preview 1 limitations

- Version: `0.4.0-preview.1`
- Target: Windows x64, unsigned portable ZIP
- State: candidate for Round 05 qualification, **not independently human accepted**
- Evidence: `docs/testing/P31-FINAL-PLAY-EVIDENCE.md` and the Round 05 checklist

## What this candidate is for

Round 05 connects the Studio Copilot's Goal and Plan to structured media jobs,
candidate review, transactional imports, runtime observations, tests, and game
packages. The supervised original Tank project has nine imported images, ten
audio resources, 22 tests / 276 assertions, and Development / Release archives.
This evidence demonstrates that particular workflow; it does not establish that
an unfamiliar developer can complete it without assistance.

## Distribution and engine scope

Studio includes Electron, Player, script host, Engine MCP, templates and the
Codex app-server dependency. A global Node.js, Rust or Codex installation is not
required to run the portable application. Source builds do require the documented
development toolchain. There is no installer, signing, automatic updater or Store
release. Removing the portable application leaves projects and user data intact.

Windows x64 is the only delivered target. The engine supports the implemented 2D
sprite, input, deterministic AABB physics, script, audio and UI slices. Its 3D
slice covers cameras, primitives, static OBJ meshes, simple materials, lighting,
transform hierarchy and deterministic AABB interactions. PBR, shadows, skeletal
animation, complex physics constraints, networking, rich animation/layout suites,
and mobile / Web / mini-program export are not delivered. The isolated script
host is not advertised as a security boundary for hostile third-party projects.

## AI and media

Copilot requires supported sign-in and network access. Provider credentials live
in the OS-user credential store, not the project. Configured provider/model
routes and actual account access determine which media can be generated.
OpenAI and Bailian image, supported Bailian speech, and ElevenLabs sound-effect /
music paths have scoped adapters; a discovered model is not proof that every
capability or account entitlement works. Video and unrestricted provider/model
compatibility are not claimed. Provider price, availability and terms remain
external. Unknown cost is not reported as free.

Generation authorization, candidate selection and ChangeSet approval are separate
gates. Explicit owner delegation for the supervised test project does not allow
the project agent to approve itself, expose credentials or widen global policy.
Cancellation and timeout may require reconciliation rather than another billed
request. Audio decoding, waveforms and machine assertions do not prove perceptual
quality. Provenance records do not replace license or commercial-use review.

## Qualification boundary

The build manifest binds the exact source commit, Git tree and source-file hash.
An eligible acceptance kit must match that clean 0.4.0 source checkout; a renamed
old archive or dirty working tree is not sufficient. Checks and isolated replay
remain machine evidence, not independent human acceptance or proof of physical
network isolation.

`R5-OBS-001` remains open until a qualifying independent participant completes
Journeys A–E in the role-separated kit and the signed evidence passes its offline
validator. Do not present this candidate as a generally production-ready engine
or Round 05 as fully delivered before that gate passes.
