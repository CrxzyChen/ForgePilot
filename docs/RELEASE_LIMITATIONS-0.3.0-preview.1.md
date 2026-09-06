# AI Game Studio 0.3.0 Preview 1 limitations

- Release: `0.3.0-preview.1`
- Target: Windows x64 portable ZIP
- Release state: machine-qualified release candidate; independent human
  acceptance remains open
- Evidence: `docs/testing/P27-PREVIEW-RELEASE-EVIDENCE.md`

This Preview is intended to validate a file-native, AI-controllable game
authoring loop. It is not yet a general replacement for a mature commercial
engine and must not be described as human-proven until the Round 04 observation
protocol is signed off.

## Distribution

- The package is an unsigned portable ZIP. There is no installer, code signing,
  automatic updater, repair flow, or Store distribution.
- Windows x64 is the only Studio and Player target. macOS, Linux, Web, mobile,
  console, and mini-program export are not included.
- The package includes Electron, the native Player, script host, Engine MCP,
  project templates, and Codex app-server dependency. It does not require a
  global Node.js, Rust, or Codex installation.
- Removing the extracted application directory uninstalls the portable build;
  user projects and the separate user-data directory are intentionally retained.

## Runtime and authoring scope

- 2D covers Camera2D, Shape2D/Sprite2D, PNG/JPEG/WebP and static SVG resources,
  atlas regions, keyboard/pointer actions, deterministic AABB physics,
  WAV/OGG audio, and the menu/HUD/pause/win/lose UI slice required by the
  reference projects.
- 3D covers perspective Camera3D, depth-tested primitives and imported static
  OBJ meshes, transform hierarchy, basic material color/texture, one
  directional light, picking/navigation, and deterministic AABB Collider3D /
  RigidBody3D interactions.
- PBR materials, shadows, skeletal animation, particles, terrain, navigation,
  networking, rich text/layout, complex animation graphs, and general-purpose
  physics constraints are not shipped.
- The physics adapter is deterministic and intentionally minimal; it is not a
  full rigid-body solver.
- QuickJS project scripts are isolated from normal Node.js APIs, but the script
  host is not claimed as a security boundary for executing hostile third-party
  code.

## IDE and source control scope

- The built-in task surface executes registered engine/test/build tasks. It is
  not an unrestricted shell or terminal emulator.
- Git covers status, Diff, stage/unstage, commit, history, branches, conflicts,
  stash, remotes, and fetch. Authentication and hosting-provider account setup
  remain the responsibility of the user's Git installation.
- Material, animation, and Prefab editors are minimum specialized workflows,
  not full production suites.
- Simplified Chinese is the only enabled Studio locale in this Preview. Other
  visible but unsupported renderer/build targets are disabled with reasons.

## AI and generated assets

- Project Codex requires a supported ChatGPT/Codex sign-in. AI output is always
  reviewable through the project files and ChangeSet path; it is not accepted as
  automatically correct.
- Production adapters cover OpenAI GPT Image 2, Alibaba Cloud Model Studio
  image models, and Bailian non-real-time Qwen Audio TTS. Each provider uses a
  separate OS-protected credential reference; project capability routes choose
  the model without exposing that credential to Codex.
- Paid generation defaults to per-call approval. The user may instead enable a
  known-CNY per-job limit or explicit automatic pre-authorization in AI Tools;
  unknown price still waits in budget mode. Candidate import remains reviewable.
- Provider network access is restricted to configured HTTPS/allowlisted hosts,
  downloaded candidates have MIME and size limits, and credentials are redacted
  from project state, logs, ChangeSets, replays, and packages.
- The built-in local placeholder/test-fixture generator is deterministic test
  infrastructure, not an AI image or audio service. Production video generation
  is not connected in this release.
- Provider availability, pricing, quotas, and regional policy are external and
  may change independently of Studio.

## Acceptance boundary

Automated gates prove deterministic execution, package composition, secret
exclusion, runtime recovery, and installed-style lifecycle behavior. They do not
prove that a new developer can discover and complete the full workflow without
coaching. `R4-OBS-001` remains the release blocker until the journeys in
`docs/testing/ROUND-04-HUMAN-OBSERVATION.md` are completed and signed.
