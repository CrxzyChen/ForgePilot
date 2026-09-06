# Engine MCP and project Skills

AI Game Studio does not ask Codex to click the editor. Each project configures
the `ai-game-engine` MCP server and contains Skills that teach Codex when and
how to use its stable semantic tools.

## Authority and approval

Read tools return project files, stable IDs, schemas, references, diagnostics,
runtime traces, test results, and build reports. Mutation tools create a durable
proposal only. They do not change project authority until the developer reviews
and approves the ChangeSet in Studio.

The normal write path is:

```text
discover/query → change.propose → validate → review Diff → approve → apply
               → run/test/build → audit → exact rollback if needed
```

## Tool groups

- Project: `project.get_info`, `project.list_files`, `project.read_file`,
  `project.search`, `project.references`, `project.validate`.
- Source control and diagnostics: `source_control.diff`, `diagnostics.list`,
  `audit.list`.
- Authoring: `scene.*`, `scene.object.*`, `scene.transform.*`,
  `scene.component.*`, `prefab.*`, `resource.*`, `input.define_action`,
  `collision.define_rule`.
- Runtime and debug: `runtime.run`, `runtime.input`, pause/resume/step/restart/
  stop/state/performance/trace, `runtime.hot_reload`, semantic breakpoints and
  state watches. Runtime results carry the stable Session ID, Generation,
  sequence, Tick, `RenderSnapshot`, and `DebugSnapshot` used by Studio and the
  standalone Player.
- Validation and output: `replay.run`, `test.run`, `test.result`, `build.windows`,
  `build.read_report`, `release.package`, `build.verify_package`,
  `build.read_verification`.
- Assets: list/inspect/dependencies plus provider-neutral generate/retry jobs
  and `asset.recommend`, plus bounded candidate-only `asset.master_audio`.
  Project Codex can recommend, but cannot impersonate
  the reviewer; selection is recorded through Studio's configured review path.
- Discovery: `capabilities.list` and `component.types` expose the same
  registries used to populate Studio controls.

`project.references` connects Scene objects, Component instances and types,
behavior bindings, modules, Systems, Commands, Events, payload schemas, and
script message use sites. Locations include exact project file, line, and
column.

## Bounded discovery and durable test evidence

`change.list` and mutation-proposal replies return compact state, semantic IDs,
file paths, hashes and operation descriptions. They do not inline every
historical source file or replay. `change.read({id})` returns the complete
operations, before/after diffs and validation evidence for an exact proposal.
This projection does not change approval, content hashing or rollback.

`test.run({path})` returns `passed`, `status`, all diagnostics, the runtime
state hash, evidence counts, the test message and a `testRunId`. A failed test
is also an MCP tool error, not a successful-looking tool envelope. A smoke-only
message still means there were no behavior assertions; it is not proof of
gameplay correctness. `test.result({id: testRunId})` reads the full report
without another run. Reports are local derived artifacts under
`.aigame/local/test-results/`; later tests do not overwrite earlier IDs.

`collision.define_rule` is symmetric and accepts `block`, `event`, `overlap`,
or `ignore`. Like every AI-originated mutation, it creates a durable ChangeSet;
on a fresh project the versioned `physics/collision-layers.json` authority is
created only after approval and apply.

## Project Skills

### Bounded Windows package verification

`build.verify_package({profile, expectedZipSha256})` verifies an existing ZIP
against the current build report and its conservative `projectRevision`. It
does not rebuild, edit game authority or accept raw commands. ZIP paths,
expansion budgets, file hashes, the manifest, Release exclusions and the
installed trusted Player identity are checked before launch. A private local
snapshot is extracted; startup self-check and five native GPU frames run with
only the Windows system environment, never inherited provider credentials.

The result includes a content-addressed `package-verification:` ID, PNG path
and hash under `.aigame/local/package-verifications/`. Read it with
`build.read_verification({id})`, which checks receipt and frame integrity.
Historic receipts apply only to their recorded project revision and ZIP.
These checks are not full-gameplay replay, audible review, network isolation
or independent P33 acceptance; a missing GPU/window capability is a failure,
not a simulated pass. Old reports without a project revision must be rebuilt.

### Prefab identity and explicit synchronization

`prefab.apply` preserves matching source Component IDs and `prefab.revert`
preserves matching instance IDs. New instances derive Component IDs from their
object and source Component identities, not array positions. Legacy unique
types can be matched safely; ambiguous repeated types fail without mutation.
For that case pass `componentIds: { "source:component/id": "instance:component/id" }`
in the semantic command input. Unknown, reused or type-incompatible targets
are rejected. Inspect the ChangeSet before approval; revert resets values such
as Transform, so retain deliberate instance placement in the same transaction.

The current format uses explicit source apply / instance revert synchronization,
not automatic live inheritance. Updating a reusable default does not silently
rewrite other Scene files; those refreshes also require reviewed ChangeSets.

New projects initialize Skills under `.agents/skills/`:

- `author-scene`: inspect before editing; use stable IDs and Scene commands.
- `author-2d-scene` or `author-3d-scene`: dimension-specific capability rules.
- `author-ui`: screen-space menus, HUD, semantic buttons, live state and actual
  frame/interaction checks. Included in every new preset; enabling `ui` still
  requires its normal ChangeSet. Existing projects are not silently rewritten
  by a Studio update; add a missing guide through reviewed project authoring.
- `author-gameplay-feature`: declare Components, modules, Systems, Commands,
  Events, input, tests, and replay evidence together.
- `author-prefab-resource`: create reusable content and preserve dependencies.
- `build-and-test-game`: validate, run, replay, test, and read structured output.
- `repair-game-failure`: navigate diagnostics and propose the smallest repair.
- `prepare-standalone-release`: enforce the player-only Release boundary.

A Skill is operating guidance, not a privileged plugin. It must use listed MCP
tools and documented project files; it cannot bypass review, credentials,
sandbox, budgets, or path containment.

## Adding AI-operable features

A new capability is incomplete until it provides all of these from one
registry entry: file schema/version, human Inspector or document UI,
machine-readable query, typed semantic command, MCP discovery/action,
diagnostics, headless success/failure test, project Skill guidance, ChangeSet
and audit output, and exact undo/rollback behavior.

Provider credentials are configured in Studio's secure AI Tools settings.
Projects retain only provider aliases and `ref:` identifiers; MCP and renderer
APIs cannot read the secret value back.
