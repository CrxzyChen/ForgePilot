# Executable project test assertions

`test.run` executes `assertions` in the selected `tests/*.test.json` against
the seeded, fixed-tick runtime snapshots. Plain strings are rejected with
`TEST_ASSERTION_INVALID`; put prose in `documentation`. A replay without
assertions or expected hashes is labeled smoke-only, not gameplay verification.
The replay's declared `scene` is honored instead of silently substituting
the project's entry menu. An explicit caller scene remains an override.
Inline test documents also supply `scene`, `ticks`, `seed`, inputs and controls;
when a replay is referenced, its values override those inline defaults.

```json
{
  "schemaVersion": "1.0.0",
  "kind": "runtime-scenario",
  "replay": "replays/pause.replay.json",
  "assertions": [
    {
      "id": "assertion:paused-position",
      "tick": 18,
      "target": {
        "objectId": "game:player",
        "componentId": "game:player/transform",
        "field": "position"
      },
      "operator": "equals",
      "compareTick": 8
    }
  ]
}
```

Use the project's actual semantic object/component IDs. `field` is an
optional dot-separated object property path into component data, or into
the object when no component is selected. Array indexes, prototype paths,
unknown keys, duplicate assertion IDs and invalid ticks are rejected.

Operators: `equals`, `notEquals`, `lessThan`, `greaterThan`, `exists`, `absent`.
Comparisons require exactly one of a literal `expected` or `compareTick`.
Existence checks accept neither. A missing snapshot always fails; a missing
value cannot pass `notEquals`. Deep equality supports vectors and structured
data. Failure produces `TEST_ASSERTION_FAILED`, target IDs, source test path,
tick, expected/actual values and a failed runtime result.

Evidence: `npm run check:p31:assertions` uses an isolated copy of the real
runtime fixture. The regression first failed on the old loader (prose silently
passed), then passed after implementation. It tests positive and deliberately
wrong expectations, missing snapshots/targets, cross-tick comparison and
malformed authoring. This is engine evidence, not proof that the user's Tank
project has finished its gameplay tests.

The bundled example tests now distinguish executable baseline assertions from
their prose `documentation`. This migration does not certify the behavior
described by every old prose line. The compiled P32 bridge gate executes the
migrated Tank fixture test, while P31 additionally checks inline tick/seed and
alternate-scene selection.

`script.api` exposes the installed engine's canonical `scripts/game-sdk.d.ts`
and content hash without modifying the project. An older project can compare
its SDK (`projectMatches`) and migrate through a reviewed ChangeSet. Audio bus,
clip playback and Prefab APIs must be discovered from that installed contract,
not inferred from an outdated project declaration file.

## UI content containment

`fitsUiContent` verifies the complete projected UI text block (including every
line) or a button label, using the same bitmap-font measurement as runtime
observation. It does not mistake `core:ui-transform.size` for glyph bounds.
This is pure, device-free derived geometry and does not add test state to the
game's Components or presentation Systems.

```json
{
  "id": "assertion:help-content-960",
  "tick": 12,
  "target": {
    "objectId": "game:help-copy",
    "componentId": "game:help-copy/text"
  },
  "operator": "fitsUiContent",
  "expected": {
    "container": {
      "objectId": "game:help-panel",
      "componentId": "game:help-panel/image"
    },
    "inset": { "left": 0.1, "right": 0.1, "top": 0.15, "bottom": 0.15 },
    "viewport": { "width": 960, "height": 540 },
    "minimumMargin": 6
  }
}
```

Both targets use actual authored object/Component IDs, never renderer handles.
The text Component may be `ui:text` or `ui:button`; the container may be
`ui:image` or a button background. Each inset is a fraction of the corresponding
panel width/height; paired fractions must sum to less than one. `minimumMargin`
is in viewport pixels. Repeat for required screen states and resolutions.
When target and container identify the same `ui:button`, the operator checks
the visible label against its own hit area, including a transparent background.
This does not certify a decorative panel or clickability. A transparent
container for a different target, an invisible label or a hidden button still
fails. Geometry diagnostics distinguish `button-hit-area` from `panel-interior`.
`field` and `compareTick` are invalid for this operator. Viewports are positive
integer dimensions no greater than 8192. Unknown keys and invalid margins fail
parsing. Missing, ambiguous, hidden, empty, rotated or off-screen text/panel
conditions fail rather than passing vacuously. Failed diagnostics include
`state.uiContent` with derived bounds, interior, four margins and a reason.

Insets are the author's declared art interior and still require real-frame
review: the operator cannot infer decorative borders, prove contrast, resource
health or visual quality. It is a containment check, not a replacement for
resource diagnostics, image inspection or independent human acceptance.

`npm run check:p31:assertions` now also executes real seeded fixtures covering
two-resolution multiline/long-label overflow, visibility/missing/empty targets,
button labels, image panels, viewport clipping, invalid expectations and the
compiled MCP `test.run` / `test.result` pass/fail and durable-result path.

To verify the shipped bridge instead of the workspace build, run
`node scripts/check-p31-ui-content-assertions.ts <extracted-Studio-directory>`.
The probe uses that package's Engine MCP, Electron Node runtime and script host with
an isolated fixture and sanitized environment; it records the three file hashes
in `results.json`. It does not open the owner project or load its credentials.
