import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';

import { ProjectError } from '../project/project-types.ts';
import {
  StudioChangeSetService,
  type StudioChangeSet,
} from '../workspace/studio-change-set-service.ts';
import { summarizeChange, summarizeTest } from './mcp-result-projections.ts';
import { StudioCommandRegistry } from '../workspace/studio-command-registry.ts';
import {
  StudioAssetJobBroker,
  normalizeAssetCapability,
  type AssetJobKind,
} from '../workspace/studio-asset-job-broker.ts';
import { StudioGameBuildService } from '../workspace/studio-game-build-service.ts';
import { CompletionRunService } from '../workspace/completion-run-service.ts';
import { capabilitiesForProject } from '../capabilities/capability-registry.ts';
import { runtimeStateHash } from '../runtime/runtime-observation-service.ts';
import type {
  RuntimeAudioEvent,
  RuntimeDiagnostic,
  RuntimeRenderSnapshot,
} from '../runtime/runtime-session-protocol.ts';
import type { SceneDocument } from '../workspace/scene-authoring-service.ts';

const MCP_PROTOCOL_VERSION = '2025-06-18';

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

const emptySchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
const pathSchema = {
  type: 'object',
  properties: { path: { type: 'string' } },
  required: ['path'],
  additionalProperties: false,
};
const tools: ToolDescriptor[] = [
  ['project.get_info', 'Read the versioned project manifest.', emptySchema],
  [
    'project.list_files',
    'List project-relative source and asset files.',
    emptySchema,
  ],
  ['project.read_file', 'Read one bounded project text file.', pathSchema],
  [
    'script.api',
    'Read the installed engine TypeScript SDK contract, including audio and Prefab APIs. Detect outdated project typings; refreshing them must use a reviewed ChangeSet, never a direct write.',
    emptySchema,
  ],
  [
    'completion.run_current',
    'Read the durable Completion Run after reconciling linked media jobs and ChangeSets. Returns null when no Goal run is active.',
    emptySchema,
  ],
  [
    'completion.run_list',
    'List durable Completion Runs, including stopped terminal runs but excluding presentation-removed runs.',
    emptySchema,
  ],
  [
    'source_control.diff',
    'Read the HEAD-to-workspace text Diff for one project file.',
    pathSchema,
  ],
  [
    'source_control.status',
    'Read Git branch and working-tree status.',
    emptySchema,
  ],
  ['source_control.history', 'Read recent Git commit history.', emptySchema],
  ['source_control.branches', 'List local Git branches.', emptySchema],
  ['source_control.stashes', 'List Git stash entries.', emptySchema],
  [
    'source_control.remotes',
    'List Git remotes without reading credentials.',
    emptySchema,
  ],
  [
    'source_control.commit',
    'Commit the already staged files with an explicit message.',
    {
      type: 'object',
      properties: { message: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['message'],
      additionalProperties: false,
    },
  ],
  [
    'source_control.branch_create',
    'Create and switch to a validated local Git branch.',
    {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  ],
  [
    'source_control.branch_switch',
    'Switch to an existing local Git branch.',
    {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  ],
  [
    'source_control.stash_push',
    'Stash tracked and untracked project changes.',
    {
      type: 'object',
      properties: { message: { type: 'string' } },
      additionalProperties: false,
    },
  ],
  [
    'source_control.stash_pop',
    'Apply one Git stash and report conflicts.',
    {
      type: 'object',
      properties: { ref: { type: 'string' } },
      additionalProperties: false,
    },
  ],
  [
    'source_control.remote_fetch',
    'Fetch and prune a configured remote using the system Git credential manager.',
    {
      type: 'object',
      properties: { remote: { type: 'string' } },
      additionalProperties: false,
    },
  ],
  [
    'project.search',
    'Search project text and return exact file, line, and column locations.',
    {
      type: 'object',
      properties: { query: { type: 'string', minLength: 1 } },
      required: ['query'],
      additionalProperties: false,
    },
  ],
  [
    'project.references',
    'Read the bidirectional Scene object, Component, script, System, Command, Event and Schema reference index.',
    {
      type: 'object',
      properties: { id: { type: 'string' }, path: { type: 'string' } },
      additionalProperties: false,
    },
  ],
  ['scene.list', 'List scene files and the current entry scene.', emptySchema],
  ['scene.inspect', 'Read one scene by project-relative path.', pathSchema],
  [
    'object.inspect',
    'Inspect one Scene object by stable semantic ID.',
    {
      type: 'object',
      properties: { id: { type: 'string' }, scene: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'component.types',
    'List Component schemas available to the project capabilities.',
    emptySchema,
  ],
  [
    'resource.dependencies',
    'Read incoming and outgoing resource dependencies.',
    pathSchema,
  ],
  [
    'resource.missing',
    'Scan all Scene, Prefab, script, setting, and capability files for missing project references.',
    emptySchema,
  ],
  ['prefab.inspect', 'Read one prefab file.', pathSchema],
  [
    'prefab.overrides',
    'Compare one Prefab instance with its versioned source and list overrides.',
    {
      type: 'object',
      properties: { scene: { type: 'string' }, objectId: { type: 'string' } },
      required: ['objectId'],
      additionalProperties: false,
    },
  ],
  ['asset.list', 'List project assets and provenance metadata.', emptySchema],
  [
    'asset.job_list',
    'List provider-neutral generation jobs and review states.',
    emptySchema,
  ],
  [
    'asset.register_tool_output',
    'Register one hash-bound output already produced by a Codex media tool into the Studio candidate-review queue. The file must already be in the controlled project candidate directory. This does not select or import it and does not infer provider authorization.',
    {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['image', 'soundEffect', 'music', 'speechGeneration'],
        },
        providerId: { type: 'string' },
        modelId: { type: 'string' },
        prompt: { type: 'string' },
        outputName: { type: 'string' },
        sourcePath: { type: 'string' },
        expectedSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        toolCallId: { type: 'string' },
        idempotencyKey: {
          type: 'string',
          pattern: '^idem:[a-z0-9][a-z0-9_-]*$',
        },
        parameters: { type: 'object', additionalProperties: true },
      },
      required: [
        'kind',
        'providerId',
        'modelId',
        'prompt',
        'outputName',
        'sourcePath',
        'expectedSha256',
        'toolCallId',
        'idempotencyKey',
      ],
      additionalProperties: false,
    },
  ],
  [
    'asset.provider_health',
    'Read provider availability, pricing and test-only status.',
    emptySchema,
  ],
  [
    'asset.estimate',
    'Resolve the project capability route and estimate maximum generation cost. Provider and model overrides are optional.',
    {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['image', 'soundEffect', 'music', 'speechGeneration', 'audio'],
        },
        providerId: { type: 'string' },
        modelId: { type: 'string' },
        variants: { type: 'integer', minimum: 1, maximum: 4 },
      },
      additionalProperties: false,
    },
  ],
  [
    'asset.cancel',
    'Cancel one queued or running provider job.',
    {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'test.list',
    'Discover project tests without treating an empty suite as success.',
    emptySchema,
  ],
  [
    'test.run',
    'Run one discovered project test. Returns a compact passed/status/diagnostics summary; failures are tool errors. Use test.result with testRunId for the complete durable trace without rerunning. Test-file assertions are executable objects: {id:"assertion:example",tick:0,target:{objectId:"game:player",componentId:"game:player/transform",field:"position"},operator:"equals",compareTick:1}; use expected instead of compareTick for a literal. Operators: equals/notEquals/lessThan/greaterThan/exists/absent/fitsUiContent. fitsUiContent checks every rendered UI text line or button label against an authored panel interior, using actual projected text, font and position, not the label layout size. Example: {id:"assertion:text-fit",tick:1,target:{objectId:"game:copy",componentId:"game:copy/text"},operator:"fitsUiContent",expected:{container:{objectId:"game:panel",componentId:"game:panel/image"},inset:{left:0.1,right:0.1,top:0.15,bottom:0.15},viewport:{width:1280,height:720},minimumMargin:8}}. Insets are fractions of the panel bounds; minimumMargin is viewport pixels. For the exact same ui:button as target and container, a transparent background is allowed: only visible label containment within its own hit area is checked, not clickability or decorative artwork. Transparent containers for other targets still fail. Use authored semantic component IDs, not drawable handles. No field/compareTick for this operator; hidden/missing/empty/rotated targets fail. Repeat per viewport and screen state. Artwork interior insets require visual review; this check does not infer decorative borders, resource health or subjective quality. Plain prose is rejected; no assertions/hashes is smoke-only. The replay scene is honored unless explicitly overridden.',
    {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  ],
  [
    'test.result',
    'Read the complete durable result of a previous test.run by its testRunId, without rerunning the test. Includes snapshots, traces, audio events and all diagnostics.',
    {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'asset.recommend',
    'Compare generated candidates and record an evidence-backed Copilot recommendation. This does not select or import a candidate.',
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        candidateId: { type: 'string' },
        reasons: { type: 'array', items: { type: 'string' }, minItems: 1 },
        evidenceIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['id', 'candidateId', 'reasons'],
      additionalProperties: false,
    },
  ],
  [
    'asset.generate',
    'Generate image, sound-effect, music, or speech media by capability. Project routing selects provider/model unless explicitly overridden; Studio applies the human-configured provider authorization policy and keeps candidates outside project authority for review. Read promptMaxCharacters from asset.estimate/provider model metadata; ElevenLabs sound effects allow at most 450 trimmed Unicode characters, including regeneration instructions. Overlong prompts fail locally before creating a new Job or calling the provider; shorten explicitly, never silently truncate. Read failure.category, code and retryable before recovery. ElevenLabs failures retain only allowlisted error categories and fixed guidance, not private response text. A legacy or unrecognized HTTP 400 alone cannot distinguish parameters, quota or other causes; do not infer a cause or blindly repeat a paid request.',
    {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['image', 'soundEffect', 'music', 'speechGeneration', 'audio'],
        },
        providerId: { type: 'string' },
        modelId: { type: 'string' },
        parameters: { type: 'object', additionalProperties: true },
        prompt: { type: 'string' },
        outputName: { type: 'string' },
        variants: { type: 'integer', minimum: 1, maximum: 4 },
      },
      required: ['kind', 'prompt', 'outputName'],
      additionalProperties: false,
    },
  ],
  [
    'asset.regenerate',
    'Create a new media job from a rejected candidate and a revision instruction while preserving ancestry.',
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        candidateId: { type: 'string' },
        instruction: { type: 'string' },
      },
      required: ['id', 'candidateId', 'instruction'],
      additionalProperties: false,
    },
  ],
  [
    'asset.retry',
    'Retry one failed asset provider job; candidates still require human selection.',
    {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'asset.resume',
    'Resume an existing queued or awaiting-approval media job under the current Studio authorization policy. Does not grant approval or create a new job. Running or completed candidates are returned without repeating a provider call.',
    {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'asset.inspect',
    'Inspect one asset by stable asset ID.',
    {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'asset.master_audio',
    'Derive a review-only 48kHz PCM16 WAV candidate from an existing original audio candidate, using explicit crop (milliseconds), fades and gain. No provider call, selection, import or approval. Returns the same stable result for identical source hash/spec/engine; preserves original bytes and provenance. Maximum 60s output, 16 candidates per job. Gain -48 to +48dB; clipping is rejected. Inspect measured peak/rms with asset.inspect_candidate before selecting gain or reviewing output. Technical success is not subjective listening, seamless-loop or art-direction approval. Review and approved ChangeSet are still required before project use. Use asset.job_list to find job and candidate IDs; asset.inspect is for imported assets only.',
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        candidateId: { type: 'string' },
        expectedSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        spec: {
          type: 'object',
          additionalProperties: false,
          properties: {
            startMs: { type: 'integer', minimum: 0 },
            endMs: { type: 'integer', minimum: 1, maximum: 600000 },
            fadeInMs: { type: 'integer', minimum: 0, maximum: 500 },
            fadeOutMs: { type: 'integer', minimum: 0, maximum: 500 },
            gainDb: { type: 'number', minimum: -48, maximum: 48 },
          },
          required: ['startMs', 'endMs', 'fadeInMs', 'fadeOutMs', 'gainDb'],
        },
      },
      required: ['id', 'candidateId', 'expectedSha256', 'spec'],
      additionalProperties: false,
    },
  ],
  ['input.list', 'Read semantic input actions.', emptySchema],
  [
    'asset.inspect_candidate',
    'Read and re-decode a generated candidate by Job ID and Candidate ID, with measured audio peak/rms and actual sample count. Does not play, select, import, modify authority or claim subjective listening. Use this for candidate media; asset.inspect is only for imported asset IDs.',
    {
      type: 'object',
      properties: { id: { type: 'string' }, candidateId: { type: 'string' } },
      required: ['id', 'candidateId'],
      additionalProperties: false,
    },
  ],
  ['diagnostics.list', 'Run structured project diagnostics.', emptySchema],
  [
    'audit.list',
    'Read the append-only command and ChangeSet audit.',
    emptySchema,
  ],
  [
    'capabilities.list',
    'List the shared Engine MCP command surface.',
    emptySchema,
  ],
  [
    'change.propose',
    'Prepare a validated semantic ChangeSet. This never applies project changes.',
    {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        operations: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              input: { type: 'object' },
              description: { type: 'string' },
            },
            required: ['command', 'input'],
            additionalProperties: false,
          },
        },
      },
      required: ['summary', 'operations'],
      additionalProperties: false,
    },
  ],
  [
    'change.list',
    'List compact durable ChangeSet identities, statuses, hashes and file scope. Use change.read with an exact id to inspect full operations and file diffs.',
    emptySchema,
  ],
  [
    'change.read',
    'Read a complete durable ChangeSet by id, including operation inputs and before/after file diffs. Does not approve or apply.',
    {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'change.apply',
    'Apply an already approved, content-hash-bound ChangeSet through the shared transactional service. Cannot approve changes, reuse approvals, or apply changed content. Review the ChangeSet first; approval must already exist in Studio.',
    {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'input.define_action',
    'Propose a semantic input action.',
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        bindings: { type: 'array', items: { type: 'string' } },
      },
      required: ['id', 'bindings'],
      additionalProperties: false,
    },
  ],
  [
    'collision.define_rule',
    'Propose a symmetric collision-layer response through the shared ChangeSet boundary.',
    {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'string' },
        response: {
          type: 'string',
          enum: ['block', 'event', 'overlap', 'ignore'],
        },
      },
      required: ['a', 'b', 'response'],
      additionalProperties: false,
    },
  ],
  [
    'project.write_file',
    'Propose writing a project text file through the shared command registry.',
    {
      type: 'object',
      properties: { path: { type: 'string' }, source: { type: 'string' } },
      required: ['path', 'source'],
      additionalProperties: false,
    },
  ],
  [
    'project.create_file',
    'Propose creating a new project text file through the shared command registry.',
    {
      type: 'object',
      properties: { path: { type: 'string' }, source: { type: 'string' } },
      required: ['path', 'source'],
      additionalProperties: false,
    },
  ],
  [
    'project.replace',
    'Propose a transactional project-wide literal replacement.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        replacement: { type: 'string' },
      },
      required: ['query', 'replacement'],
      additionalProperties: false,
    },
  ],
  ['project.validate', 'Validate the entry Game IR scene.', emptySchema],
  [
    'runtime.run',
    'Start a persistent deterministic Runtime Session and begin live play.',
    {
      type: 'object',
      properties: {
        scene: { type: 'string' },
        ticks: { type: 'integer', minimum: 1 },
        seed: { type: 'integer', minimum: 0 },
        commands: { type: 'array', items: { type: 'object' } },
        inputs: { type: 'array', items: { type: 'object' } },
      },
      additionalProperties: false,
    },
  ],
  ['runtime.stop', 'Stop the MCP preview session.', emptySchema],
  ['runtime.pause', 'Pause the MCP preview session.', emptySchema],
  [
    'runtime.resume',
    'Resume the same paused authoritative world without replaying from Tick zero.',
    {
      type: 'object',
      properties: { ticks: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
  ],
  [
    'runtime.restart',
    'Restart the Runtime Session as a new generation with the same stable session ID.',
    {
      type: 'object',
      properties: { ticks: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
  ],
  [
    'runtime.input',
    'Queue a timestamped keyboard, pointer, replay, or automation action for a fixed Tick.',
    {
      type: 'object',
      required: ['action', 'value'],
      properties: {
        tick: { type: 'integer', minimum: 0 },
        action: { type: 'string' },
        value: { type: 'number' },
        source: {
          enum: ['keyboard', 'pointer', 'gamepad', 'replay', 'automation'],
        },
      },
      additionalProperties: false,
    },
  ],
  [
    'runtime.step_tick',
    'Advance the deterministic preview by one Tick.',
    emptySchema,
  ],
  [
    'runtime.read_state',
    'Read the current deterministic preview state.',
    emptySchema,
  ],
  [
    'runtime.advance_ticks',
    'Advance an already paused session by 1–200 fixed Ticks and remain paused; never start live playback. Read sessionId, generation and tick first; stale or duplicate checkpoint requests fail without advancing. Native execution guards and project budgets remain enforced per batch.',
    {
      type: 'object',
      required: ['sessionId', 'generation', 'expectedTick', 'ticks'],
      properties: {
        sessionId: { type: 'string', minLength: 1 },
        generation: { type: 'integer', minimum: 1 },
        expectedTick: { type: 'integer', minimum: 0 },
        ticks: { type: 'integer', minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
  ],
  ['runtime.read_performance', 'Read the latest preview timing.', emptySchema],
  [
    'runtime.export_input_log',
    'Export the complete paused session recipe (authored scene, seed, ordered semantic inputs, commands, controls, project revision and final state hash) to an addressable local input log. Use its inputLogId with runtime.compare_player; checkpoint names alone are labels, not replay recipes. Does not modify game source.',
    {
      type: 'object',
      required: ['sessionId', 'generation', 'expectedTick'],
      properties: {
        sessionId: { type: 'string', minLength: 1 },
        generation: { type: 'integer', minimum: 1 },
        expectedTick: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  ],
  [
    'runtime.read_trace',
    'Read the latest Event Timeline, System trace, snapshots, watches, and script diagnostics.',
    emptySchema,
  ],
  [
    'runtime.capture_frame',
    'Capture an actual addressable PNG plus resolved drawable, resource, UI-bound, audio-event, and diagnostic evidence for the current deterministic checkpoint.',
    {
      type: 'object',
      properties: {
        checkpointId: { type: 'string', minLength: 1 },
        scene: { type: 'string', minLength: 1 },
        width: { type: 'integer', minimum: 1, maximum: 4096 },
        height: { type: 'integer', minimum: 1, maximum: 4096 },
        inputLogId: { type: 'string', minLength: 1 },
        projectState: {
          type: 'boolean',
          description:
            'Inspect current project files even when the last runtime start failed.',
        },
      },
      additionalProperties: false,
    },
  ],
  [
    'runtime.navigate_checkpoint',
    'Run deterministic scripted input to an addressable menu/play/pause/win/lose/restart checkpoint, pause there, and return the runtime result plus inspectable frame evidence.',
    {
      type: 'object',
      required: ['checkpointId'],
      properties: {
        checkpointId: { type: 'string', minLength: 1 },
        scene: { type: 'string', minLength: 1 },
        replay: { type: 'string', minLength: 1 },
        ticks: { type: 'integer', minimum: 1 },
        seed: { type: 'integer', minimum: 0 },
        commands: { type: 'array', items: { type: 'object' } },
        inputs: { type: 'array', items: { type: 'object' } },
        controls: { type: 'array', items: { type: 'object' } },
        expectedHashes: { type: 'array', items: { type: 'object' } },
        width: { type: 'integer', minimum: 1, maximum: 4096 },
        height: { type: 'integer', minimum: 1, maximum: 4096 },
        inputLogId: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  ],
  [
    'runtime.read_observation',
    'Read a durable RuntimeObservation by stable observation ID.',
    {
      type: 'object',
      required: ['observationId'],
      properties: { observationId: { type: 'string', minLength: 1 } },
      additionalProperties: false,
    },
  ],
  [
    'runtime.compare_observations',
    'Compare Studio and Player observations at the same checkpoint by state, drawable, resource, and audio semantic identity.',
    {
      type: 'object',
      required: ['leftObservationId', 'rightObservationId'],
      properties: {
        leftObservationId: { type: 'string', minLength: 1 },
        rightObservationId: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  ],
  [
    'runtime.compare_player',
    'Build a standalone Development Player and independently replay the same inputLogId (from runtime.export_input_log), authored replay file or explicit ticks/inputs in bounded 200-Tick batches, up to 10000 Ticks. Checkpoint names are labels, never history lookups. Reject missing/tampered/stale logs. Capture real PNG/resource/UI/audio evidence and compare with Studio.',
    {
      type: 'object',
      required: ['checkpointId'],
      properties: {
        checkpointId: { type: 'string', minLength: 1 },
        scene: { type: 'string', minLength: 1 },
        replay: { type: 'string', minLength: 1 },
        ticks: { type: 'integer', minimum: 1 },
        seed: { type: 'integer', minimum: 0 },
        commands: { type: 'array', items: { type: 'object' } },
        inputs: { type: 'array', items: { type: 'object' } },
        controls: { type: 'array', items: { type: 'object' } },
        width: { type: 'integer', minimum: 1, maximum: 4096 },
        height: { type: 'integer', minimum: 1, maximum: 4096 },
        inputLogId: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  ],
  [
    'runtime.hot_reload',
    'Compile changed project TypeScript and restart authoritative state under the declared policy.',
    emptySchema,
  ],
  [
    'debug.breakpoint.set',
    'Set a semantic lifecycle/System breakpoint using stable IDs.',
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        moduleId: { type: 'string' },
        systemId: { type: 'string' },
        objectId: { type: 'string' },
        hook: { type: 'string' },
        line: { type: 'integer', minimum: 1 },
        column: { type: 'integer', minimum: 1 },
        enabled: { type: 'boolean' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'debug.breakpoint.remove',
    'Remove one semantic breakpoint.',
    {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  ],
  [
    'debug.watch.set',
    'Watch one stable Scene state path at every snapshot.',
    pathSchema,
  ],
  ['debug.watch.remove', 'Remove one Scene state watch.', pathSchema],
  [
    'replay.run',
    'Run a project replay and compare any recorded per-Tick state hashes.',
    {
      type: 'object',
      properties: { replay: { type: 'string' }, scene: { type: 'string' } },
      additionalProperties: false,
    },
  ],
  [
    'build.windows',
    'Build the project with the same Windows build service used by Studio.',
    {
      type: 'object',
      properties: {
        profile: { type: 'string', enum: ['development', 'release'] },
      },
      required: ['profile'],
      additionalProperties: false,
    },
  ],
  [
    'build.read_report',
    'Read the latest machine-readable Windows build report.',
    {
      type: 'object',
      properties: {
        profile: { type: 'string', enum: ['development', 'release'] },
      },
      required: ['profile'],
      additionalProperties: false,
    },
  ],
  [
    'release.package',
    'Create the independent player-facing Windows Release package.',
    emptySchema,
  ],
  [
    'build.verify_package',
    'Verify an existing current-revision Windows ZIP, content hashes and trusted Player; run fixed startup self-check and five native GPU frames. Returns a content-addressed receipt and PNG path. No arbitrary executable, arguments or environment. Not full gameplay, audio listening or independent acceptance.',
    {
      type: 'object',
      properties: {
        profile: { type: 'string', enum: ['development', 'release'] },
        expectedZipSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
      required: ['profile', 'expectedZipSha256'],
      additionalProperties: false,
    },
  ],
  [
    'build.read_verification',
    'Read and revalidate a content-addressed package verification receipt and its PNG hash without launching again. Historic evidence applies only to its recorded ZIP and project revision.',
    {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^package-verification:[a-f0-9]{64}$' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  ],
].map(([name, description, inputSchema]) => ({
  name: name as string,
  description: description as string,
  inputSchema: inputSchema as Record<string, unknown>,
  annotations: {
    // Apply is a durable mutation, but cannot create or widen an approval.
    readOnlyHint: name !== 'change.apply',
    destructiveHint: name === 'change.apply',
  },
}));

const authoringTools: Array<[string, string, Record<string, unknown>]> = [
  [
    'scene.create',
    'Propose creating a general Scene.',
    {
      path: { type: 'string' },
      name: { type: 'string' },
      space: { type: 'string', enum: ['2d', '3d', 'ui', 'mixed'] },
    },
  ],
  [
    'scene.rename',
    'Propose renaming a Scene and optionally its file.',
    {
      scene: { type: 'string' },
      name: { type: 'string' },
      path: { type: 'string' },
    },
  ],
  [
    'scene.duplicate',
    'Propose duplicating a Scene with new stable identity.',
    {
      scene: { type: 'string' },
      path: { type: 'string' },
      name: { type: 'string' },
    },
  ],
  [
    'scene.trash',
    'Propose moving a non-startup Scene to project trash.',
    { scene: { type: 'string' } },
  ],
  [
    'scene.set_startup',
    'Propose setting the project startup Scene.',
    { scene: { type: 'string' } },
  ],
  [
    'scene.object.create',
    'Propose creating an object with the Scene default Transform.',
    {
      scene: { type: 'string' },
      name: { type: 'string' },
      id: { type: 'string' },
      parentId: { type: ['string', 'null'] },
    },
  ],
  [
    'scene.object.update',
    'Propose updating an object name or enabled state.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      name: { type: 'string' },
      enabled: { type: 'boolean' },
    },
  ],
  [
    'scene.object.pick',
    'Resolve a human viewport/hierarchy pick to a stable Scene object ID.',
    { scene: { type: 'string' }, objectId: { type: 'string' } },
  ],
  [
    'scene.object.set_parent',
    'Propose reparenting an object with cycle validation.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      parentId: { type: ['string', 'null'] },
    },
  ],
  [
    'scene.object.reorder',
    'Propose changing sibling order.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      order: { type: 'integer', minimum: 0 },
    },
  ],
  [
    'scene.object.duplicate',
    'Propose duplicating an object subtree.',
    { scene: { type: 'string' }, objectId: { type: 'string' } },
  ],
  [
    'scene.object.trash',
    'Propose moving an object subtree to project history.',
    { scene: { type: 'string' }, objectId: { type: 'string' } },
  ],
  [
    'scene.object.set_visibility',
    'Propose changing authoring visibility.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      visible: { type: 'boolean' },
    },
  ],
  [
    'scene.object.set_lock',
    'Propose changing authoring lock state.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      locked: { type: 'boolean' },
    },
  ],
  [
    'scene.transform.move',
    'Propose moving the selected object with the same semantic Gizmo command used by Studio.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      value: { type: ['number', 'object'] },
      delta: { type: ['number', 'object'] },
    },
  ],
  [
    'scene.transform.rotate',
    'Propose rotating the selected object with the same semantic Gizmo command used by Studio.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      value: { type: ['number', 'object'] },
      delta: { type: ['number', 'object'] },
    },
  ],
  [
    'scene.transform.scale',
    'Propose scaling the selected object with the same semantic Gizmo command used by Studio.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      value: { type: ['number', 'object'] },
      delta: { type: ['number', 'object'] },
    },
  ],
  [
    'scene.component.add',
    'Propose adding a capability-registered Component.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      type: { type: 'string' },
      data: { type: 'object' },
    },
  ],
  [
    'scene.component.update',
    'Propose updating schema-backed Component data.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      componentId: { type: 'string' },
      data: { type: 'object' },
    },
  ],
  [
    'scene.component.remove',
    'Propose removing a Component.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      componentId: { type: 'string' },
    },
  ],
  [
    'prefab.create',
    'Propose creating a reusable Prefab from a Scene object subtree.',
    {
      scene: { type: 'string' },
      objectId: { type: 'string' },
      objectIds: { type: 'array', items: { type: 'string' } },
      name: { type: 'string' },
      path: { type: 'string' },
    },
  ],
  [
    'prefab.instantiate',
    'Propose instantiating a Prefab into a Scene.',
    {
      scene: { type: 'string' },
      path: { type: 'string' },
      parentId: { type: ['string', 'null'] },
    },
  ],
  [
    'prefab.apply',
    'Propose applying an instance root override to its Prefab.',
    { scene: { type: 'string' }, objectId: { type: 'string' } },
  ],
  [
    'prefab.revert',
    'Propose reverting an instance root to its Prefab source.',
    { scene: { type: 'string' }, objectId: { type: 'string' } },
  ],
  [
    'resource.reimport',
    'Propose reimporting one registered resource and provenance hash.',
    { path: { type: 'string' } },
  ],
  [
    'resource.set_import_settings',
    'Propose versioned import settings for a registered resource.',
    { path: { type: 'string' }, settings: { type: 'object' } },
  ],
  [
    'resource.repair_reference',
    'Propose replacing a missing project resource reference transactionally.',
    {
      missingPath: { type: 'string' },
      replacementPath: { type: 'string' },
    },
  ],
  [
    'capability.set',
    'Propose enabling or disabling one supported project capability.',
    {
      id: { type: 'string', enum: ['2d', '3d', 'ui'] },
      enabled: { type: 'boolean' },
    },
  ],
];

for (const [name, description, properties] of authoringTools) {
  tools.push({
    name,
    description,
    inputSchema: { type: 'object', properties, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false },
  });
}

const authoringCommands = new Set(
  authoringTools
    .map(([name]) => name)
    .filter((name) => name !== 'scene.object.pick'),
);

function argumentObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProjectError(
      'ENGINE_MCP_ARGUMENT_INVALID',
      `${name} 必须是非空字符串。`,
    );
  }
  return value;
}

function assetKind(value: unknown): AssetJobKind {
  const kind = requiredString(value, 'kind') as AssetJobKind;
  if (
    !['image', 'soundEffect', 'music', 'speechGeneration', 'audio'].includes(
      kind,
    )
  ) {
    throw new ProjectError(
      'ENGINE_MCP_ASSET_KIND_INVALID',
      `不支持的媒体能力：${kind}`,
    );
  }
  return kind;
}

function parseProjectRoot(): string {
  const arguments_ = process.argv.slice(2);
  const index = arguments_.indexOf('--project');
  return resolve(
    index >= 0 && arguments_[index + 1] ? arguments_[index + 1] : '.',
  );
}

const projectRoot = parseProjectRoot();
const kernelCliPath = resolve(
  process.env.AIGAME_STUDIO_KERNEL_CLI ??
    join(
      process.cwd(),
      'bin',
      process.platform === 'win32' ? 'kernelctl.exe' : 'kernelctl',
    ),
);
const registry = new StudioCommandRegistry({
  projectRoot,
  kernelCliPath,
  scriptHostPath: resolve(
    process.env.AIGAME_STUDIO_SCRIPT_HOST ??
      join(
        dirname(kernelCliPath),
        process.platform === 'win32'
          ? 'project-script-host.exe'
          : 'project-script-host',
      ),
  ),
  playerExecutablePath: resolve(
    process.env.AIGAME_STUDIO_GAME_RUNTIME ??
      join(
        dirname(kernelCliPath),
        process.platform === 'win32' ? 'ai-game-player.exe' : 'ai-game-player',
      ),
  ),
});
const changes = new StudioChangeSetService({
  projectRoot,
  kernelCliPath,
  registry,
});
const completionRuns = new CompletionRunService({ projectRoot });
const assetJobs = new StudioAssetJobBroker({
  projectRoot,
  audioInspectorPath: resolve(
    process.env.AIGAME_STUDIO_GAME_RUNTIME ??
      join(
        dirname(kernelCliPath),
        process.platform === 'win32' ? 'ai-game-player.exe' : 'ai-game-player',
      ),
  ),
  registry,
  changes,
  getCompletionContext: () => completionRuns.context(),
  onExternalLink: (completionRunId, kind, id) =>
    completionRuns.link(completionRunId, kind, id),
});
const gameBuild = new StudioGameBuildService({
  projectRoot,
  kernelCliPath,
  runtimeExecutablePath: resolve(
    process.env.AIGAME_STUDIO_GAME_RUNTIME ??
      join(
        dirname(kernelCliPath),
        process.platform === 'win32' ? 'ai-game-player.exe' : 'ai-game-player',
      ),
  ),
  scriptHostPath: resolve(
    process.env.AIGAME_STUDIO_SCRIPT_HOST ??
      join(
        dirname(kernelCliPath),
        process.platform === 'win32'
          ? 'project-script-host.exe'
          : 'project-script-host',
      ),
  ),
  engineVersion: process.env.AIGAME_STUDIO_ENGINE_VERSION ?? '0.3.0-preview.1',
});

function linkCompletion(
  kind:
    | 'toolCalls'
    | 'changeSets'
    | 'runtimeSessions'
    | 'observations'
    | 'tests'
    | 'builds'
    | 'packages',
  id: string,
): void {
  const context = completionRuns.context();
  if (context) completionRuns.link(context.completionRunId, kind, id);
}

function linkedChange(change: StudioChangeSet) {
  linkCompletion('changeSets', change.id);
  return summarizeChange(change);
}

function operationId(prefix: string, material: unknown): string {
  return `${prefix}:${createHash('sha256')
    .update(JSON.stringify(material))
    .digest('hex')
    .slice(0, 24)}`;
}

const bridgedAssetTools = new Set([
  'asset.job_list',
  'asset.register_tool_output',
  'asset.provider_health',
  'asset.estimate',
  'asset.cancel',
  'asset.generate',
  'asset.retry',
  'asset.resume',
  'asset.recommend',
  'asset.regenerate',
  'asset.master_audio',
  'asset.inspect_candidate',
]);

async function callAssetBrokerBridge(
  name: string,
  arguments_: Record<string, unknown>,
): Promise<unknown> {
  const url = process.env.AIGAME_STUDIO_ASSET_BROKER_URL;
  const token = process.env.AIGAME_STUDIO_ASSET_BROKER_TOKEN;
  if (!url || !token) return undefined;
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ projectRoot, name, arguments: arguments_ }),
  });
  const result = (await response.json()) as {
    ok?: boolean;
    value?: unknown;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || result.ok !== true) {
    throw new ProjectError(
      result.error?.code ?? 'ASSET_BROKER_UNAVAILABLE',
      result.error?.message ??
        `Studio 资源 Broker 返回 HTTP ${response.status}。`,
    );
  }
  return result.value;
}

async function callTool(name: string, rawArguments: unknown): Promise<unknown> {
  const args = argumentObject(rawArguments);
  if (
    bridgedAssetTools.has(name) &&
    process.env.AIGAME_STUDIO_ASSET_BROKER_URL
  ) {
    return callAssetBrokerBridge(name, args);
  }
  if (name === 'scene.object.pick') {
    return registry.execute('scene.object.pick', args).data;
  }
  if (authoringCommands.has(name)) {
    return linkedChange(
      changes.propose({
        summary: `AI authoring: ${name}`,
        operations: [{ command: name, input: args }],
      }),
    );
  }
  switch (name) {
    case 'project.get_info':
      return JSON.parse(registry.readText('project.aigame.json').source);
    case 'completion.run_current': {
      const current = completionRuns.current();
      if (!current) return null;
      const bridged = process.env.AIGAME_STUDIO_ASSET_BROKER_URL
        ? ((await callAssetBrokerBridge('asset.job_list', {})) as {
            jobs?: Parameters<
              CompletionRunService['reconcile']
            >[1]['assetJobs'];
          })
        : { jobs: assetJobs.list() };
      return completionRuns.reconcile(current.runId, {
        assetJobs: bridged.jobs ?? [],
        changeSets: changes.list(),
      });
    }
    case 'completion.run_list':
      return { runs: completionRuns.list() };
    case 'project.list_files':
      return { files: registry.snapshot().files };
    case 'script.api': {
      // Resolve only from the engine module, never from a project-controlled path.
      const installed = [
        resolve(
          import.meta.dirname,
          '../../../templates/empty/files/scripts/game-sdk.d.ts',
        ),
        resolve(
          import.meta.dirname,
          '../../templates/empty/files/scripts/game-sdk.d.ts',
        ),
      ].find((path) => existsSync(path));
      if (!installed)
        throw new ProjectError(
          'SCRIPT_API_CONTRACT_MISSING',
          '安装包缺少标准 TypeScript SDK 契约。',
        );
      const content = readFileSync(installed, 'utf8');
      const projectPath = join(projectRoot, 'scripts/game-sdk.d.ts');
      return {
        source: 'installed-engine',
        projectPath: 'scripts/game-sdk.d.ts',
        sha256: createHash('sha256').update(content).digest('hex'),
        content,
        projectMatches:
          existsSync(projectPath) &&
          readFileSync(projectPath, 'utf8') === content,
        mutationWorkflow:
          'Propose the returned content as scripts/game-sdk.d.ts through change.propose; review, approve, apply and validate.',
      };
    }
    case 'project.read_file':
    case 'scene.inspect':
    case 'prefab.inspect':
      return registry.readText(requiredString(args.path, 'path'));
    case 'prefab.overrides':
      return registry.execute('prefab.overrides', {
        scene: typeof args.scene === 'string' ? args.scene : undefined,
        objectId: requiredString(args.objectId, 'objectId'),
      }).data;
    case 'scene.list': {
      const snapshot = registry.snapshot();
      return {
        entryScene: snapshot.entryScene,
        scenes:
          snapshot.scenes ??
          snapshot.files.filter((file) => file.kind === 'scene'),
      };
    }
    case 'component.types':
      return registry.execute('component.types').data;
    case 'resource.dependencies':
      return registry.execute('resource.dependencies', {
        path: requiredString(args.path, 'path'),
      }).data;
    case 'resource.missing':
      return registry.execute('resource.missing').data;
    case 'object.inspect': {
      const id = requiredString(args.id, 'id');
      const scene =
        typeof args.scene === 'string'
          ? args.scene
          : registry.snapshot().entryScene;
      const document = JSON.parse(registry.readText(scene).source) as {
        objects?: Array<{ id?: string }>;
        worlds?: Array<{ entities?: Array<{ id?: string }> }>;
      };
      const entity = (
        document.objects ??
        document.worlds?.flatMap((world) => world.entities ?? []) ??
        []
      ).find((candidate) => candidate.id === id);
      if (!entity)
        throw new ProjectError(
          'ENGINE_MCP_ENTITY_NOT_FOUND',
          `实体不存在：${id}`,
        );
      return { scene, entity };
    }
    case 'asset.list':
      return { assets: registry.snapshot().assets };
    case 'asset.job_list':
      return { jobs: assetJobs.list() };
    case 'asset.register_tool_output':
      return assetJobs.registerToolOutput({
        kind: normalizeAssetCapability(assetKind(args.kind)),
        providerId: requiredString(args.providerId, 'providerId'),
        modelId: requiredString(args.modelId, 'modelId'),
        prompt: requiredString(args.prompt, 'prompt'),
        outputName: requiredString(args.outputName, 'outputName'),
        sourcePath: requiredString(args.sourcePath, 'sourcePath'),
        expectedSha256: requiredString(args.expectedSha256, 'expectedSha256'),
        toolCallId: requiredString(args.toolCallId, 'toolCallId'),
        idempotencyKey: requiredString(args.idempotencyKey, 'idempotencyKey'),
        parameters:
          args.parameters &&
          typeof args.parameters === 'object' &&
          !Array.isArray(args.parameters)
            ? (args.parameters as Record<string, string | number | boolean>)
            : undefined,
      });
    case 'asset.provider_health':
      return { providers: assetJobs.providers() };
    case 'asset.estimate':
      return assetJobs.estimate({
        kind:
          args.kind === undefined
            ? 'image'
            : normalizeAssetCapability(assetKind(args.kind)),
        providerId:
          typeof args.providerId === 'string' ? args.providerId : undefined,
        modelId: typeof args.modelId === 'string' ? args.modelId : undefined,
        variants: typeof args.variants === 'number' ? args.variants : undefined,
      });
    case 'asset.cancel':
      return assetJobs.cancel(requiredString(args.id, 'id'));
    case 'asset.generate': {
      const job = assetJobs.submit({
        kind: assetKind(args.kind),
        providerId:
          typeof args.providerId === 'string' ? args.providerId : undefined,
        modelId: typeof args.modelId === 'string' ? args.modelId : undefined,
        parameters:
          args.parameters &&
          typeof args.parameters === 'object' &&
          !Array.isArray(args.parameters)
            ? (args.parameters as Record<string, string | number | boolean>)
            : undefined,
        prompt: requiredString(args.prompt, 'prompt'),
        outputName: requiredString(args.outputName, 'outputName'),
        variants: typeof args.variants === 'number' ? args.variants : undefined,
      });
      return await assetJobs.runWithPolicy(job.id);
    }
    case 'asset.retry':
      return await assetJobs.retryWithPolicy(requiredString(args.id, 'id'));
    case 'asset.resume':
      return await assetJobs.resumeWithPolicy(requiredString(args.id, 'id'));
    case 'asset.recommend':
      return assetJobs.recommendCandidate(
        requiredString(args.id, 'id'),
        requiredString(args.candidateId, 'candidateId'),
        Array.isArray(args.reasons)
          ? args.reasons.map((reason) => requiredString(reason, 'reason'))
          : [],
        Array.isArray(args.evidenceIds)
          ? args.evidenceIds.map((evidence) =>
              requiredString(evidence, 'evidenceId'),
            )
          : [],
      );
    case 'asset.regenerate': {
      const job = assetJobs.regenerate(
        requiredString(args.id, 'id'),
        requiredString(args.candidateId, 'candidateId'),
        requiredString(args.instruction, 'instruction'),
      );
      return await assetJobs.runWithPolicy(job.id);
    }
    case 'asset.inspect': {
      const id = requiredString(args.id, 'id');
      const asset = registry.snapshot().assets.find((item) => item.id === id);
      if (!asset)
        throw new ProjectError(
          'ENGINE_MCP_ASSET_NOT_FOUND',
          `资源不存在：${id}`,
        );
      return asset;
    }
    case 'asset.master_audio':
      return assetJobs.masterCandidate(
        requiredString(args.id, 'id'),
        requiredString(args.candidateId, 'candidateId'),
        requiredString(args.expectedSha256, 'expectedSha256'),
        args.spec,
      );
    case 'asset.inspect_candidate':
      return assetJobs.inspectCandidate(
        requiredString(args.id, 'id'),
        requiredString(args.candidateId, 'candidateId'),
      );
    case 'input.list':
      return JSON.parse(registry.readText('input/actions.json').source);
    case 'diagnostics.list':
      return registry.execute('diagnostics.list').data;
    case 'source_control.diff':
      return registry.execute('source-control.diff', {
        path: requiredString(args.path, 'path'),
      }).data;
    case 'source_control.status':
      return registry.execute('source-control.status').data;
    case 'source_control.history':
      return registry.execute('source-control.history').data;
    case 'source_control.branches':
      return registry.execute('source-control.branch.list').data;
    case 'source_control.stashes':
      return registry.execute('source-control.stash.list').data;
    case 'source_control.remotes':
      return registry.execute('source-control.remote.list').data;
    case 'source_control.commit':
      return registry.execute('source-control.commit', {
        message: requiredString(args.message, 'message'),
      }).data;
    case 'source_control.branch_create':
      return registry.execute('source-control.branch.create', {
        name: requiredString(args.name, 'name'),
      }).data;
    case 'source_control.branch_switch':
      return registry.execute('source-control.branch.switch', {
        name: requiredString(args.name, 'name'),
      }).data;
    case 'source_control.stash_push':
      return registry.execute('source-control.stash.push', {
        message: typeof args.message === 'string' ? args.message : undefined,
      }).data;
    case 'source_control.stash_pop':
      return registry.execute('source-control.stash.pop', {
        ref: typeof args.ref === 'string' ? args.ref : undefined,
      }).data;
    case 'source_control.remote_fetch':
      return registry.execute('source-control.remote.fetch', {
        remote: typeof args.remote === 'string' ? args.remote : undefined,
      }).data;
    case 'test.list':
      return registry.execute('test.discover').data;
    case 'test.run': {
      const path = requiredString(args.path, 'path');
      const execution = registry.execute('test.run', {
        test: requiredString(args.path, 'path'),
      });
      const testResult = execution.data;
      const testRunId = operationId('test-run', { path, testResult });
      const reportRoot = join(projectRoot, '.aigame', 'local', 'test-results');
      const reportPath = join(
        reportRoot,
        `${testRunId.replace(':', '_')}.json`,
      );
      mkdirSync(reportRoot, { recursive: true });
      const report = JSON.stringify({ testRunId, path, result: testResult });
      if (!existsSync(reportPath))
        writeFileSync(reportPath, report, { flag: 'wx' });
      else if (readFileSync(reportPath, 'utf8') !== report)
        throw new ProjectError(
          'TEST_RESULT_ID_COLLISION',
          'Existing test report content does not match its identity.',
        );
      linkCompletion('tests', testRunId);
      return {
        ...summarizeTest(testResult),
        testRunId,
        path,
        message: execution.message,
        reportSha256: createHash('sha256').update(report).digest('hex'),
        detailTool: { name: 'test.result', arguments: { id: testRunId } },
      };
    }
    case 'test.result': {
      const id = requiredString(args.id, 'id');
      if (!/^test-run:[a-f0-9]{24}$/u.test(id))
        throw new ProjectError(
          'TEST_RESULT_ID_INVALID',
          'Expected a test-run identity.',
        );
      const path = join(
        projectRoot,
        '.aigame',
        'local',
        'test-results',
        `${id.replace(':', '_')}.json`,
      );
      if (!existsSync(path))
        throw new ProjectError(
          'TEST_RESULT_NOT_FOUND',
          'Test report was not found.',
        );
      return JSON.parse(readFileSync(path, 'utf8'));
    }
    case 'project.search':
      return registry.execute('project.search', {
        query: requiredString(args.query, 'query'),
      }).data;
    case 'audit.list':
      return registry.execute('audit.list').data;
    case 'capabilities.list': {
      const manifest = JSON.parse(
        registry.readText('project.aigame.json').source,
      ) as { capabilities?: string[] };
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        sourceOfTruth: ['StudioCommandRegistry', 'CapabilityRegistry'],
        commands: registry.snapshot().commands,
        tools: tools.map((tool) => tool.name),
        capabilities: capabilitiesForProject(
          projectRoot,
          manifest.capabilities ?? [],
        ),
        mutationWorkflow: [
          'Plan',
          'Diff',
          'Approve',
          'Apply',
          'Test',
          'Rollback',
        ],
      };
    }
    case 'change.propose':
      return linkedChange(
        changes.propose(args as Parameters<typeof changes.propose>[0]),
      );
    case 'change.list':
      return { changes: changes.list().map(summarizeChange) };
    case 'change.read':
      return changes.read(requiredString(args.id, 'id'));
    case 'change.apply':
      return linkedChange(changes.apply(requiredString(args.id, 'id')));
    case 'input.define_action':
      return linkedChange(
        changes.propose({
          summary: `定义输入动作 ${String(args.id)}`,
          operations: [{ command: 'input.define_action', input: args }],
        }),
      );
    case 'collision.define_rule':
      return linkedChange(
        changes.propose({
          summary: `定义碰撞 ${String(args.a)} × ${String(args.b)}`,
          operations: [{ command: 'collision.define_rule', input: args }],
        }),
      );
    case 'project.write_file': {
      const path = requiredString(args.path, 'path');
      const current = registry.readText(path);
      return linkedChange(
        changes.propose({
          summary: `更新 ${path}`,
          operations: [
            {
              command: 'project.file.write',
              input: {
                path,
                content: requiredString(args.source, 'source'),
                baseHash: current.hash,
              },
            },
          ],
        }),
      );
    }
    case 'project.create_file': {
      const path = requiredString(args.path, 'path');
      return linkedChange(
        changes.propose({
          summary: `创建 ${path}`,
          operations: [
            {
              command: 'project.file.create',
              input: {
                path,
                content: requiredString(args.source, 'source'),
              },
            },
          ],
        }),
      );
    }
    case 'project.replace':
      return linkedChange(
        changes.propose({
          summary: `项目全文替换“${String(args.query)}”`,
          operations: [
            {
              command: 'project.replace',
              input: {
                query: requiredString(args.query, 'query'),
                replacement:
                  typeof args.replacement === 'string' ? args.replacement : '',
              },
            },
          ],
        }),
      );
    case 'project.validate':
      return registry.execute('project.validate').data;
    case 'project.references':
      return registry.execute('project.references', args).data;
    case 'runtime.run': {
      const runtime = registry.execute('runtime.start', args).data as Record<
        string,
        unknown
      >;
      const sessionId =
        typeof runtime.sessionId === 'string'
          ? runtime.sessionId
          : registry.snapshot().runtime.sessionId;
      if (sessionId) linkCompletion('runtimeSessions', sessionId);
      return { ...runtime, sessionId };
    }
    case 'runtime.stop':
      return registry.execute('runtime.stop').snapshot.runtime;
    case 'runtime.pause':
      return registry.execute('runtime.pause').snapshot.runtime;
    case 'runtime.resume':
      return registry.execute('runtime.resume', args).data;
    case 'runtime.restart':
      return registry.execute('runtime.restart', args).data;
    case 'runtime.input':
      return registry.execute('runtime.input', args).data;
    case 'runtime.step_tick':
      return registry.execute('runtime.step_tick', args).data;
    case 'runtime.advance_ticks':
      return registry.execute('runtime.advance_ticks', args).data;
    case 'runtime.export_input_log':
      return registry.execute('runtime.export_input_log', args).data;
    case 'runtime.read_state':
      return registry.snapshot().runtime;
    case 'runtime.read_performance':
      return {
        durationMs: registry.snapshot().runtime.durationMs,
        memoryUsedBytes: registry.snapshot().runtime.memoryUsedBytes,
        operations: registry.snapshot().runtime.operations,
        events: registry.snapshot().runtime.events,
      };
    case 'runtime.read_trace':
      return registry.execute('runtime.read_trace').data;
    case 'runtime.capture_frame': {
      const capture = registry.execute('runtime.capture_frame', args).data as {
        observationId?: string;
        sessionId?: string;
      };
      if (capture.sessionId)
        linkCompletion('runtimeSessions', capture.sessionId);
      if (capture.observationId)
        linkCompletion('observations', capture.observationId);
      return capture;
    }
    case 'runtime.navigate_checkpoint': {
      const navigation = registry.execute('runtime.navigate_checkpoint', args)
        .data as {
        observation?: { observationId?: string; sessionId?: string };
      };
      if (navigation.observation?.sessionId) {
        linkCompletion('runtimeSessions', navigation.observation.sessionId);
      }
      if (navigation.observation?.observationId) {
        linkCompletion('observations', navigation.observation.observationId);
      }
      return navigation;
    }
    case 'runtime.read_observation':
      return registry.execute('runtime.observation.read', args).data;
    case 'runtime.compare_observations':
      return registry.execute('runtime.observation.compare', args).data;
    case 'runtime.compare_player': {
      const checkpoint = requiredString(args.checkpointId, 'checkpointId');
      const recorded =
        typeof args.inputLogId === 'string' &&
        (args.inputLogId.startsWith('input-log:') ||
          (args.ticks === undefined && args.replay === undefined))
          ? registry.readInputLog(args.inputLogId)
          : null;
      if (!recorded && args.ticks === undefined && args.replay === undefined)
        throw new ProjectError(
          'RUNTIME_REPLAY_REQUIRED',
          '请提供导出的 inputLogId、replay 文件或明确 ticks/inputs；checkpointId 只是标签。',
        );
      if (
        recorded &&
        [
          'scene',
          'ticks',
          'seed',
          'commands',
          'inputs',
          'controls',
          'replay',
        ].some((key) => args[key] !== undefined)
      )
        throw new ProjectError(
          'RUNTIME_INPUT_LOG_OVERRIDE_FORBIDDEN',
          '不能覆盖已录制输入的内容；请只提供 inputLogId、检查点名和视口。',
        );
      const options = registry.resolveRuntimeReplay(
        recorded ? recorded.request : args,
      );
      const request: Record<string, unknown> = Object.fromEntries(
        ['scene', 'ticks', 'seed', 'commands', 'inputs', 'controls'].map(
          (key) => [key, options[key as keyof typeof options]],
        ),
      );
      const totalTicks = Number(request.ticks);
      if (
        !Number.isSafeInteger(totalTicks) ||
        totalTicks < 1 ||
        totalTicks > 10000
      )
        throw new ProjectError(
          'RUNTIME_REPLAY_TICKS_INVALID',
          '有界对照只接受 1–10000 Tick。',
        );
      const comparisonKey = createHash('sha256')
        .update(JSON.stringify({ checkpoint, request }))
        .digest('hex')
        .slice(0, 24);
      const resolvedInputLogId =
        typeof args.inputLogId === 'string'
          ? args.inputLogId
          : `comparison-${comparisonKey}`;
      const studioRun = registry.execute('runtime.navigate_checkpoint', {
        ...request,
        checkpointId: checkpoint,
        width: args.width,
        height: args.height,
        inputLogId: resolvedInputLogId,
        continuous: false,
        bounded: true,
      }).data as {
        result: { status: string; tick: number; stateHash: string };
        observation: ReturnType<
          StudioCommandRegistry['captureExternalRuntimeSnapshot']
        >;
      };
      if (
        studioRun.result.status !== 'completed' ||
        studioRun.result.tick !== totalTicks ||
        (recorded && studioRun.result.stateHash !== recorded.stateHash)
      )
        throw new ProjectError(
          'RUNTIME_INPUT_LOG_REPLAY_MISMATCH',
          'Studio 重演未达到录制的完整 Tick/最终状态；不生成通过对照。',
        );
      const build = gameBuild.execute('build.windows', {
        profile: 'development',
      });
      request.sessionId = `session:player_${comparisonKey}`;
      request.generation = 1;
      request.sequence = 1;
      const localRoot = join(
        projectRoot,
        '.aigame',
        'local',
        'runtime-observations',
      );
      mkdirSync(localRoot, { recursive: true });
      const requestPath = join(
        localRoot,
        `${comparisonKey}.player-request.json`,
      );
      const resultPath = join(localRoot, `${comparisonKey}.player-result.json`);
      const playerExecutable = join(build.outputDirectory, build.executable);
      const packagePath = join(
        build.outputDirectory,
        'game',
        'player-package.json',
      );
      let playerResult:
        | {
            status: string;
            tick: number;
            scene: SceneDocument;
            activeScene: string;
            randomState: number;
            pendingEvents: unknown[];
            pendingLifecycle: unknown[];
            physicsContacts: unknown[];
            renderSnapshot: RuntimeRenderSnapshot;
            audioEvents?: RuntimeAudioEvent[];
            diagnostics?: Array<{
              code: string;
              severity: 'error' | 'warning' | 'info';
              message: string;
              tick: number;
              phase?: string;
              systemId?: string | null;
              moduleId?: string | null;
              objectId?: string | null;
              file?: string;
              line?: number;
              column?: number;
            }>;
          }
        | undefined;
      const playerAudio: RuntimeAudioEvent[] = [];
      for (let tick = 0; tick < totalTicks;) {
        const batchTicks = Math.min(200, totalTicks - tick);
        writeFileSync(
          requestPath,
          `${JSON.stringify({ ...request, ticks: batchTicks, ...(playerResult ? { continuation: { scene: playerResult.scene, activeScene: playerResult.activeScene, startTick: playerResult.tick, started: true, randomState: playerResult.randomState, pendingEvents: playerResult.pendingEvents, pendingLifecycle: playerResult.pendingLifecycle, physicsContacts: playerResult.physicsContacts } } : {}) }, null, 2)}\n`,
        );
        const run = spawnSync(
          playerExecutable,
          [
            '--package',
            packagePath,
            '--observe-runtime',
            resultPath,
            '--request',
            requestPath,
          ],
          {
            cwd: build.outputDirectory,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 30_000,
            maxBuffer: 32 * 1024 * 1024,
          },
        );
        if (run.status !== 0) {
          throw new ProjectError(
            'RUNTIME_PLAYER_OBSERVATION_FAILED',
            '独立 Player 无法到达请求的确定性检查点。',
            { status: run.status, stdout: run.stdout, stderr: run.stderr },
          );
        }
        playerResult = JSON.parse(
          readFileSync(resultPath, 'utf8'),
        ) as NonNullable<typeof playerResult>;
        if (
          playerResult.status !== 'completed' ||
          playerResult.tick !== tick + batchTicks
        )
          throw new ProjectError(
            'RUNTIME_PLAYER_REPLAY_INCOMPLETE',
            `Player 批次 ${tick}→${tick + batchTicks} 未完成（${playerResult.status}, Tick ${playerResult.tick}）：${playerResult.diagnostics?.map((item) => `${item.code}: ${item.message}`).join('; ') ?? ''}`,
          );
        playerAudio.push(...(playerResult.audioEvents ?? []));
        tick = playerResult.tick;
      }
      if (!playerResult)
        throw new ProjectError(
          'RUNTIME_PLAYER_REPLAY_EMPTY',
          'Player 未返回结果。',
        );
      if (recorded) registry.readInputLog(recorded.inputLogId);
      const packageDocument = JSON.parse(readFileSync(packagePath, 'utf8')) as {
        audioBuses?: Array<{ id: string; volume: number; muted: boolean }>;
      };
      const runtimeDiagnostics: RuntimeDiagnostic[] = (
        playerResult.diagnostics ?? []
      ).map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        tick: diagnostic.tick,
        ...(diagnostic.phase?.includes(':')
          ? { phase: diagnostic.phase as `${string}:${string}` }
          : {}),
        ...(diagnostic.systemId?.includes(':')
          ? { systemId: diagnostic.systemId as `${string}:${string}` }
          : {}),
        ...(diagnostic.moduleId?.includes(':')
          ? { moduleId: diagnostic.moduleId as `${string}:${string}` }
          : {}),
        ...(diagnostic.objectId?.includes(':')
          ? { objectId: diagnostic.objectId as `${string}:${string}` }
          : {}),
        ...(diagnostic.file ? { projectPath: diagnostic.file } : {}),
        ...(diagnostic.line ? { line: diagnostic.line } : {}),
        ...(diagnostic.column ? { column: diagnostic.column } : {}),
      }));
      const playerObservation = registry.captureExternalRuntimeSnapshot({
        snapshot: playerResult.renderSnapshot,
        scene: playerResult.scene,
        audioEvents: playerAudio,
        runtimeDiagnostics,
        source: 'player',
        checkpointId: checkpoint,
        tick: playerResult.tick,
        stateHash: runtimeStateHash(playerResult.scene),
        inputLogId: resolvedInputLogId,
        viewport: [
          typeof args.width === 'number' ? args.width : 1280,
          typeof args.height === 'number' ? args.height : 720,
        ],
        assetRoot: join(build.outputDirectory, 'game'),
        rendererExecutablePath: playerExecutable,
        reachableAssetPaths: new Set(build.reachability.assets),
        audioBuses: packageDocument.audioBuses ?? [],
      });
      return {
        studio: studioRun.observation,
        player: playerObservation,
        comparison: registry.compareRuntimeObservations(
          studioRun.observation,
          playerObservation,
        ),
        build: {
          profile: build.profile,
          packageName: build.packageName,
          reproducibleCoreHash: build.reproducibleCoreHash,
        },
      };
    }
    case 'runtime.hot_reload':
      return registry.execute('runtime.hot_reload').data;
    case 'debug.breakpoint.set':
      return registry.execute('debug.breakpoint.set', args).data;
    case 'debug.breakpoint.remove':
      return registry.execute('debug.breakpoint.remove', args).data;
    case 'debug.watch.set':
      return registry.execute('debug.watch.set', args).data;
    case 'debug.watch.remove':
      return registry.execute('debug.watch.remove', args).data;
    case 'replay.run':
      return registry.execute('runtime.run_replay', args).data;
    case 'build.windows': {
      const build = gameBuild.execute('build.windows', {
        profile: args.profile === 'release' ? 'release' : 'development',
      });
      const buildId = operationId('build', {
        profile: build.profile,
        reproducibleCoreHash: build.reproducibleCoreHash,
      });
      linkCompletion('builds', buildId);
      return { ...build, buildId };
    }
    case 'build.read_report':
      return gameBuild.execute('build.read_report', {
        profile: args.profile === 'release' ? 'release' : 'development',
      });
    case 'build.verify_package': {
      if (
        Object.keys(args).some(
          (key) => !['profile', 'expectedZipSha256'].includes(key),
        ) ||
        !['development', 'release'].includes(String(args.profile))
      )
        throw new ProjectError(
          'PACKAGE_VERIFY_INPUT_INVALID',
          '仅允许 profile 和 expectedZipSha256。',
        );
      const receipt = await gameBuild.verifyPackage(
        args.profile as 'development' | 'release',
        requiredString(args.expectedZipSha256, 'expectedZipSha256'),
      );
      linkCompletion(
        'packages',
        operationId('package', {
          profile: receipt.profile,
          zipSha256: receipt.zipSha256,
        }),
      );
      return receipt;
    }
    case 'build.read_verification':
      if (Object.keys(args).some((key) => key !== 'id'))
        throw new ProjectError(
          'PACKAGE_VERIFY_INPUT_INVALID',
          '仅允许验证记录 ID。',
        );
      return gameBuild.readVerification(requiredString(args.id, 'id'));
    case 'release.package': {
      const packageReport = gameBuild.execute('release.package');
      const buildId = operationId('build', {
        profile: packageReport.profile,
        reproducibleCoreHash: packageReport.reproducibleCoreHash,
      });
      const packageId = operationId('package', {
        profile: packageReport.profile,
        zipSha256:
          packageReport.zipSha256 ?? packageReport.reproducibleCoreHash,
      });
      linkCompletion('builds', buildId);
      linkCompletion('packages', packageId);
      return { ...packageReport, buildId, packageId };
    }
    default:
      throw new ProjectError(
        'ENGINE_MCP_TOOL_NOT_FOUND',
        `未知 Engine MCP 工具：${name}`,
      );
  }
}

function send(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function success(id: JsonRpcRequest['id'], result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function toolResult(value: unknown, isError = false): unknown {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    isError,
  };
}

const lines = createInterface({ input: process.stdin });
lines.on('line', async (line) => {
  if (!line.trim()) return;
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: String(error) },
    });
    return;
  }
  if (request.id === undefined) return;
  if (request.method === 'initialize') {
    success(request.id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'ai-game-engine', version: '0.3.0-preview.1' },
    });
    return;
  }
  if (request.method === 'ping') {
    success(request.id, {});
    return;
  }
  if (request.method === 'tools/list') {
    success(request.id, { tools });
    return;
  }
  if (request.method === 'tools/call') {
    const params = argumentObject(request.params);
    try {
      const name = requiredString(params.name, 'name');
      const value = await callTool(name, params.arguments);
      success(
        request.id,
        toolResult(
          value,
          name === 'test.run' && !(value as { passed?: boolean }).passed,
        ),
      );
    } catch (error) {
      const value = {
        ok: false,
        code:
          error instanceof ProjectError ? error.code : 'ENGINE_MCP_TOOL_FAILED',
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof ProjectError ? error.details : undefined,
      };
      success(request.id, toolResult(value, true));
    }
    return;
  }
  send({
    jsonrpc: '2.0',
    id: request.id,
    error: { code: -32601, message: 'method not found' },
  });
});
