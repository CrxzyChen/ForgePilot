# P26 daily IDE and provider evidence

- Date: 2026-09-04
- Gate: `npm run check:p26`
- Status: machine gate passed; Journey D remains unobserved
- Human source: `docs/testing/ROUND-04-HUMAN-OBSERVATION.md`

P26 closes the known implementation placeholders for ordinary Studio work. It
does not claim that an uncoached participant has completed Journey D. The
machine gate uses a disposable copy of Tank Arena and a local HTTP-compatible
provider fixture; it never sends a paid request.

## Daily workflow result

The disposable project proved:

- one project test was discovered and run; removing all tests caused
  `TEST_SUITE_EMPTY` instead of a false success;
- a real project hook breakpoint paused execution and returned one call-stack
  frame plus three named scopes; Watch and fixed-Tick controls use the same
  runtime state;
- Studio commands created a commit, read history, created/switched branches,
  pushed/popped a Stash, listed remotes, and detected a real merge conflict;
- capability enable/disable was transactional and Undo restored the exact
  project manifest;
- a Prefab instance/source comparison reported one real override;
- the renderer contains discoverable File/Edit/View/Project/Run menus, file and
  resource Inspector actions, task output, external-file conflict handling,
  Prefab isolation, a material preview, and an animation timeline.
- every central document, including Project Overview, has a visible close
  control; the tab context menu executes close current/right/others/all with
  one aggregate unsaved-document safeguard. The File dropdown is positioned
  from its trigger and uses the compact Studio typography instead of the
  browser-default font size.

The latest gate emitted:

```json
{
  "discoveredTests": 1,
  "debugger": { "callStack": 1, "scopes": 3 },
  "git": { "conflictDetected": true },
  "settings": {
    "autosave": "delay",
    "contextScope": "scene",
    "plaintextRejected": true
  },
  "provider": {
    "id": "aliyun-bailian",
    "candidates": 1,
    "estimatedCostCny": 0.14,
    "actualCostCny": 0.14,
    "cancelled": true,
    "voiceCandidates": 1,
    "paidRunRequiresApproval": true,
    "configurableApprovalPolicy": true,
    "capabilityRoute": "image -> openai/gpt-image-2",
    "speechGenerationRoute": "speechGeneration -> aliyun-bailian/qwen-audio-3.0-tts-flash",
    "discoveredModels": { "bailian": 5, "openai": 4 },
    "dynamicallyDiscoveredModel": "gpt-image-newly-discovered",
    "secureMainProcessBridge": true,
    "legacyConfigMigrated": true,
    "secretRedacted": true
  },
  "specializedEditors": ["material", "animation", "prefab"],
  "prefabOverrides": 1
}
```

## Provider boundary

`StudioAssetJobBroker` now resolves media capabilities through
`.ai/tool-routing.json`. The bundled route maps images to OpenAI
`gpt-image-2` and speech generation to Bailian
`qwen-audio-3.0-tts-flash`; the Agent can omit both provider and model. The
legacy `audio` key remains readable. Credential Management keeps named,
provider-specific profiles; OpenAI `GET /models` and Bailian
`GET /api/v1/models` populate selection without waiting for a Studio release.
Remote-provider dropdowns now contain only models returned by those calls and
display API source, compatible/total counts, and fetch time. Static project
adapter metadata cannot silently become a remote choice; manual IDs live in a
separate labeled mode, while the local deterministic provider keeps its own
explicit built-in catalog. A compatible newly discovered image/TTS model ID is
accepted by the broker. Each task snapshots
the resolved credential reference, model, parameters, cost-estimate state, and
approval evidence. Unknown prices are labeled unknown instead of displayed as
free.

Paid-call approval is now a global Studio user choice: `always` waits for a
human action, `budget` auto-runs only when a configured CNY estimate is inside
the user limit, and `auto` records policy pre-authorization. Unknown price
continues to wait in budget mode. Project files and Agent prompts cannot change
that setting. Candidate review, cancellation, provenance, and explicit import
remain in every mode.

Direct MCP generation uses an ephemeral authenticated loopback bridge into
Electron main. The OpenAI/Bailian API key is resolved there from the encrypted
operating-system vault and is never returned to the renderer or MCP process.
The bridge is project-scoped and accepts only the asset-tool allowlist. Endpoint,
region, and Workspace ID remain fields of the named encrypted credential
profile; the project versions only an opaque credential reference and the
capability/model policy.

The conformance test injected a secret, proved that `always` and unknown-price
`budget` jobs sent zero requests, exercised OpenAI base64 image, Bailian image,
and WAV speech response/download paths, selected and imported an image
candidate, then scanned all project text. The secret was absent. A separate MCP
process sent a capability-only request over the local bridge without provider,
model, or credential fields. Mock provider APIs returned five Bailian and four
OpenAI models across image, video, ASR, and TTS capabilities; catalog results
contained no secret. A running request ended as `cancelled` through
`AbortController`. An isolated legacy `1.0.0`
`external-http` project was upgraded to a six-model `2.0.0` catalog. Endpoint
and candidate URL allowlists, MIME checks, redirect rejection, and a 25 MiB
candidate limit are enforced before import.

The repair gate also starts from a schema `2.0.0` project whose provider file
predates OpenAI support and proves the built-in OpenAI adapter is restored.
P15 migrates endpoint/region/workspace values from legacy global provider
connections into the matching named credential without decrypting or replacing
its secret, then removes all obsolete provider and credential-selection keys.
The UI contract proves a provider-discovered OpenAI image model reports the
same executable readiness as the broker, while video, music, and speech
recognition remain honestly route-only until their adapters are delivered.

`local-placeholder` remains available for deterministic tests, but its health
record and UI label both state that it is not an AI service. It cannot be
mistaken for evidence that a real provider worked.

## Settings-effect matrix

| Visible value             | Effective consumer or explicit boundary                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Locale                    | Fixed/disabled as Simplified Chinese for 0.3.0 Preview; no false English option                       |
| Autosave                  | `focus` saves on window blur; `delay` saves after one second                                          |
| Startup Scene / Tick rate | Versioned `settings/project.json`; consumed by runtime and build services                             |
| Renderer adapter          | Disabled with reason; WebGL2 Studio + wgpu Player are fixed in this Preview                           |
| Build target              | Disabled with reason; Windows x86_64 is the only delivered target                                     |
| Default Agent mode        | Initializes the Copilot composer                                                                      |
| Reasoning / approval      | Applied to Codex App Server turns and workspace permissions                                           |
| Goal enabled / budget     | Controls Goal availability and default `thread/goal/set` budget                                       |
| Plan visible              | Controls the persistent Plan surfaces in Copilot                                                      |
| Context scope             | Adds project, current Scene, or current file references to every turn                                 |
| Engine MCP                | Changes thread configuration; Studio preserves the old conversation and creates an effective new one  |
| Project Skills            | Changes Codex skill roots and per-project skill enablement                                            |
| Credential management     | Creates multiple named profiles per provider; renders provider-specific fields and write-only secrets |
| Model discovery           | Calls the selected credential's provider API and classifies the returned capability catalog           |
| Generation tools          | Separately selects provider, named credential, and model for all five media capabilities              |
| Model choice              | Remote select contains only provider API results; manual IDs are a separate labeled mode              |
| Agent capability routes   | Versions image and speech-generation routes in `.ai/tool-routing.json`                                |
| Credential reference      | Stores only an opaque route/job reference; Electron main resolves the encrypted secret at call time   |
| Provider fields           | Keeps endpoint, region, and workspace in the named credential instead of a duplicate settings card    |
| Generation approval       | Applies `always`, known-price `budget`, or user-preauthorized `auto` to every Agent call and retry    |

Settings that are not implemented are absent or disabled with a reason. The
former inert settings-search field was removed rather than presented as a
working search feature.

## AI parity

Engine MCP now exposes test discovery/run, Git status/history/branch/Stash/
remote/commit workflows, Prefab override inspection, provider health/estimate/
cancel, and transactional capability changes. Project Skills tell Codex not to
accept an empty suite, how to use debugger evidence, how to preserve unrelated
Git work, and how to obtain explicit human authorization for paid generation.
All updated Skills pass `quick_validate.py`.

## Honest remaining boundary

Journey D still needs a new participant on a packaged Studio build. The machine
gate cannot prove discoverability, visual quality, provider-account validity,
or that a person can finish without coaching. P27 retains that blocker.
