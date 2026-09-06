import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import { ProjectError } from '../project/project-types.ts';
import type { StudioChangeSetService } from './studio-change-set-service.ts';
import { StudioCommandRegistry } from './studio-command-registry.ts';
import { readElevenLabsProviderFailure } from './elevenlabs-provider-error.ts';
import {
  inspectAudioCandidate,
  inspectAudioCandidateDetails,
} from './audio-candidate-inspection.ts';
import {
  audioMasterSpec,
  masterAudioCandidate,
  type AudioMasterSpec,
} from './audio-candidate-master.ts';

export type AssetGenerationCapability =
  | 'image'
  | 'soundEffect'
  | 'music'
  | 'speechGeneration';
export type AssetJobKind = AssetGenerationCapability | 'audio';
export type AssetJobStatus =
  | 'queued'
  | 'awaitingApproval'
  | 'running'
  | 'awaitingReview'
  | 'awaitingImportApproval'
  | 'failed'
  | 'cancelled'
  | 'imported'
  | 'rejected';

export type AssetFailureCategory =
  | 'missing-credential'
  | 'provider-unhealthy'
  | 'unsupported-model'
  | 'invalid-parameter'
  | 'quota'
  | 'rate-limit'
  | 'safety-refusal'
  | 'transient'
  | 'timeout-ambiguous'
  | 'cancelled'
  | 'internal';

export type AssetJobFailure = {
  code: string;
  category: AssetFailureCategory;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
};

export type AssetJobAttempt = {
  id: string;
  number: number;
  status: 'running' | 'succeeded' | 'failed' | 'ambiguous' | 'cancelled';
  startedAt: string;
  finishedAt: string | null;
  reconciliation:
    | 'not-required'
    | 'pending'
    | 'confirmed-not-run'
    | 'confirmed-run';
};

export type AssetCandidateMedia =
  | {
      kind: 'image';
      width: number;
      height: number;
      format: string;
      hasAlpha: boolean;
    }
  | {
      kind: 'audio';
      durationMs: number;
      codec: string;
      sampleRateHz: number;
      channels: number;
    };

export type AssetCandidate = {
  id: string;
  artifactId: string;
  path: string;
  sha256: string;
  mime: string;
  bytes: number;
  media: AssetCandidateMedia;
  reviewState: 'awaitingReview' | 'selected' | 'rejected' | 'superseded';
  recommendation: null | {
    recommended: boolean;
    reasons: string[];
    evidenceIds: string[];
  };
  decision: null | {
    id: string;
    decision: 'selected' | 'rejected';
    source: 'human' | 'configured-policy';
    reason: string;
    decidedAt: string;
  };
  parentCandidateId: string | null;
  audioMaster?: {
    id: string;
    version: 'audio-master-v1';
    sourceSha256: string;
    engineSha256: string;
    spec: AudioMasterSpec;
  };
};

export type StudioAssetJob = {
  id: string;
  idempotencyKey: string;
  completionRunId: string | null;
  planStepId: string | null;
  toolCallId: string;
  executionSource: 'broker-provider' | 'codex-media-tool';
  kind: AssetGenerationCapability;
  requestedKind: AssetJobKind;
  legacyMigration: null | {
    requestedCapability: 'audio';
    resolvedCapability: 'speechGeneration';
    rule: 'audio-to-speech-generation-v1';
  };
  providerId: string;
  credentialRef: string | null;
  modelId: string;
  endpointClass: 'synchronous' | 'asynchronous' | 'streaming' | 'local';
  parameterSchemaId: string;
  routeSource: 'project' | 'studio-default' | 'request-override';
  parameters: Record<string, string | number | boolean>;
  prompt: string;
  outputName: string;
  variants: number;
  attempts: number;
  attemptHistory: AssetJobAttempt[];
  retryPolicy: {
    maxAttempts: number;
    backoffBaseMs: number;
    backoffCapMs: number;
    nextRetryAt: string | null;
  };
  status: AssetJobStatus;
  candidates: AssetCandidate[];
  selectedCandidateId: string | null;
  importedAssetId: string | null;
  importChangeSetId: string | null;
  reviewDecisionId: string | null;
  rejectedCandidateIds: string[];
  regeneration: null | {
    id: string;
    parentCandidateId: string;
    instruction: string;
  };
  error: string | null;
  failure: AssetJobFailure | null;
  progress: {
    stage: 'queued' | 'submitted' | 'processing' | 'downloading' | 'finalizing';
    fraction: number | null;
    message: string;
  };
  providerOperationId: string | null;
  remoteCancellationGuaranteed: boolean;
  estimatedCostCny: number;
  costEstimateConfigured: boolean;
  actualCostCny: number | null;
  approval: {
    approvedBy: 'human' | 'policy';
    authorizationId?: string;
    policy: AssetGenerationApprovalMode;
    approvedAt: string;
    estimateCny: number;
    estimateConfigured: boolean;
    modelId: string;
    parametersSha256: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetModelDefinition = {
  id: string;
  label?: string;
  kind: AssetJobKind;
  adapter:
    | 'local-placeholder'
    | 'aliyun-bailian-image'
    | 'aliyun-bailian-tts'
    | 'aliyun-bailian-music'
    | 'openai-image'
    | 'elevenlabs-sound-effect'
    | 'elevenlabs-music';
  enabled?: boolean;
  maxVariants?: number;
  costPerCandidateCny?: number;
  defaults?: Record<string, string | number | boolean>;
};

export type ProviderDefinition = {
  id: string;
  kind?: string;
  failFirstAttempts?: number;
  enabled?: boolean;
  paid?: boolean;
  endpoint?: string;
  model?: string;
  costPerCandidateCny?: number;
  models?: AssetModelDefinition[];
  defaultModelByKind?: Partial<Record<AssetGenerationCapability, string>> & {
    audio?: string;
  };
};

export type AssetProviderConnection = {
  credentialRef: string | null;
  region: string;
  workspaceId: string | null;
  apiHost?: string | null;
};

export type AssetGenerationApprovalMode = 'always' | 'budget' | 'auto';

export type AssetGenerationApprovalPolicy = {
  mode: AssetGenerationApprovalMode;
  autoApproveMaxCny: number;
  authorizationId?: string;
  completionRunId?: string;
};

export type AssetProviderHealth = {
  id: string;
  kind: string;
  model: string | null;
  available: boolean;
  paid: boolean;
  testOnly: boolean;
  reason: string;
  costPerCandidateCny: number;
  models: Array<{
    id: string;
    label: string;
    kind: AssetJobKind;
    available: boolean;
    reason: string;
    maxVariants: number;
    promptMaxCharacters?: number;
    costPerCandidateCny: number;
    costConfigured: boolean;
    defaults: Record<string, string | number | boolean>;
  }>;
};

type JobStore = { schemaVersion: '1.0.0'; jobs: StudioAssetJob[] };

export type StudioAssetJobBrokerOptions = {
  projectRoot: string;
  audioInspectorPath?: string;
  registry: StudioCommandRegistry;
  changes?: StudioChangeSetService;
  resolveCredential?: (id: string) => string;
  getCredentialRef?: (providerId: string) => string | null;
  getProviderConnection?: (
    providerId: string,
    credentialRef?: string,
  ) => AssetProviderConnection;
  getApprovalPolicy?: () => AssetGenerationApprovalPolicy;
  getCompletionContext?: () => {
    completionRunId: string;
    planStepId: string | null;
  } | null;
  onExternalLink?: (
    completionRunId: string,
    kind: 'toolCalls' | 'assetJobs' | 'reviewDecisions' | 'changeSets',
    id: string,
  ) => void;
  fetchImpl?: typeof fetch;
};

const safeName = /^[a-z0-9][a-z0-9._-]{0,95}$/u;
const workspaceIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/u;

export function normalizeAssetCapability(
  kind: AssetJobKind,
): AssetGenerationCapability {
  return kind === 'audio' ? 'speechGeneration' : kind;
}

const localModels: AssetModelDefinition[] = [
  {
    id: 'deterministic-image',
    label: '本地确定性图片（测试）',
    kind: 'image',
    adapter: 'local-placeholder',
    maxVariants: 4,
    costPerCandidateCny: 0,
    defaults: {},
  },
  {
    id: 'deterministic-sound-effect',
    label: '本地确定性音效（测试）',
    kind: 'soundEffect',
    adapter: 'local-placeholder',
    maxVariants: 4,
    costPerCandidateCny: 0,
    defaults: {},
  },
  {
    id: 'deterministic-music',
    label: '本地确定性音乐（测试）',
    kind: 'music',
    adapter: 'local-placeholder',
    maxVariants: 4,
    costPerCandidateCny: 0,
    defaults: {},
  },
  {
    id: 'deterministic-speech',
    label: '本地确定性语音（测试）',
    kind: 'speechGeneration',
    adapter: 'local-placeholder',
    maxVariants: 4,
    costPerCandidateCny: 0,
    defaults: {},
  },
];

const bailianModels: AssetModelDefinition[] = [
  {
    id: 'wan2.7-image-pro',
    label: 'Wan 2.7 Image Pro（高质量）',
    kind: 'image',
    adapter: 'aliyun-bailian-image',
    maxVariants: 4,
    defaults: { size: '2048*2048', watermark: false, promptExtend: true },
  },
  {
    id: 'wan2.7-image',
    label: 'Wan 2.7 Image（均衡）',
    kind: 'image',
    adapter: 'aliyun-bailian-image',
    maxVariants: 4,
    defaults: { size: '2048*2048', watermark: false, promptExtend: true },
  },
  {
    id: 'wan2.6-t2i',
    label: 'Wan 2.6 T2I（兼容）',
    kind: 'image',
    adapter: 'aliyun-bailian-image',
    maxVariants: 4,
    costPerCandidateCny: 0.14,
    defaults: { size: '1280*1280', watermark: false, promptExtend: true },
  },
  {
    id: 'wan2.5-t2i-preview',
    label: 'Wan 2.5 T2I Preview',
    kind: 'image',
    adapter: 'aliyun-bailian-image',
    maxVariants: 4,
    defaults: { size: '1280*1280', watermark: false, promptExtend: true },
  },
  {
    id: 'qwen-audio-3.0-tts-plus',
    label: 'Qwen Audio 3.0 TTS Plus（高质量）',
    kind: 'speechGeneration',
    adapter: 'aliyun-bailian-tts',
    maxVariants: 1,
    defaults: { voice: 'longanhuan_v3.6', format: 'wav', sampleRate: 24000 },
  },
  {
    id: 'qwen-audio-3.0-tts-flash',
    label: 'Qwen Audio 3.0 TTS Flash（快速）',
    kind: 'speechGeneration',
    adapter: 'aliyun-bailian-tts',
    maxVariants: 1,
    defaults: { voice: 'longanhuan_v3.6', format: 'wav', sampleRate: 24000 },
  },
];

const elevenLabsModels: AssetModelDefinition[] = [
  {
    id: 'eleven_text_to_sound_v2',
    label: 'ElevenLabs Text to Sound v2',
    kind: 'soundEffect',
    adapter: 'elevenlabs-sound-effect',
    maxVariants: 1,
    defaults: {
      durationSeconds: 1,
      loop: false,
      promptInfluence: 0.3,
      outputFormat: 'mp3_44100_128',
    },
  },
  {
    id: 'music_v2',
    label: 'Eleven Music v2',
    kind: 'music',
    adapter: 'elevenlabs-music',
    maxVariants: 1,
    defaults: { musicLengthMs: 30_000, outputFormat: 'mp3_48000_192' },
  },
];

const openAiModels: AssetModelDefinition[] = [
  {
    id: 'gpt-image-2',
    label: 'OpenAI GPT Image 2',
    kind: 'image',
    adapter: 'openai-image',
    maxVariants: 4,
    defaults: {
      size: '1024x1024',
      quality: 'medium',
      format: 'png',
      background: 'transparent',
    },
  },
];

function modelsFor(provider: ProviderDefinition): AssetModelDefinition[] {
  if (provider.models?.length) {
    return provider.models.map((model) => ({
      ...model,
      kind: normalizeAssetCapability(model.kind),
    }));
  }
  if (
    provider.id === 'aliyun-bailian' ||
    provider.kind?.startsWith('aliyun-bailian')
  ) {
    return bailianModels.map((model) =>
      model.id === (provider.model ?? 'wan2.6-t2i')
        ? {
            ...model,
            costPerCandidateCny:
              provider.costPerCandidateCny ?? model.costPerCandidateCny,
          }
        : model,
    );
  }
  if (provider.id === 'openai' || provider.kind === 'openai') {
    return openAiModels;
  }
  if (provider.id === 'elevenlabs' || provider.kind === 'elevenlabs') {
    return elevenLabsModels;
  }
  if (
    provider.kind === 'local-placeholder' ||
    provider.kind === 'test-fixture'
  ) {
    return localModels;
  }
  return [];
}

function providerKind(provider: ProviderDefinition): string {
  if (
    provider.id === 'aliyun-bailian' ||
    provider.kind?.startsWith('aliyun-bailian')
  ) {
    return 'aliyun-bailian';
  }
  if (provider.id === 'openai' || provider.kind === 'openai') return 'openai';
  if (provider.id === 'elevenlabs' || provider.kind === 'elevenlabs') {
    return 'elevenlabs';
  }
  return provider.kind ?? 'unknown';
}

function builtInExternalProvider(
  id: 'openai' | 'aliyun-bailian' | 'elevenlabs',
): ProviderDefinition {
  if (id === 'openai') {
    return {
      id,
      kind: 'openai',
      paid: true,
      enabled: true,
      defaultModelByKind: { image: 'gpt-image-2' },
      models: structuredClone(openAiModels),
    };
  }
  if (id === 'elevenlabs') {
    return {
      id,
      kind: 'elevenlabs',
      paid: true,
      enabled: true,
      defaultModelByKind: {
        soundEffect: 'eleven_text_to_sound_v2',
        music: 'music_v2',
      },
      models: structuredClone(elevenLabsModels),
    };
  }
  return {
    id,
    kind: 'aliyun-bailian',
    paid: true,
    enabled: true,
    defaultModelByKind: {
      image: 'wan2.6-t2i',
      speechGeneration: 'qwen-audio-3.0-tts-flash',
    },
    models: structuredClone(bailianModels),
  };
}

function hash(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function atomicJson(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  if (existsSync(path)) rmSync(path, { force: true });
  renameSync(temporary, path);
}

function svgCandidate(prompt: string, variant: number): Buffer {
  const digest = createHash('sha256').update(`${prompt}:${variant}`).digest();
  const color = `#${digest.subarray(0, 3).toString('hex')}`;
  const accent = `#${digest.subarray(3, 6).toString('hex')}`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" shape-rendering="crispEdges"><rect width="64" height="64" fill="#101827"/><rect x="12" y="16" width="40" height="40" fill="${color}"/><rect x="28" y="4" width="8" height="32" fill="${accent}"/><rect x="5" y="20" width="9" height="32" fill="#758fff"/><rect x="50" y="20" width="9" height="32" fill="#758fff"/></svg>\n`,
    'utf8',
  );
}

function wavCandidate(prompt: string, variant: number): Buffer {
  const sampleRate = 8_000;
  const sampleCount = 1_600;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  const digest = createHash('sha256').update(`${prompt}:${variant}`).digest();
  const frequency = 110 + digest[0]!;
  for (let index = 0; index < sampleCount; index += 1) {
    const phase = (index * frequency) % sampleRate;
    const envelope = 1 - index / sampleCount;
    const sample = (phase < sampleRate / 2 ? 1 : -1) * 5_000 * envelope;
    buffer.writeInt16LE(Math.round(sample), 44 + index * 2);
  }
  return buffer;
}

export class StudioAssetJobBroker {
  readonly #root: string;
  readonly #registry: StudioCommandRegistry;
  readonly #changes?: StudioChangeSetService;
  readonly #storePath: string;
  readonly #auditPath: string;
  readonly #candidateRoot: string;
  readonly #audioInspectorPath: string;
  readonly #resolveCredential?: (id: string) => string;
  readonly #getCredentialRef?: (providerId: string) => string | null;
  readonly #getProviderConnection?: (
    providerId: string,
    credentialRef?: string,
  ) => AssetProviderConnection;
  readonly #getApprovalPolicy?: () => AssetGenerationApprovalPolicy;
  readonly #getCompletionContext?: StudioAssetJobBrokerOptions['getCompletionContext'];
  readonly #onExternalLink?: StudioAssetJobBrokerOptions['onExternalLink'];
  readonly #fetch: typeof fetch;
  readonly #abortControllers = new Map<string, AbortController>();
  #store: JobStore;

  constructor(options: StudioAssetJobBrokerOptions) {
    this.#root = resolve(options.projectRoot);
    this.#audioInspectorPath =
      options.audioInspectorPath ??
      resolve(
        import.meta.dirname,
        '../../target/debug',
        process.platform === 'win32' ? 'ai-game-player.exe' : 'ai-game-player',
      );
    this.#registry = options.registry;
    this.#changes = options.changes;
    const localRoot = join(this.#root, '.aigame', 'local', 'asset-jobs');
    this.#candidateRoot = join(
      this.#root,
      '.aigame',
      'local',
      'asset-candidates',
    );
    this.#resolveCredential = options.resolveCredential;
    this.#getCredentialRef = options.getCredentialRef;
    this.#getProviderConnection = options.getProviderConnection;
    this.#getApprovalPolicy = options.getApprovalPolicy;
    this.#getCompletionContext = options.getCompletionContext;
    this.#onExternalLink = options.onExternalLink;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#storePath = join(localRoot, 'jobs.json');
    this.#auditPath = join(localRoot, 'audit.jsonl');
    mkdirSync(localRoot, { recursive: true });
    mkdirSync(this.#candidateRoot, { recursive: true });
    this.#migrateProviderDocument();
    this.#store = existsSync(this.#storePath)
      ? (JSON.parse(readFileSync(this.#storePath, 'utf8')) as JobStore)
      : { schemaVersion: '1.0.0', jobs: [] };
    for (const job of this.#store.jobs) {
      const legacyKind = job.kind as AssetJobKind;
      const resolvedKind = normalizeAssetCapability(legacyKind);
      job.requestedKind ??= legacyKind;
      job.kind = resolvedKind;
      job.idempotencyKey ??= `idem:${randomUUID()}`;
      job.executionSource ??= 'broker-provider';
      job.completionRunId ??= null;
      job.planStepId ??= null;
      job.toolCallId ??=
        job.executionSource === 'codex-media-tool' &&
        job.providerOperationId?.startsWith('tool-call:')
          ? job.providerOperationId
          : `tool-call:asset/${job.id.replace(/^asset-job:/u, '')}`;
      if (
        job.executionSource === 'codex-media-tool' &&
        job.providerOperationId?.startsWith('tool-call:')
      ) {
        job.providerOperationId = null;
      }
      job.legacyMigration ??=
        legacyKind === 'audio'
          ? {
              requestedCapability: 'audio',
              resolvedCapability: 'speechGeneration',
              rule: 'audio-to-speech-generation-v1',
            }
          : null;
      if (job.modelId === 'deterministic-audio') {
        job.modelId = 'deterministic-speech';
      }
      const provider = this.#provider(job.providerId);
      const model = this.#model(
        provider,
        typeof job.modelId === 'string' ? job.modelId : undefined,
        job.kind,
      );
      if (!job.modelId) job.modelId = model.id;
      if (job.credentialRef === undefined) job.credentialRef = null;
      job.endpointClass ??=
        providerKind(provider) === 'local-placeholder'
          ? 'local'
          : job.kind === 'image'
            ? 'asynchronous'
            : 'synchronous';
      job.parameterSchemaId ??= `media-parameters:${provider.id}/${job.modelId}`;
      job.routeSource ??= 'studio-default';
      if (!job.parameters || typeof job.parameters !== 'object') {
        job.parameters = structuredClone(model.defaults ?? {});
      }
      if (job.approval === undefined) job.approval = null;
      if (job.approval && job.approval.estimateConfigured === undefined) {
        job.approval.estimateConfigured = false;
      }
      if (job.approval && job.approval.policy === undefined) {
        job.approval.policy = 'always';
      }
      if (provider.paid === true && job.status === 'queued') {
        job.status = 'awaitingApproval';
      }
      if (typeof job.estimatedCostCny !== 'number') {
        const estimate = this.estimate({
          providerId: job.providerId,
          modelId: job.modelId,
          variants: job.variants,
        });
        job.estimatedCostCny = estimate.estimatedCostCny;
        job.costEstimateConfigured = estimate.costConfigured;
      }
      if (job.costEstimateConfigured === undefined) {
        job.costEstimateConfigured = false;
      }
      if (job.actualCostCny === undefined) job.actualCostCny = null;
      job.importChangeSetId ??= null;
      job.reviewDecisionId ??= null;
      job.rejectedCandidateIds ??= [];
      job.regeneration ??= null;
      job.failure ??= job.error ? this.#classifyFailure(job.error) : null;
      job.progress ??= {
        stage:
          job.status === 'running'
            ? 'processing'
            : job.status === 'awaitingReview'
              ? 'finalizing'
              : 'queued',
        fraction: job.status === 'awaitingReview' ? 1 : null,
        message: job.status,
      };
      job.providerOperationId ??= null;
      job.remoteCancellationGuaranteed ??= false;
      job.attemptHistory ??= Array.from(
        { length: Math.max(0, Number(job.attempts ?? 0)) },
        (_, index) => ({
          id: `asset-attempt:migrated-${hash(`${job.id}:${index + 1}`).slice(0, 16)}`,
          number: index + 1,
          status:
            index + 1 === job.attempts && job.status === 'failed'
              ? job.failure?.category === 'timeout-ambiguous'
                ? 'ambiguous'
                : 'failed'
              : 'succeeded',
          startedAt: job.createdAt,
          finishedAt: job.updatedAt,
          reconciliation:
            index + 1 === job.attempts &&
            job.failure?.category === 'timeout-ambiguous'
              ? 'pending'
              : 'not-required',
        }),
      );
      job.retryPolicy ??= {
        maxAttempts: 3,
        backoffBaseMs: 1_000,
        backoffCapMs: 30_000,
        nextRetryAt: null,
      };
      const candidateIdMap = new Map<string, string>();
      job.candidates = job.candidates.map((candidate) => {
        const candidateId = candidate.id.startsWith('candidate:')
          ? candidate.id
          : `candidate:${hash(candidate.id).slice(0, 24)}`;
        candidateIdMap.set(candidate.id, candidateId);
        return {
          ...candidate,
          id: candidateId,
          artifactId:
            candidate.artifactId ??
            `artifact:${hash(`${job.id}:${candidate.sha256}`).slice(0, 24)}`,
          bytes:
            candidate.bytes ??
            (existsSync(join(this.#root, candidate.path))
              ? readFileSync(join(this.#root, candidate.path)).byteLength
              : 0),
          media:
            candidate.media ??
            this.#migrateCandidateMedia(
              job,
              existsSync(join(this.#root, candidate.path))
                ? readFileSync(join(this.#root, candidate.path))
                : Buffer.alloc(0),
              candidate.mime,
            ),
          reviewState:
            candidate.reviewState ??
            (job.selectedCandidateId === candidate.id
              ? 'selected'
              : 'awaitingReview'),
          recommendation: candidate.recommendation ?? null,
          decision: candidate.decision ?? null,
          parentCandidateId: candidate.parentCandidateId ?? null,
        };
      });
      if (job.selectedCandidateId) {
        job.selectedCandidateId =
          candidateIdMap.get(job.selectedCandidateId) ??
          job.selectedCandidateId;
      }
    }
    this.#save();
  }

  list(): StudioAssetJob[] {
    this.#reconcileImports();
    return structuredClone(this.#store.jobs).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  providers(): AssetProviderHealth[] {
    return this.#providerDocument().providers.map((provider) =>
      this.health(provider.id),
    );
  }

  health(id: string): AssetProviderHealth {
    const provider = this.#provider(id);
    const kind = providerKind(provider);
    const testOnly = kind === 'local-placeholder' || kind === 'test-fixture';
    const connection = this.#connection(id);
    let available = provider.enabled !== false;
    let reason = available
      ? 'ready'
      : 'provider is disabled in project configuration';
    if (testOnly) {
      available = true;
      reason = 'test-only deterministic generator; not a production AI service';
    } else if (
      kind === 'aliyun-bailian' ||
      kind === 'openai' ||
      kind === 'elevenlabs'
    ) {
      const credentialRef = connection.credentialRef;
      if (!credentialRef) {
        available = false;
        reason =
          'select an encrypted OS credential reference in AI Tools settings';
      } else if (!this.#resolveCredential) {
        available = false;
        reason = 'credential vault is unavailable in this host';
      }
    } else {
      available = false;
      reason = `unsupported provider adapter: ${kind}`;
    }
    const models = modelsFor(provider).map((model) => {
      let modelAvailable = model.enabled !== false && available;
      let modelReason = modelAvailable ? 'ready' : reason;
      if (
        model.adapter === 'aliyun-bailian-tts' &&
        (!connection.workspaceId || connection.region !== 'cn-beijing')
      ) {
        modelAvailable = false;
        modelReason = '非实时语音需要北京地域的百炼 Workspace ID';
      }
      return {
        id: model.id,
        label: model.label ?? model.id,
        kind: model.kind,
        available: modelAvailable,
        reason: modelReason,
        maxVariants: Math.max(1, Math.min(6, model.maxVariants ?? 4)),
        promptMaxCharacters: this.#promptLimit(model),
        costPerCandidateCny: Math.max(
          0,
          model.costPerCandidateCny ?? provider.costPerCandidateCny ?? 0,
        ),
        costConfigured:
          typeof model.costPerCandidateCny === 'number' ||
          typeof provider.costPerCandidateCny === 'number',
        defaults: structuredClone(model.defaults ?? {}),
      };
    });
    return {
      id,
      kind,
      model: provider.model ?? null,
      available,
      paid: provider.paid === true,
      testOnly,
      reason,
      costPerCandidateCny: Math.max(0, provider.costPerCandidateCny ?? 0),
      models,
    };
  }

  estimate(input: {
    kind?: AssetJobKind;
    providerId?: string;
    modelId?: string;
    variants?: number;
  }): {
    providerId: string;
    modelId: string;
    variants: number;
    currency: 'CNY';
    estimatedCostCny: number;
    costConfigured: boolean;
    promptMaxCharacters: number;
  } {
    const kind = normalizeAssetCapability(input.kind ?? 'image');
    const route = this.#resolveRoute(kind, input.providerId);
    const provider = route.provider;
    const requestedKind = modelsFor(provider).find(
      (candidate) => candidate.id === input.modelId,
    )?.kind;
    const model = this.#model(
      provider,
      input.modelId ?? route.modelId,
      normalizeAssetCapability(requestedKind ?? kind),
    );
    const variants = Math.max(
      1,
      Math.min(model.maxVariants ?? 4, input.variants ?? 2),
    );
    return {
      providerId: provider.id,
      modelId: model.id,
      variants,
      promptMaxCharacters: this.#promptLimit(model),
      currency: 'CNY',
      estimatedCostCny: Number(
        (
          variants *
          Math.max(
            0,
            model.costPerCandidateCny ?? provider.costPerCandidateCny ?? 0,
          )
        ).toFixed(4),
      ),
      costConfigured:
        typeof model.costPerCandidateCny === 'number' ||
        typeof provider.costPerCandidateCny === 'number',
    };
  }

  submit(input: {
    kind: AssetJobKind;
    providerId?: string;
    credentialRef?: string;
    modelId?: string;
    parameters?: Record<string, string | number | boolean>;
    prompt: string;
    outputName: string;
    variants?: number;
    completionRunId?: string;
    planStepId?: string | null;
    toolCallId?: string;
  }): StudioAssetJob {
    if (
      !['image', 'soundEffect', 'music', 'speechGeneration', 'audio'].includes(
        input.kind,
      )
    ) {
      throw new ProjectError(
        'ASSET_JOB_KIND_INVALID',
        '资源任务类型必须是 image、soundEffect、music 或 speechGeneration。',
      );
    }
    if (!input.prompt.trim() || input.prompt.length > 4_000) {
      throw new ProjectError(
        'ASSET_JOB_PROMPT_INVALID',
        '资源提示词必须为 1–4000 字符。',
      );
    }
    if (!safeName.test(input.outputName)) {
      throw new ProjectError(
        'ASSET_JOB_NAME_INVALID',
        '输出文件名必须是安全的小写文件名。',
      );
    }
    const kind = normalizeAssetCapability(input.kind);
    const route = this.#resolveRoute(
      kind,
      input.providerId,
      input.modelId,
      input.credentialRef,
    );
    const provider = route.provider;
    const model = this.#model(provider, route.modelId, kind);
    const effectiveConnection = this.#connection(
      provider.id,
      route.credentialRef,
    );
    if (normalizeAssetCapability(model.kind) !== kind) {
      throw new ProjectError(
        'ASSET_JOB_MODEL_KIND_MISMATCH',
        `模型 ${model.id} 不支持 ${kind} 任务。`,
      );
    }
    const now = new Date().toISOString();
    const estimate = this.estimate({
      kind,
      providerId: provider.id,
      modelId: model.id,
      variants: input.variants,
    });
    const parameters = {
      ...structuredClone(model.defaults ?? {}),
      ...structuredClone(input.parameters ?? {}),
    };
    this.#validateParameters(model, parameters);
    this.#validatePrompt(model, input.prompt);
    const completionContext = this.#getCompletionContext?.() ?? null;
    const jobId = `asset-job:${randomUUID()}`;
    const job: StudioAssetJob = {
      id: jobId,
      idempotencyKey: `idem:${randomUUID()}`,
      completionRunId:
        input.completionRunId ?? completionContext?.completionRunId ?? null,
      planStepId: input.planStepId ?? completionContext?.planStepId ?? null,
      toolCallId:
        input.toolCallId ??
        `tool-call:asset/${jobId.replace(/^asset-job:/u, '')}`,
      executionSource: 'broker-provider',
      kind,
      requestedKind: input.kind,
      legacyMigration:
        input.kind === 'audio'
          ? {
              requestedCapability: 'audio',
              resolvedCapability: 'speechGeneration',
              rule: 'audio-to-speech-generation-v1',
            }
          : null,
      providerId: provider.id,
      credentialRef: effectiveConnection.credentialRef ?? null,
      modelId: model.id,
      endpointClass:
        providerKind(provider) === 'local-placeholder'
          ? 'local'
          : model.adapter === 'aliyun-bailian-image'
            ? 'asynchronous'
            : 'synchronous',
      parameterSchemaId: `media-parameters:${provider.id}/${model.id}`,
      routeSource: input.providerId ? 'request-override' : route.routeSource,
      parameters,
      prompt: input.prompt.trim(),
      outputName: input.outputName,
      variants: estimate.variants,
      attempts: 0,
      attemptHistory: [],
      retryPolicy: {
        maxAttempts: 3,
        backoffBaseMs: 1_000,
        backoffCapMs: 30_000,
        nextRetryAt: null,
      },
      status: provider.paid === true ? 'awaitingApproval' : 'queued',
      candidates: [],
      selectedCandidateId: null,
      importedAssetId: null,
      importChangeSetId: null,
      reviewDecisionId: null,
      rejectedCandidateIds: [],
      regeneration: null,
      error: null,
      failure: null,
      progress: {
        stage: 'queued',
        fraction: 0,
        message: provider.paid === true ? '等待供应商调用审批' : '任务已排队',
      },
      providerOperationId: null,
      remoteCancellationGuaranteed: false,
      estimatedCostCny: estimate.estimatedCostCny,
      costEstimateConfigured: estimate.costConfigured,
      actualCostCny: null,
      approval: null,
      createdAt: now,
      updatedAt: now,
    };
    this.#store.jobs.push(job);
    this.#save();
    this.#publishCompletionLinks(job);
    this.#audit('asset-job.submitted', job, {
      capability: job.kind,
      routeSource: job.routeSource,
    });
    return structuredClone(job);
  }

  registerToolOutput(input: {
    kind: AssetGenerationCapability;
    providerId: string;
    modelId: string;
    prompt: string;
    outputName: string;
    sourcePath: string;
    expectedSha256: string;
    toolCallId: string;
    idempotencyKey: string;
    parameters?: Record<string, string | number | boolean>;
    completionRunId?: string;
    planStepId?: string | null;
  }): StudioAssetJob {
    if (
      !['image', 'soundEffect', 'music', 'speechGeneration'].includes(
        input.kind,
      )
    ) {
      throw new ProjectError(
        'ASSET_TOOL_OUTPUT_KIND_INVALID',
        'Codex 媒体工具输出类型无效。',
      );
    }
    if (!input.prompt.trim() || input.prompt.length > 4_000) {
      throw new ProjectError(
        'ASSET_JOB_PROMPT_INVALID',
        '资源提示词必须为 1–4000 字符。',
      );
    }
    if (!safeName.test(input.outputName)) {
      throw new ProjectError(
        'ASSET_JOB_NAME_INVALID',
        '输出文件名必须是安全的小写文件名。',
      );
    }
    if (!/^idem:[a-z0-9][a-z0-9_-]*$/u.test(input.idempotencyKey)) {
      throw new ProjectError(
        'ASSET_TOOL_OUTPUT_IDEMPOTENCY_INVALID',
        'Codex 媒体工具输出需要稳定的 idem: 幂等键。',
      );
    }
    if (!/^tool-call:[a-z0-9][a-z0-9_./-]*$/u.test(input.toolCallId)) {
      throw new ProjectError(
        'ASSET_TOOL_OUTPUT_CALL_ID_INVALID',
        'Codex 媒体工具输出需要稳定的 tool-call: ID。',
      );
    }
    const existing = this.#store.jobs.find(
      (job) => job.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return structuredClone(existing);
    if (!/^[a-z][a-z0-9._-]{1,95}$/u.test(input.providerId)) {
      throw new ProjectError(
        'ASSET_TOOL_OUTPUT_PROVIDER_INVALID',
        'Codex 媒体工具 Provider ID 无效。',
      );
    }
    const provider = this.#provider(input.providerId);
    const model = this.#model(provider, input.modelId, input.kind);
    if (normalizeAssetCapability(model.kind) !== input.kind) {
      throw new ProjectError(
        'ASSET_JOB_MODEL_KIND_MISMATCH',
        `模型 ${model.id} 不支持 ${input.kind} 任务。`,
      );
    }
    const sourcePath = resolve(input.sourcePath);
    const candidateRelative = relative(this.#candidateRoot, sourcePath);
    if (
      !candidateRelative ||
      candidateRelative.startsWith('..') ||
      candidateRelative.includes(':')
    ) {
      throw new ProjectError(
        'ASSET_TOOL_OUTPUT_SOURCE_REJECTED',
        'Codex 媒体工具输出必须先写入 Studio 受控候选目录。',
      );
    }
    if (!existsSync(sourcePath)) {
      throw new ProjectError(
        'ASSET_TOOL_OUTPUT_SOURCE_MISSING',
        'Codex 媒体工具输出文件不存在。',
      );
    }
    const stats = statSync(sourcePath);
    if (!stats.isFile() || stats.size === 0 || stats.size > 32 * 1024 * 1024) {
      throw new ProjectError(
        'ASSET_TOOL_OUTPUT_SOURCE_INVALID',
        'Codex 媒体工具输出必须是小于 32 MiB 的非空普通文件。',
      );
    }
    const bytes = readFileSync(sourcePath);
    const actualSha256 = hash(bytes);
    if (
      !/^[a-f0-9]{64}$/u.test(input.expectedSha256) ||
      actualSha256 !== input.expectedSha256
    ) {
      throw new ProjectError(
        'ASSET_TOOL_OUTPUT_HASH_MISMATCH',
        'Codex 媒体工具输出哈希不匹配。',
      );
    }
    const extension = extname(sourcePath).toLowerCase();
    const mime =
      extension === '.png'
        ? 'image/png'
        : extension === '.jpg' || extension === '.jpeg'
          ? 'image/jpeg'
          : extension === '.webp'
            ? 'image/webp'
            : extension === '.svg'
              ? 'image/svg+xml'
              : extension === '.wav'
                ? 'audio/wav'
                : extension === '.mp3'
                  ? 'audio/mpeg'
                  : '';
    if (
      !mime ||
      (input.kind === 'image' && !mime.startsWith('image/')) ||
      (input.kind !== 'image' && !mime.startsWith('audio/'))
    ) {
      throw new ProjectError(
        'ASSET_TOOL_OUTPUT_MIME_REJECTED',
        'Codex 媒体工具输出格式与声明能力不匹配。',
      );
    }
    const now = new Date().toISOString();
    const completionContext = this.#getCompletionContext?.() ?? null;
    const job: StudioAssetJob = {
      id: `asset-job:${randomUUID()}`,
      idempotencyKey: input.idempotencyKey,
      completionRunId:
        input.completionRunId ?? completionContext?.completionRunId ?? null,
      planStepId: input.planStepId ?? completionContext?.planStepId ?? null,
      toolCallId: input.toolCallId,
      executionSource: 'codex-media-tool',
      kind: input.kind,
      requestedKind: input.kind,
      legacyMigration: null,
      providerId: provider.id,
      credentialRef: null,
      modelId: model.id,
      endpointClass: 'local',
      parameterSchemaId: `media-parameters:${provider.id}/${model.id}`,
      routeSource: 'request-override',
      parameters: structuredClone(input.parameters ?? {}),
      prompt: input.prompt.trim(),
      outputName: input.outputName,
      variants: 1,
      attempts: 1,
      attemptHistory: [
        {
          id: `asset-attempt:${randomUUID()}`,
          number: 1,
          status: 'succeeded',
          startedAt: now,
          finishedAt: now,
          reconciliation: 'not-required',
        },
      ],
      retryPolicy: {
        maxAttempts: 3,
        backoffBaseMs: 1_000,
        backoffCapMs: 30_000,
        nextRetryAt: null,
      },
      status: 'awaitingReview',
      candidates: [],
      selectedCandidateId: null,
      importedAssetId: null,
      importChangeSetId: null,
      reviewDecisionId: null,
      rejectedCandidateIds: [],
      regeneration: null,
      error: null,
      failure: null,
      progress: {
        stage: 'finalizing',
        fraction: 1,
        message: 'Codex 媒体工具输出已登记，等待审核',
      },
      providerOperationId: null,
      remoteCancellationGuaranteed: false,
      estimatedCostCny: 0,
      costEstimateConfigured: false,
      actualCostCny: null,
      approval: null,
      createdAt: now,
      updatedAt: now,
    };
    job.candidates = [this.#candidateRecord(job, sourcePath, bytes, mime)];
    this.#store.jobs.push(job);
    this.#save();
    this.#publishCompletionLinks(job);
    this.#audit('asset-job.tool-output-registered', job, {
      toolCallId: input.toolCallId,
      candidateId: job.candidates[0]?.id,
      sourceSha256: actualSha256,
      authorizationInference: 'none',
    });
    return structuredClone(job);
  }

  run(id: string): StudioAssetJob {
    const job = this.#job(id);
    const provider = this.#provider(job.providerId);
    if (provider.paid === true) {
      job.status = 'awaitingApproval';
      job.error = null;
      job.failure = null;
      job.progress = {
        stage: 'queued',
        fraction: 0,
        message: '等待供应商调用审批',
      };
      job.updatedAt = new Date().toISOString();
      this.#save();
      return structuredClone(job);
    }
    job.status = 'running';
    job.attempts += 1;
    this.#beginAttempt(job);
    job.progress = {
      stage: 'processing',
      fraction: 0.25,
      message: '本地确定性生成器正在创建候选',
    };
    job.updatedAt = new Date().toISOString();
    job.error = null;
    this.#save();
    if (
      provider.kind !== 'local-placeholder' &&
      provider.kind !== 'test-fixture'
    ) {
      return this.#fail(
        job,
        'ASSET_PROVIDER_NOT_CONNECTED: provider adapter is not installed',
      );
    }
    if (job.attempts <= (provider.failFirstAttempts ?? 0)) {
      return this.#fail(
        job,
        'ASSET_PROVIDER_TRANSIENT: simulated provider failure',
      );
    }
    const directory = join(this.#candidateRoot, id.replace(':', '_'));
    mkdirSync(directory, { recursive: true });
    job.candidates = Array.from({ length: job.variants }, (_, offset) => {
      const variant = offset + 1;
      const extension = job.kind === 'image' ? '.svg' : '.wav';
      const stem = job.outputName.replace(/\.[^.]+$/u, '');
      const path = join(directory, `${stem}-v${variant}${extension}`);
      const bytes =
        job.kind === 'image'
          ? svgCandidate(job.prompt, variant)
          : wavCandidate(job.prompt, variant);
      writeFileSync(path, bytes);
      return this.#candidateRecord(
        job,
        path,
        bytes,
        job.kind === 'image' ? 'image/svg+xml' : 'audio/wav',
      );
    });
    job.status = 'awaitingReview';
    job.progress = {
      stage: 'finalizing',
      fraction: 1,
      message: '候选已就绪，等待审核',
    };
    job.updatedAt = new Date().toISOString();
    this.#finishAttempt(job, 'succeeded', 'not-required');
    this.#save();
    return structuredClone(job);
  }

  async runAsync(id: string): Promise<StudioAssetJob> {
    return this.#runAsync(id, false);
  }

  async approveAndRun(id: string): Promise<StudioAssetJob> {
    const job = this.#job(id);
    const provider = this.#provider(job.providerId);
    if (provider.paid === true) {
      job.approval = {
        approvedBy: 'human',
        policy: 'always',
        approvedAt: new Date().toISOString(),
        estimateCny: job.estimatedCostCny,
        estimateConfigured: job.costEstimateConfigured,
        modelId: job.modelId,
        parametersSha256: hash(JSON.stringify(job.parameters)),
      };
      this.#save();
    }
    return this.#runAsync(id, true);
  }

  async runWithPolicy(id: string): Promise<StudioAssetJob> {
    const job = this.#job(id);
    const provider = this.#provider(job.providerId);
    if (provider.paid !== true) return this.#runAsync(id, false);
    const policy = this.#approvalPolicy();
    // A task grant must never authorize an old or unrelated paid test job.
    if (
      policy.authorizationId &&
      (!policy.completionRunId ||
        job.completionRunId !== policy.completionRunId)
    ) {
      return this.#runAsync(id, false);
    }
    const approved =
      policy.mode === 'auto' ||
      (policy.mode === 'budget' &&
        job.costEstimateConfigured &&
        job.estimatedCostCny <= policy.autoApproveMaxCny);
    if (!approved) return this.#runAsync(id, false);
    job.approval = {
      approvedBy: 'policy',
      ...(policy.authorizationId
        ? { authorizationId: policy.authorizationId }
        : {}),
      policy: policy.mode,
      approvedAt: new Date().toISOString(),
      estimateCny: job.estimatedCostCny,
      estimateConfigured: job.costEstimateConfigured,
      modelId: job.modelId,
      parametersSha256: hash(JSON.stringify(job.parameters)),
    };
    this.#save();
    return this.#runAsync(id, true);
  }

  async resumeWithPolicy(id: string): Promise<StudioAssetJob> {
    const job = this.#job(id);
    if (['running', 'awaitingReview', 'imported'].includes(job.status)) {
      return structuredClone(job);
    }
    if (job.status !== 'queued' && job.status !== 'awaitingApproval') {
      throw new ProjectError(
        'ASSET_JOB_NOT_RESUMABLE',
        '仅排队或等待授权的任务可恢复；失败任务须走安全重试。',
      );
    }
    return this.runWithPolicy(id);
  }

  async #runAsync(id: string, humanApproved: boolean): Promise<StudioAssetJob> {
    const job = this.#job(id);
    const provider = this.#provider(job.providerId);
    const model = this.#model(provider, job.modelId, job.kind);
    try {
      // Recheck queued jobs created by an older Studio before resolving secrets
      // or spending an attempt. Never silently truncate an approved prompt.
      this.#validatePrompt(model, job.prompt);
    } catch (error) {
      if (error instanceof ProjectError)
        return this.#fail(job, `${error.code}: ${error.message}`);
      throw error;
    }
    if (
      provider.kind === 'local-placeholder' ||
      provider.kind === 'test-fixture'
    ) {
      return this.run(id);
    }
    if (provider.paid === true && !humanApproved) {
      job.status = 'awaitingApproval';
      job.error = null;
      job.updatedAt = new Date().toISOString();
      this.#save();
      return structuredClone(job);
    }
    if (
      !['aliyun-bailian', 'openai', 'elevenlabs'].includes(
        providerKind(provider),
      )
    ) {
      return this.#fail(
        job,
        `ASSET_PROVIDER_NOT_CONNECTED: unsupported adapter ${provider.kind ?? 'unknown'}`,
      );
    }
    if (
      model.adapter !== 'aliyun-bailian-image' &&
      model.adapter !== 'aliyun-bailian-tts' &&
      model.adapter !== 'openai-image' &&
      model.adapter !== 'elevenlabs-sound-effect' &&
      model.adapter !== 'elevenlabs-music'
    ) {
      return this.#fail(
        job,
        `ASSET_PROVIDER_KIND_UNSUPPORTED: ${model.id} has no production adapter`,
      );
    }
    const health = this.health(provider.id);
    if (!health.available) {
      return this.#fail(job, `ASSET_PROVIDER_UNAVAILABLE: ${health.reason}`);
    }
    const connection = this.#connection(
      provider.id,
      job.credentialRef ?? undefined,
    );
    const credentialRef = connection.credentialRef;
    if (!credentialRef || !this.#resolveCredential) {
      return this.#fail(job, 'ASSET_PROVIDER_CREDENTIAL_MISSING');
    }
    const controller = new AbortController();
    this.#abortControllers.set(id, controller);
    job.status = 'running';
    job.attempts += 1;
    this.#beginAttempt(job);
    job.error = null;
    job.failure = null;
    job.progress = {
      stage: 'submitted',
      fraction: 0.1,
      message: '正在向供应商提交任务',
    };
    job.updatedAt = new Date().toISOString();
    this.#save();
    let resolvedCredentialSecret: string | null = null;
    try {
      resolvedCredentialSecret = this.#resolveCredential(credentialRef);
      const apiKey = resolvedCredentialSecret;
      const endpoint = this.#trustedEndpoint(
        this.#endpoint(provider, model, connection, job.parameters),
      );
      const body =
        model.adapter === 'elevenlabs-sound-effect'
          ? {
              text: job.prompt,
              model_id: model.id,
              duration_seconds: Number(job.parameters.durationSeconds ?? 1),
              prompt_influence: Number(job.parameters.promptInfluence ?? 0.3),
              loop: job.parameters.loop === true,
            }
          : model.adapter === 'elevenlabs-music'
            ? {
                prompt: job.prompt,
                music_length_ms: Number(job.parameters.musicLengthMs ?? 30_000),
              }
            : model.adapter === 'aliyun-bailian-tts'
              ? {
                  model: model.id,
                  input: {
                    text: job.prompt,
                    voice: String(job.parameters.voice ?? 'longanhuan_v3.6'),
                    format: 'wav',
                    sample_rate: Number(job.parameters.sampleRate ?? 24000),
                  },
                }
              : model.adapter === 'openai-image'
                ? {
                    model: model.id,
                    prompt: job.prompt,
                    n: job.variants,
                    size: String(job.parameters.size ?? '1024x1024'),
                    quality: String(job.parameters.quality ?? 'medium'),
                    output_format: String(job.parameters.format ?? 'png'),
                    background: String(
                      job.parameters.background ?? 'transparent',
                    ),
                  }
                : {
                    model: model.id,
                    input: {
                      messages: [
                        { role: 'user', content: [{ text: job.prompt }] },
                      ],
                    },
                    parameters: {
                      n: job.variants,
                      size: String(job.parameters.size ?? '1280*1280'),
                      watermark: job.parameters.watermark === true,
                      prompt_extend: job.parameters.promptExtend !== false,
                    },
                  };
      const elevenLabs = model.adapter.startsWith('elevenlabs-');
      const response = await this.#fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          ...(elevenLabs
            ? { 'xi-api-key': apiKey }
            : { Authorization: `Bearer ${apiKey}` }),
          'Content-Type': 'application/json',
          Accept: elevenLabs ? 'audio/mpeg' : 'application/json',
          'Idempotency-Key': job.idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'));
        let failure = this.#httpFailure(
          provider.id,
          response.status,
          retryAfter,
        );
        if (elevenLabs) {
          const detail = await readElevenLabsProviderFailure(response);
          if (controller.signal.aborted) return structuredClone(job);
          if (detail) failure = { ...failure, ...detail };
          else if (response.status === 400) {
            failure = {
              ...failure,
              code: 'ASSET_PROVIDER_REQUEST_REJECTED',
              category: 'internal',
              retryable: false,
              message:
                'elevenlabs request failed with HTTP 400; no recognized safe error category was returned. The cause is unconfirmed; do not blindly retry.',
            };
          }
        }
        return this.#failDetailed(job, failure);
      }
      job.progress = {
        stage: 'downloading',
        fraction: 0.7,
        message: '供应商已返回，正在校验候选',
      };
      this.#save();
      if (elevenLabs) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > 25 * 1024 * 1024) {
          throw new ProjectError(
            'ASSET_PROVIDER_CANDIDATE_TOO_LARGE',
            'Candidate is empty or exceeds the 25 MiB safety limit.',
          );
        }
        const contentType =
          response.headers.get('content-type') ?? 'audio/mpeg';
        if (!/^audio\/(?:mpeg|mp3|wav|x-wav|wave)(?:;|$)/iu.test(contentType)) {
          throw new ProjectError(
            'ASSET_PROVIDER_MIME_REJECTED',
            `Candidate MIME is not supported: ${contentType}`,
          );
        }
        const extension = /^audio\/(?:wav|x-wav|wave)(?:;|$)/iu.test(
          contentType,
        )
          ? '.wav'
          : '.mp3';
        const directory = join(this.#candidateRoot, id.replace(':', '_'));
        mkdirSync(directory, { recursive: true });
        const stem = job.outputName.replace(/\.[^.]+$/u, '');
        const path = join(directory, `${stem}-v1${extension}`);
        writeFileSync(path, bytes);
        job.candidates = [
          this.#candidateRecord(
            job,
            path,
            bytes,
            contentType.split(';')[0] || 'audio/mpeg',
          ),
        ];
        job.status = 'awaitingReview';
        job.progress = {
          stage: 'finalizing',
          fraction: 1,
          message: '候选已就绪，等待审核',
        };
        job.actualCostCny = job.costEstimateConfigured
          ? job.estimatedCostCny
          : null;
        job.updatedAt = new Date().toISOString();
        this.#finishAttempt(job, 'succeeded', 'not-required');
        this.#save();
        return structuredClone(job);
      }
      const value = (await response.json()) as unknown;
      const encoded = this.#base64Candidates(value).slice(0, job.variants);
      const urls = this.#candidateUrls(value).slice(0, job.variants);
      if (urls.length === 0 && encoded.length === 0) {
        throw new ProjectError(
          'ASSET_PROVIDER_RESPONSE_INVALID',
          `${provider.id} response did not contain supported candidates.`,
        );
      }
      const directory = join(this.#candidateRoot, id.replace(':', '_'));
      mkdirSync(directory, { recursive: true });
      const stem = job.outputName.replace(/\.[^.]+$/u, '');
      const candidates: AssetCandidate[] = [];
      for (const [offset, base64] of encoded.entries()) {
        if (base64.length > 36 * 1024 * 1024)
          throw new ProjectError(
            'ASSET_PROVIDER_CANDIDATE_TOO_LARGE',
            'Candidate exceeds the encoded safety limit.',
          );
        const bytes = Buffer.from(base64, 'base64');
        if (bytes.byteLength === 0 || bytes.byteLength > 25 * 1024 * 1024)
          throw new ProjectError(
            'ASSET_PROVIDER_CANDIDATE_TOO_LARGE',
            'Candidate is empty or exceeds the 25 MiB safety limit.',
          );
        const format = String(job.parameters.format ?? 'png').toLowerCase();
        const extension = format === 'jpeg' ? '.jpg' : `.${format}`;
        const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime))
          throw new ProjectError(
            'ASSET_PROVIDER_MIME_REJECTED',
            `Candidate format is not supported: ${format}`,
          );
        const path = join(directory, `${stem}-v${offset + 1}${extension}`);
        writeFileSync(path, bytes);
        candidates.push(this.#candidateRecord(job, path, bytes, mime));
      }
      for (const [offset, imageUrl] of urls.entries()) {
        const trusted = this.#trustedCandidateUrl(imageUrl);
        const imageResponse = await this.#fetch(trusted, {
          redirect: 'error',
          signal: controller.signal,
        });
        if (!imageResponse.ok)
          throw new ProjectError(
            'ASSET_PROVIDER_DOWNLOAD_FAILED',
            `Candidate download failed with HTTP ${imageResponse.status}`,
          );
        const contentType = imageResponse.headers.get('content-type') ?? '';
        const accepted =
          job.kind === 'image'
            ? /^image\/(?:png|jpeg|webp)(?:;|$)/iu.test(contentType)
            : /^audio\/(?:wav|x-wav|wave)(?:;|$)/iu.test(contentType);
        if (!accepted)
          throw new ProjectError(
            'ASSET_PROVIDER_MIME_REJECTED',
            `Candidate MIME is not supported: ${contentType || 'missing'}`,
          );
        const bytes = Buffer.from(await imageResponse.arrayBuffer());
        if (bytes.byteLength > 25 * 1024 * 1024)
          throw new ProjectError(
            'ASSET_PROVIDER_CANDIDATE_TOO_LARGE',
            'Candidate exceeds the 25 MiB safety limit.',
          );
        const extension =
          job.kind !== 'image'
            ? '.wav'
            : contentType.includes('jpeg')
              ? '.jpg'
              : contentType.includes('webp')
                ? '.webp'
                : '.png';
        const candidateNumber = candidates.length + offset + 1;
        const path = join(directory, `${stem}-v${candidateNumber}${extension}`);
        writeFileSync(path, bytes);
        candidates.push(
          this.#candidateRecord(
            job,
            path,
            bytes,
            contentType.split(';')[0] ||
              (job.kind !== 'image' ? 'audio/wav' : 'image/png'),
          ),
        );
      }
      job.candidates = candidates;
      job.status = 'awaitingReview';
      job.progress = {
        stage: 'finalizing',
        fraction: 1,
        message: '候选已就绪，等待审核',
      };
      job.actualCostCny = job.costEstimateConfigured
        ? Number(
            (
              candidates.length *
              Math.max(
                0,
                model.costPerCandidateCny ?? provider.costPerCandidateCny ?? 0,
              )
            ).toFixed(4),
          )
        : null;
      job.updatedAt = new Date().toISOString();
      this.#finishAttempt(job, 'succeeded', 'not-required');
      this.#save();
      return structuredClone(job);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        job.status = 'cancelled';
        job.error = 'ASSET_JOB_CANCELLED';
        job.failure = {
          code: 'ASSET_JOB_CANCELLED',
          category: 'cancelled',
          message: '资源生成任务已取消；供应商侧取消并不保证。',
          retryable: true,
        };
        job.updatedAt = new Date().toISOString();
        this.#finishAttempt(job, 'cancelled', 'not-required');
        this.#save();
        return structuredClone(job);
      }
      const message =
        error instanceof ProjectError
          ? `${error.code}: ${error.message}`
          : `ASSET_PROVIDER_REQUEST_FAILED: ${error instanceof Error ? error.message : String(error)}`;
      return this.#fail(
        job,
        this.#redact(
          message,
          resolvedCredentialSecret ? [resolvedCredentialSecret] : [],
        ),
      );
    } finally {
      this.#abortControllers.delete(id);
    }
  }

  cancel(id: string): StudioAssetJob {
    const job = this.#job(id);
    if (
      job.status !== 'queued' &&
      job.status !== 'awaitingApproval' &&
      job.status !== 'running'
    )
      throw new ProjectError(
        'ASSET_JOB_NOT_CANCELLABLE',
        '只有排队中或运行中的任务可以取消。',
      );
    this.#abortControllers.get(id)?.abort();
    job.status = 'cancelled';
    job.error = 'ASSET_JOB_CANCELLED';
    job.failure = {
      code: 'ASSET_JOB_CANCELLED',
      category: 'cancelled',
      message: '本地任务已取消；供应商侧可能仍会完成并计费。',
      retryable: true,
    };
    job.progress = {
      stage: 'finalizing',
      fraction: null,
      message: '已发出取消请求，远端取消不保证',
    };
    job.updatedAt = new Date().toISOString();
    this.#finishAttempt(job, 'cancelled', 'not-required');
    this.#save();
    this.#audit('asset-job.cancelled', job, {
      remoteCancellationGuaranteed: false,
    });
    return structuredClone(job);
  }

  select(
    id: string,
    candidateId: string,
    reviewedBy: 'human' | 'configured-policy' = 'human',
    options: {
      reason?: string;
      artDirectionSkillId?: string;
      artDirectionSkillHash?: string;
      assetBriefId?: string;
      assetBriefHash?: string;
      sourceHashes?: string[];
      derivedContentHashes?: string[];
      license?: string;
      restrictions?: string[];
      importSettings?: Record<string, unknown>;
      references?: Array<{
        scene?: string;
        objectId: string;
        componentId: string;
        property: string;
      }>;
    } = {},
  ): StudioAssetJob {
    const job = this.#job(id);
    if (
      job.status !== 'awaitingReview' &&
      job.status !== 'awaitingImportApproval' &&
      job.status !== 'imported'
    ) {
      throw new ProjectError(
        'ASSET_JOB_NOT_REVIEWABLE',
        '任务没有可供审阅的候选资源。',
      );
    }
    const candidate = job.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new ProjectError('ASSET_CANDIDATE_NOT_FOUND', '资源候选不存在。');
    }
    if (candidate.reviewState === 'rejected') {
      throw new ProjectError(
        'ASSET_CANDIDATE_REJECTED',
        '已拒绝的候选不能导入；请重新生成或选择其他候选。',
      );
    }
    const candidatePath = join(this.#root, candidate.path);
    const candidateBytes = readFileSync(candidatePath);
    if (hash(candidateBytes) !== candidate.sha256) {
      throw new ProjectError(
        'ASSET_CANDIDATE_HASH_MISMATCH',
        '候选资源在审核后发生变化，已拒绝创建导入 ChangeSet。',
      );
    }
    if (job.kind !== 'image') {
      // Old stored metadata may have been request-derived. Recheck actual bytes
      // before a legacy candidate can enter a reviewed import transaction.
      candidate.media = this.#inspectCandidate(candidateBytes, candidate.mime);
    }
    if (!this.#changes) {
      throw new ProjectError(
        'ASSET_IMPORT_CHANGESET_REQUIRED',
        '当前宿主没有 ChangeSet 服务，不能导入生成候选。',
      );
    }
    if (job.importChangeSetId) {
      const existing = this.#changes.read(job.importChangeSetId);
      if (!['rejected', 'rolledBack'].includes(existing.status)) {
        return structuredClone(job);
      }
    }
    const decidedAt = new Date().toISOString();
    const reviewDecisionId = `review-decision:${randomUUID()}`;
    const outputName = this.#outputNameForCandidate(
      job.outputName,
      candidate.mime,
    );
    const project = JSON.parse(
      this.#registry.readText('project.aigame.json').source,
    ) as { id: string };
    const namespace = project.id.replace(/^local:/u, '');
    const stem = outputName
      .replace(/\.[^.]+$/u, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gu, '-');
    const proposedAssetId = `${namespace}:asset/${stem}`;
    const operations: Array<{
      command: string;
      input: Record<string, unknown>;
      description: string;
    }> = [
      {
        command: 'asset.generated.import',
        input: {
          sourcePath: candidatePath,
          expectedSha256: candidate.sha256,
          outputName,
          importSettings: structuredClone(options.importSettings ?? {}),
          provenance: {
            providerId: job.providerId,
            modelId: job.modelId,
            jobId: job.id,
            candidateId,
            reviewDecisionId,
            promptSha256: hash(job.prompt),
            parametersSha256: hash(JSON.stringify(job.parameters)),
            artDirectionSkillId: options.artDirectionSkillId ?? null,
            artDirectionSkillHash: options.artDirectionSkillHash ?? null,
            assetBriefId: options.assetBriefId ?? null,
            assetBriefHash: options.assetBriefHash ?? null,
            sourceHashes: [
              ...new Set([
                ...(options.sourceHashes ?? []),
                ...(candidate.audioMaster
                  ? [candidate.audioMaster.sourceSha256]
                  : []),
              ]),
            ],
            transformations: candidate.audioMaster
              ? [structuredClone(candidate.audioMaster)]
              : [],
            derivedContentHashes: options.derivedContentHashes ?? [
              candidate.sha256,
            ],
            source: 'provider-output',
            reviewedBy,
            reviewedAt: decidedAt,
            license: options.license ?? 'provider-output',
            restrictions: options.restrictions ?? [],
          },
        },
        description: `导入已审核候选 ${candidate.id} 并写入清单、溯源和导入设置`,
      },
      ...(options.references ?? []).map((reference) => ({
        command: 'scene.component.update',
        input: {
          ...(reference.scene ? { scene: reference.scene } : {}),
          objectId: reference.objectId,
          componentId: reference.componentId,
          data: { [reference.property]: proposedAssetId },
        },
        description: `把 ${reference.componentId}.${reference.property} 指向 ${proposedAssetId}`,
      })),
    ];
    const change = this.#changes.propose({
      summary: `导入已审核生成资源 ${outputName}`,
      operations,
    });
    for (const item of job.candidates) {
      if (item.id !== candidateId && item.reviewState === 'selected') {
        item.reviewState = 'superseded';
      }
    }
    candidate.reviewState = 'selected';
    candidate.decision = {
      id: reviewDecisionId,
      decision: 'selected',
      source: reviewedBy,
      reason: options.reason?.trim() || '候选已通过审核并提议导入',
      decidedAt,
    };
    job.selectedCandidateId = candidateId;
    job.reviewDecisionId = reviewDecisionId;
    job.importChangeSetId = change.id;
    job.importedAssetId = null;
    job.status = 'awaitingImportApproval';
    job.updatedAt = decidedAt;
    this.#save();
    this.#publishCompletionLinks(job);
    this.#audit('asset-candidate.selected', job, {
      candidateId,
      reviewDecisionId,
      importChangeSetId: change.id,
      reviewedBy,
    });
    return structuredClone(job);
  }

  recommendCandidate(
    id: string,
    candidateId: string,
    reasons: string[],
    evidenceIds: string[] = [],
  ): StudioAssetJob {
    const job = this.#job(id);
    const candidate = job.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new ProjectError('ASSET_CANDIDATE_NOT_FOUND', '资源候选不存在。');
    }
    const normalizedReasons = reasons
      .map((reason) => reason.trim())
      .filter(Boolean);
    if (normalizedReasons.length === 0) {
      throw new ProjectError(
        'ASSET_RECOMMENDATION_EVIDENCE_REQUIRED',
        '候选推荐必须包含可理解的证据。',
      );
    }
    for (const item of job.candidates) {
      item.recommendation = {
        recommended: item.id === candidateId,
        reasons:
          item.id === candidateId ? normalizedReasons : ['未被本次比较推荐'],
        evidenceIds: [...new Set(evidenceIds)],
      };
    }
    job.updatedAt = new Date().toISOString();
    this.#save();
    this.#audit('asset-candidate.recommended', job, {
      candidateId,
      evidenceIds: [...new Set(evidenceIds)],
    });
    return structuredClone(job);
  }

  rejectCandidate(
    id: string,
    candidateId: string,
    reason: string,
    reviewedBy: 'human' | 'configured-policy' = 'human',
  ): StudioAssetJob {
    const job = this.#job(id);
    const candidate = job.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new ProjectError('ASSET_CANDIDATE_NOT_FOUND', '资源候选不存在。');
    }
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new ProjectError(
        'ASSET_REJECTION_REASON_REQUIRED',
        '拒绝候选必须记录原因。',
      );
    }
    const decidedAt = new Date().toISOString();
    candidate.reviewState = 'rejected';
    candidate.decision = {
      id: `review-decision:${randomUUID()}`,
      decision: 'rejected',
      source: reviewedBy,
      reason: normalizedReason,
      decidedAt,
    };
    job.rejectedCandidateIds = [
      ...new Set([...job.rejectedCandidateIds, candidateId]),
    ];
    if (job.candidates.every((item) => item.reviewState === 'rejected')) {
      job.status = 'rejected';
    }
    job.updatedAt = decidedAt;
    this.#save();
    this.#audit('asset-candidate.rejected', job, {
      candidateId,
      decisionId: candidate.decision.id,
      reviewedBy,
    });
    return structuredClone(job);
  }

  masterCandidate(
    id: string,
    candidateId: string,
    expectedSha256: string,
    input: unknown,
  ): StudioAssetJob {
    const spec = audioMasterSpec(input);
    const job = this.#job(id);
    if (job.kind === 'image' || job.status !== 'awaitingReview')
      throw new ProjectError(
        'ASSET_AUDIO_MASTER_NOT_REVIEWABLE',
        '仅可加工待审核的音频候选。',
      );
    const parent = job.candidates.find(
      (candidate) => candidate.id === candidateId,
    );
    if (
      !parent ||
      parent.reviewState !== 'awaitingReview' ||
      parent.audioMaster
    )
      throw new ProjectError(
        'ASSET_AUDIO_MASTER_SOURCE_INVALID',
        '请使用此任务的原始、待审核音频候选；派生结果不可重复加工。',
      );
    if (parent.sha256 !== expectedSha256)
      throw new ProjectError(
        'ASSET_CANDIDATE_HASH_MISMATCH',
        '源候选哈希不一致。',
      );
    const root = realpathSync(this.#root);
    const directory = realpathSync(
      join(root, '.aigame/local/asset-candidates'),
    );
    const path = realpathSync(join(root, parent.path));
    const within = (base: string, target: string) => {
      const rel = relative(base, target).replaceAll('\\', '/');
      return (
        rel !== '' &&
        !rel.startsWith('../') &&
        rel !== '..' &&
        !rel.includes(':')
      );
    };
    if (
      !within(root, directory) ||
      !within(directory, path) ||
      !parent.path.startsWith('.aigame/local/asset-candidates/')
    )
      throw new ProjectError(
        'ASSET_AUDIO_MASTER_PATH_INVALID',
        '候选必须位于当前项目的本地候选目录。',
      );
    if (statSync(path).size > 25 * 1024 * 1024)
      throw new ProjectError('ASSET_AUDIO_SIZE_INVALID', '候选超出解码预算。');
    const bytes = readFileSync(path);
    if (hash(bytes) !== parent.sha256)
      throw new ProjectError(
        'ASSET_CANDIDATE_HASH_MISMATCH',
        '源候选内容已更改。',
      );
    this.#inspectCandidate(bytes, parent.mime);
    const engineSha256 = hash(readFileSync(this.#audioInspectorPath));
    const transformation = {
      version: 'audio-master-v1' as const,
      sourceSha256: parent.sha256,
      engineSha256,
      spec,
    };
    const identity = hash(JSON.stringify({ candidateId, ...transformation }));
    const masterId = `audio-master:${identity}`;
    const existing = job.candidates.find(
      (candidate) => candidate.audioMaster?.id === masterId,
    );
    if (existing) {
      if (hash(readFileSync(join(root, existing.path))) !== existing.sha256)
        throw new ProjectError(
          'ASSET_CANDIDATE_HASH_MISMATCH',
          '既有加工候选哈希不一致。',
        );
      return structuredClone(job);
    }
    if (job.candidates.length >= 16)
      throw new ProjectError(
        'ASSET_AUDIO_MASTER_LIMIT',
        '单个任务最多保留 16 个候选，请先审核现有版本。',
      );
    const output = masterAudioCandidate(bytes, spec, this.#audioInspectorPath);
    const outputPath = join(directory, `master-${identity}.wav`);
    if (
      existsSync(outputPath) &&
      hash(readFileSync(outputPath)) !== hash(output.bytes)
    )
      throw new ProjectError(
        'ASSET_CANDIDATE_HASH_MISMATCH',
        '加工文件冲突；不覆盖既有内容。',
      );
    if (!existsSync(outputPath))
      writeFileSync(outputPath, output.bytes, { flag: 'wx' });
    const child: AssetCandidate = {
      ...this.#candidateRecord(job, outputPath, output.bytes, 'audio/wav'),
      id: `candidate:${identity}`,
      artifactId: `artifact:${identity}`,
      parentCandidateId: parent.id,
      audioMaster: { id: masterId, ...transformation },
    };
    job.candidates.push(child);
    job.updatedAt = new Date().toISOString();
    this.#save();
    this.#publishCompletionLinks(job);
    this.#audit('asset-candidate.audio-master-created', job, {
      candidateId: child.id,
      parentCandidateId: parent.id,
      transformation: child.audioMaster,
      sha256: child.sha256,
      providerCalls: 0,
      reviewState: child.reviewState,
    });
    return structuredClone(job);
  }

  inspectCandidate(id: string, candidateId: string) {
    const { candidate } = this.previewCandidate(id, candidateId);
    return {
      candidate,
      audio: candidate.mime.startsWith('audio/')
        ? inspectAudioCandidateDetails(
            readFileSync(join(this.#root, candidate.path)),
            candidate.mime,
            this.#audioInspectorPath,
          )
        : null,
      subjectiveListening: false,
    };
  }

  previewCandidate(
    id: string,
    candidateId: string,
  ): { candidate: AssetCandidate; dataUrl: string } {
    const job = this.#job(id);
    const candidate = job.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new ProjectError('ASSET_CANDIDATE_NOT_FOUND', '资源候选不存在。');
    }
    const bytes = readFileSync(join(this.#root, candidate.path));
    if (hash(bytes) !== candidate.sha256) {
      throw new ProjectError(
        'ASSET_CANDIDATE_HASH_MISMATCH',
        '候选资源哈希不一致。',
      );
    }
    return {
      candidate: {
        ...structuredClone(candidate),
        ...(job.kind !== 'image'
          ? { media: this.#inspectCandidate(bytes, candidate.mime) }
          : {}),
      },
      dataUrl: `data:${candidate.mime};base64,${bytes.toString('base64')}`,
    };
  }

  regenerate(
    id: string,
    candidateId: string,
    instruction: string,
  ): StudioAssetJob {
    const parent = this.#job(id);
    const candidate = parent.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new ProjectError('ASSET_CANDIDATE_NOT_FOUND', '资源候选不存在。');
    }
    const normalizedInstruction = instruction.trim();
    if (!normalizedInstruction) {
      throw new ProjectError(
        'ASSET_REGENERATION_INSTRUCTION_REQUIRED',
        '再生成必须说明要修改的内容。',
      );
    }
    const nextPrompt = `${parent.prompt}\n\nRevision instruction: ${normalizedInstruction}`;
    this.#validatePrompt(
      this.#model(
        this.#provider(parent.providerId),
        parent.modelId,
        parent.kind,
      ),
      nextPrompt,
    );
    if (candidate.reviewState !== 'rejected') {
      this.rejectCandidate(
        id,
        candidateId,
        `由再生成请求取代：${normalizedInstruction}`,
      );
    }
    const next = this.submit({
      kind: parent.kind,
      providerId: parent.providerId,
      credentialRef: parent.credentialRef ?? undefined,
      modelId: parent.modelId,
      parameters: parent.parameters,
      prompt: nextPrompt,
      outputName: parent.outputName,
      variants: parent.variants,
    });
    const stored = this.#job(next.id);
    stored.regeneration = {
      id: `regeneration:${randomUUID()}`,
      parentCandidateId: candidateId,
      instruction: normalizedInstruction,
    };
    stored.updatedAt = new Date().toISOString();
    this.#save();
    this.#audit('asset-candidate.regenerated', stored, {
      parentJobId: parent.id,
      parentCandidateId: candidateId,
      regenerationId: stored.regeneration.id,
    });
    return structuredClone(stored);
  }

  retry(id: string): StudioAssetJob {
    const job = this.#job(id);
    if (job.status !== 'failed') {
      throw new ProjectError('ASSET_JOB_NOT_FAILED', '只有失败任务可以重试。');
    }
    this.#assertRetrySafe(job, false);
    job.status = 'queued';
    job.failure = null;
    job.error = null;
    job.retryPolicy.nextRetryAt = null;
    job.updatedAt = new Date().toISOString();
    this.#save();
    return this.run(id);
  }

  async retryAsync(id: string): Promise<StudioAssetJob> {
    const job = this.#job(id);
    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new ProjectError(
        'ASSET_JOB_NOT_FAILED',
        '只有失败或已取消任务可以重试。',
      );
    }
    this.#assertRetrySafe(job, true);
    const provider = this.#provider(job.providerId);
    job.status = provider.paid === true ? 'awaitingApproval' : 'queued';
    job.approval = null;
    job.retryPolicy.nextRetryAt = null;
    job.updatedAt = new Date().toISOString();
    this.#save();
    return provider.paid === true
      ? structuredClone(job)
      : this.#runAsync(id, false);
  }

  async retryWithPolicy(id: string): Promise<StudioAssetJob> {
    const job = this.#job(id);
    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new ProjectError(
        'ASSET_JOB_NOT_FAILED',
        '只有失败或已取消任务可以重试。',
      );
    }
    this.#assertRetrySafe(job, true);
    const provider = this.#provider(job.providerId);
    job.status = provider.paid === true ? 'awaitingApproval' : 'queued';
    job.approval = null;
    job.retryPolicy.nextRetryAt = null;
    job.updatedAt = new Date().toISOString();
    this.#save();
    return this.runWithPolicy(id);
  }

  async approveAndRetry(id: string): Promise<StudioAssetJob> {
    const job = this.#job(id);
    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new ProjectError(
        'ASSET_JOB_NOT_FAILED',
        '只有失败或已取消任务可以重试。',
      );
    }
    this.#assertRetrySafe(job, false);
    job.status = 'awaitingApproval';
    job.approval = null;
    job.retryPolicy.nextRetryAt = null;
    job.updatedAt = new Date().toISOString();
    this.#save();
    return this.approveAndRun(id);
  }

  reconcileAmbiguousTimeout(
    id: string,
    outcome: 'confirmed-not-run' | 'confirmed-run',
  ): StudioAssetJob {
    const job = this.#job(id);
    if (job.failure?.category !== 'timeout-ambiguous') {
      throw new ProjectError(
        'ASSET_JOB_NOT_AMBIGUOUS',
        '只有供应商执行结果不明的超时任务需要对账。',
      );
    }
    const attempt = job.attemptHistory.at(-1);
    if (!attempt || attempt.status !== 'ambiguous') {
      throw new ProjectError(
        'ASSET_JOB_ATTEMPT_NOT_AMBIGUOUS',
        '没有可对账的模糊供应商尝试。',
      );
    }
    attempt.reconciliation = outcome;
    if (outcome === 'confirmed-not-run') {
      job.failure = {
        code: 'ASSET_PROVIDER_CONFIRMED_NOT_RUN',
        category: 'transient',
        message: '供应商已确认原幂等请求未执行，可以使用同一幂等键重试。',
        retryable: true,
      };
    } else {
      job.failure = {
        code: 'ASSET_PROVIDER_CONFIRMED_RUN_RETRIEVAL_REQUIRED',
        category: 'internal',
        message:
          '供应商已确认原请求执行；在找回原结果前禁止再次调用，以避免重复计费。',
        retryable: false,
      };
    }
    job.error = `${job.failure.code}: ${job.failure.message}`;
    job.updatedAt = new Date().toISOString();
    this.#save();
    this.#audit('asset-job.timeout-reconciled', job, { outcome });
    return structuredClone(job);
  }

  #candidateRecord(
    job: StudioAssetJob,
    path: string,
    bytes: Buffer,
    mime: string,
  ): AssetCandidate {
    const candidateId = `candidate:${randomUUID()}`;
    return {
      id: candidateId,
      artifactId: `artifact:${randomUUID()}`,
      path: relative(this.#root, path).replaceAll('\\', '/'),
      sha256: hash(bytes),
      mime,
      bytes: bytes.byteLength,
      media: this.#inspectCandidate(bytes, mime),
      reviewState: 'awaitingReview',
      recommendation: null,
      decision: null,
      parentCandidateId: job.regeneration?.parentCandidateId ?? null,
    };
  }

  #assertRetrySafe(job: StudioAssetJob, enforceBackoff: boolean): void {
    if (job.failure?.category === 'timeout-ambiguous') {
      throw new ProjectError(
        'ASSET_JOB_RECONCILIATION_REQUIRED',
        '供应商超时结果不明确；必须先查询原 providerOperationId，不能重复付费调用。',
      );
    }
    if (job.failure && !job.failure.retryable) {
      throw new ProjectError(
        'ASSET_JOB_NOT_RETRYABLE',
        `任务失败不可重试：${job.failure.code}`,
      );
    }
    if (job.attempts >= job.retryPolicy.maxAttempts) {
      throw new ProjectError(
        'ASSET_JOB_RETRY_LIMIT_REACHED',
        `任务已达到 ${job.retryPolicy.maxAttempts} 次尝试上限。`,
      );
    }
    if (
      enforceBackoff &&
      job.retryPolicy.nextRetryAt &&
      Date.parse(job.retryPolicy.nextRetryAt) > Date.now()
    ) {
      throw new ProjectError(
        'ASSET_JOB_BACKOFF_ACTIVE',
        `任务退避中，最早可在 ${job.retryPolicy.nextRetryAt} 重试。`,
        { nextRetryAt: job.retryPolicy.nextRetryAt },
      );
    }
  }

  #beginAttempt(job: StudioAssetJob): void {
    job.attemptHistory.push({
      id: `asset-attempt:${randomUUID()}`,
      number: job.attempts,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      reconciliation: 'not-required',
    });
    this.#audit('asset-job.attempt-started', job, {
      attemptId: job.attemptHistory.at(-1)?.id,
      attemptNumber: job.attempts,
    });
  }

  #finishAttempt(
    job: StudioAssetJob,
    status: AssetJobAttempt['status'],
    reconciliation: AssetJobAttempt['reconciliation'],
  ): void {
    const attempt = job.attemptHistory.at(-1);
    if (!attempt || attempt.status !== 'running') return;
    attempt.status = status;
    attempt.finishedAt = new Date().toISOString();
    attempt.reconciliation = reconciliation;
    if (status === 'succeeded') job.retryPolicy.nextRetryAt = null;
    this.#audit('asset-job.attempt-finished', job, {
      attemptId: attempt.id,
      attemptNumber: attempt.number,
      status,
      reconciliation,
    });
  }

  #migrateCandidateMedia(
    job: StudioAssetJob,
    bytes: Buffer,
    mime: string,
  ): AssetCandidateMedia {
    try {
      return this.#inspectCandidate(bytes, mime);
    } catch (error) {
      if (!mime.startsWith('audio/')) throw error;
      // One damaged legacy job must not prevent opening all project history.
      // Zero here explicitly denotes unknown, never usable media metadata.
      job.status = 'failed';
      job.failure = {
        code: 'ASSET_AUDIO_LEGACY_UNVERIFIED',
        category: 'internal',
        retryable: false,
        message:
          '历史音频候选无法验证；原始文件和记录已保留，不可导入，请检查或重新生成。',
      };
      job.error = `${job.failure.code}: ${job.failure.message}`;
      return {
        kind: 'audio',
        codec: 'unverified',
        durationMs: 0,
        sampleRateHz: 0,
        channels: 0,
      };
    }
  }

  #inspectCandidate(bytes: Buffer, mime: string): AssetCandidateMedia {
    if (mime.startsWith('image/')) {
      if (mime === 'image/svg+xml') {
        const source = bytes.toString('utf8', 0, Math.min(bytes.length, 8192));
        const width = Number(source.match(/\bwidth=["'](\d+)/iu)?.[1] ?? 0);
        const height = Number(source.match(/\bheight=["'](\d+)/iu)?.[1] ?? 0);
        return {
          kind: 'image',
          width: Math.max(1, width || 1),
          height: Math.max(1, height || 1),
          format: 'svg',
          hasAlpha: true,
        };
      }
      if (
        mime === 'image/png' &&
        bytes.length >= 26 &&
        bytes.subarray(1, 4).toString('ascii') === 'PNG'
      ) {
        const colorType = bytes[25] ?? 0;
        return {
          kind: 'image',
          width: Math.max(1, bytes.readUInt32BE(16)),
          height: Math.max(1, bytes.readUInt32BE(20)),
          format: 'png',
          hasAlpha: colorType === 4 || colorType === 6,
        };
      }
      if (mime === 'image/jpeg') {
        let offset = 2;
        while (offset + 9 < bytes.length) {
          if (bytes[offset] !== 0xff) break;
          const marker = bytes[offset + 1] ?? 0;
          const length = bytes.readUInt16BE(offset + 2);
          if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < bytes.length) {
            return {
              kind: 'image',
              width: Math.max(1, bytes.readUInt16BE(offset + 7)),
              height: Math.max(1, bytes.readUInt16BE(offset + 5)),
              format: 'jpeg',
              hasAlpha: false,
            };
          }
          if (length < 2) break;
          offset += 2 + length;
        }
      }
      if (mime === 'image/webp' && bytes.length >= 30) {
        const chunk = bytes.subarray(12, 16).toString('ascii');
        if (chunk === 'VP8X') {
          const width = 1 + bytes.readUIntLE(24, 3);
          const height = 1 + bytes.readUIntLE(27, 3);
          return {
            kind: 'image',
            width,
            height,
            format: 'webp',
            hasAlpha: Boolean((bytes[20] ?? 0) & 0x10),
          };
        }
      }
      return {
        kind: 'image',
        width: 1,
        height: 1,
        format: mime.slice('image/'.length) || 'unknown',
        hasAlpha: mime !== 'image/jpeg',
      };
    }
    return inspectAudioCandidate(bytes, mime, this.#audioInspectorPath);
  }

  #outputNameForCandidate(outputName: string, mime: string): string {
    const stem = outputName.replace(/\.[^.]+$/u, '');
    const extension =
      mime === 'image/svg+xml'
        ? '.svg'
        : mime === 'image/jpeg'
          ? '.jpg'
          : mime === 'image/webp'
            ? '.webp'
            : mime === 'image/png'
              ? '.png'
              : mime.includes('mpeg') || mime.includes('mp3')
                ? '.mp3'
                : '.wav';
    return `${stem}${extension}`;
  }

  #reconcileImports(): void {
    if (!this.#changes) return;
    let changed = false;
    for (const job of this.#store.jobs) {
      // A reviewed candidate can be re-proposed by MCP after its original
      // proposal went stale. Reconnect only an actually applied, separately
      // approved import with the same selection and bytes; never infer success
      // merely from a manifest entry or an agent-supplied path.
      if (
        job.status === 'awaitingReview' &&
        job.selectedCandidateId &&
        job.reviewDecisionId
      ) {
        const selected = job.candidates.find(
          (candidate) =>
            candidate.id === job.selectedCandidateId &&
            candidate.reviewState === 'selected' &&
            candidate.decision?.id === job.reviewDecisionId,
        );
        const manifest = JSON.parse(
          this.#registry.readText('assets/asset-manifest.json').source,
        ) as {
          assets?: Array<{
            path?: string;
            sha256?: string;
            source?: {
              jobId?: string;
              candidateId?: string;
              reviewDecisionId?: string;
            };
          }>;
        };
        const imported =
          selected &&
          manifest.assets?.find(
            (asset) =>
              asset.sha256 === selected.sha256 &&
              asset.source?.jobId === job.id &&
              asset.source.candidateId === selected.id &&
              asset.source.reviewDecisionId === job.reviewDecisionId,
          );
        if (imported?.path && selected) {
          const replacement = this.#changes.list().find(
            (change) =>
              ['applied', 'tested'].includes(change.status) &&
              change.approval &&
              change.files.some(
                (file) =>
                  file.path === imported.path &&
                  file.afterHash === selected.sha256,
              ) &&
              change.operations.some((operation) => {
                const provenance = operation.input.provenance as
                  | Record<string, unknown>
                  | undefined;
                return (
                  operation.command === 'asset.generated.import' &&
                  change.selectedOperationIds.includes(operation.id) &&
                  operation.input.expectedSha256 === selected.sha256 &&
                  provenance?.jobId === job.id &&
                  provenance.candidateId === selected.id &&
                  provenance.reviewDecisionId === job.reviewDecisionId
                );
              }),
          );
          if (replacement) {
            job.importChangeSetId = replacement.id;
            job.status = 'awaitingImportApproval';
            changed = true;
            this.#publishCompletionLinks(job);
            this.#audit('asset-import.relinked', job, {
              importChangeSetId: replacement.id,
              reviewDecisionId: job.reviewDecisionId,
            });
          }
        }
      }
      if (
        !['awaitingImportApproval', 'imported'].includes(job.status) ||
        !job.importChangeSetId
      ) {
        continue;
      }
      let change;
      try {
        change = this.#changes.read(job.importChangeSetId);
      } catch {
        job.status = 'failed';
        job.failure = {
          code: 'ASSET_IMPORT_CHANGESET_MISSING',
          category: 'internal',
          message: '候选导入 ChangeSet 已丢失，不能推断项目已导入。',
          retryable: false,
        };
        job.error = `${job.failure.code}: ${job.failure.message}`;
        changed = true;
        continue;
      }
      if (['rejected', 'rolledBack'].includes(change.status)) {
        job.status = 'awaitingReview';
        job.importedAssetId = null;
        job.updatedAt = new Date().toISOString();
        changed = true;
        continue;
      }
      if (!['applied', 'tested'].includes(change.status)) continue;
      const manifest = JSON.parse(
        this.#registry.readText('assets/asset-manifest.json').source,
      ) as { assets?: Array<Record<string, unknown>> };
      const imported = (manifest.assets ?? []).find((asset) => {
        const source = asset.source;
        return (
          source &&
          typeof source === 'object' &&
          !Array.isArray(source) &&
          (source as Record<string, unknown>).jobId === job.id &&
          (source as Record<string, unknown>).candidateId ===
            job.selectedCandidateId
        );
      });
      const importedPath =
        imported && typeof imported.path === 'string' ? imported.path : null;
      const selected = job.candidates.find(
        (candidate) => candidate.id === job.selectedCandidateId,
      );
      if (
        !imported ||
        typeof imported.id !== 'string' ||
        !importedPath ||
        !selected ||
        !existsSync(join(this.#root, importedPath)) ||
        hash(readFileSync(join(this.#root, importedPath))) !== selected.sha256
      ) {
        job.status = 'failed';
        job.failure = {
          code: 'ASSET_IMPORT_VERIFICATION_FAILED',
          category: 'internal',
          message: 'ChangeSet 已应用，但资源清单或导入文件哈希不一致。',
          retryable: false,
        };
        job.error = `${job.failure.code}: ${job.failure.message}`;
      } else {
        if (
          job.status === 'imported' &&
          job.importedAssetId === imported.id &&
          job.failure === null &&
          job.error === null
        ) {
          continue;
        }
        job.status = 'imported';
        job.importedAssetId = imported.id;
        job.failure = null;
        job.error = null;
      }
      job.updatedAt = new Date().toISOString();
      changed = true;
    }
    if (changed) this.#save();
  }

  #httpFailure(
    providerId: string,
    status: number,
    retryAfterSeconds: number,
  ): AssetJobFailure {
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.max(0, retryAfterSeconds * 1000)
      : undefined;
    const common = {
      message: `${providerId} request failed with HTTP ${status}`,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
    if (status === 401 || status === 403) {
      return {
        code: 'ASSET_PROVIDER_CREDENTIAL_REJECTED',
        category: 'missing-credential',
        retryable: false,
        ...common,
      };
    }
    if (status === 402) {
      return {
        code: 'ASSET_PROVIDER_QUOTA_EXHAUSTED',
        category: 'quota',
        retryable: false,
        ...common,
      };
    }
    if (status === 451) {
      return {
        code: 'ASSET_PROVIDER_SAFETY_REFUSAL',
        category: 'safety-refusal',
        retryable: false,
        ...common,
      };
    }
    if (status === 429) {
      return {
        code: 'ASSET_PROVIDER_RATE_LIMITED',
        category: 'rate-limit',
        retryable: true,
        ...common,
      };
    }
    if (status === 408 || status === 504) {
      return {
        code: 'ASSET_PROVIDER_TIMEOUT_AMBIGUOUS',
        category: 'timeout-ambiguous',
        retryable: false,
        ...common,
      };
    }
    if (status === 400 || status === 422) {
      return {
        code: 'ASSET_PROVIDER_PARAMETER_REJECTED',
        category: 'invalid-parameter',
        retryable: false,
        ...common,
      };
    }
    return {
      code: 'ASSET_PROVIDER_TRANSIENT',
      category: status >= 500 ? 'transient' : 'internal',
      retryable: status >= 500,
      ...common,
    };
  }

  #classifyFailure(message: string): AssetJobFailure {
    const code = message.split(':', 1)[0] || 'ASSET_PROVIDER_REQUEST_FAILED';
    const upper = message.toUpperCase();
    const category: AssetFailureCategory = upper.includes('CREDENTIAL')
      ? 'missing-credential'
      : upper.includes('UNAVAILABLE')
        ? 'provider-unhealthy'
        : upper.includes('MODEL') || upper.includes('KIND_UNSUPPORTED')
          ? 'unsupported-model'
          : upper.includes('PARAMETER') ||
              upper.includes('MIME') ||
              upper.includes('PROMPT')
            ? 'invalid-parameter'
            : upper.includes('RATE')
              ? 'rate-limit'
              : upper.includes('TIMEOUT')
                ? 'timeout-ambiguous'
                : upper.includes('CANCEL')
                  ? 'cancelled'
                  : upper.includes('TRANSIENT') ||
                      upper.includes('REQUEST_FAILED')
                    ? 'transient'
                    : 'internal';
    return {
      code,
      category,
      message: this.#redact(message),
      retryable: ['transient', 'rate-limit', 'cancelled'].includes(category),
    };
  }

  #provider(id: string): ProviderDefinition {
    const provider = this.#providerDocument().providers.find(
      (item) => item.id === id,
    );
    if (!provider)
      throw new ProjectError(
        'ASSET_PROVIDER_NOT_FOUND',
        `资源 Provider 不存在：${id}`,
      );
    return provider;
  }

  #resolveRoute(
    kind: AssetJobKind,
    requestedProviderId?: string,
    requestedModelId?: string,
    requestedCredentialRef?: string,
  ): {
    provider: ProviderDefinition;
    modelId?: string;
    credentialRef?: string;
    routeSource: 'project' | 'studio-default' | 'request-override';
  } {
    if (requestedProviderId) {
      return {
        provider: this.#provider(requestedProviderId),
        modelId: requestedModelId,
        credentialRef: requestedCredentialRef,
        routeSource: 'request-override',
      };
    }
    const routingPath = join(this.#root, '.ai', 'tool-routing.json');
    let route: unknown;
    if (existsSync(routingPath)) {
      const document = JSON.parse(readFileSync(routingPath, 'utf8')) as {
        routes?: Record<string, unknown>;
      };
      route =
        document.routes?.[kind] ??
        (kind === 'speechGeneration' ? document.routes?.audio : undefined) ??
        document.routes?.[`${kind}.generate`] ??
        document.routes?.[`asset.generate.${kind}`];
    }
    if (typeof route === 'string') {
      return {
        provider: this.#provider(route),
        modelId: requestedModelId,
        routeSource: 'project',
      };
    }
    if (route && typeof route === 'object' && !Array.isArray(route)) {
      const value = route as Record<string, unknown>;
      if (typeof value.providerId === 'string') {
        return {
          provider: this.#provider(value.providerId),
          modelId:
            requestedModelId ??
            (typeof value.modelId === 'string' ? value.modelId : undefined),
          credentialRef:
            requestedCredentialRef ??
            (typeof value.credentialRef === 'string'
              ? value.credentialRef
              : undefined),
          routeSource: 'project',
        };
      }
    }
    const fallback = this.#providerDocument().providers.find(
      (provider) =>
        provider.enabled !== false &&
        modelsFor(provider).some(
          (model) => model.enabled !== false && model.kind === kind,
        ),
    );
    if (!fallback) {
      throw new ProjectError(
        'ASSET_ROUTE_NOT_FOUND',
        `项目没有为 ${kind} 配置可用的生成路由。`,
      );
    }
    return {
      provider: fallback,
      modelId: requestedModelId,
      routeSource: 'studio-default',
    };
  }

  #approvalPolicy(): AssetGenerationApprovalPolicy {
    const configured = this.#getApprovalPolicy?.();
    const mode = ['always', 'budget', 'auto'].includes(String(configured?.mode))
      ? configured!.mode
      : 'always';
    const limit = Number(configured?.autoApproveMaxCny ?? 0);
    return {
      mode,
      autoApproveMaxCny: Number.isFinite(limit) ? Math.max(0, limit) : 0,
      ...(configured?.authorizationId
        ? { authorizationId: configured.authorizationId }
        : {}),
      ...(configured?.completionRunId
        ? { completionRunId: configured.completionRunId }
        : {}),
    };
  }

  #model(
    provider: ProviderDefinition,
    requested?: string,
    kind?: AssetJobKind,
  ): AssetModelDefinition {
    const models = modelsFor(provider).filter(
      (model) => model.enabled !== false && (!kind || model.kind === kind),
    );
    const fallbackId =
      (kind ? provider.defaultModelByKind?.[kind] : undefined) ??
      provider.model;
    const model =
      models.find((item) => item.id === requested) ??
      models.find((item) => item.id === fallbackId) ??
      models[0];
    if (requested && !models.some((item) => item.id === requested) && kind) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(requested)) {
        throw new ProjectError(
          'ASSET_PROVIDER_MODEL_INVALID',
          `模型 ID 格式无效：${requested}`,
        );
      }
      const dynamic = this.#dynamicModel(provider, requested, kind);
      if (dynamic) return dynamic;
    }
    if (!model) {
      throw new ProjectError(
        'ASSET_PROVIDER_MODEL_NOT_FOUND',
        `Provider ${provider.id} 没有可用于 ${kind ?? '该任务'} 的模型。`,
      );
    }
    if (requested && model.id !== requested) {
      throw new ProjectError(
        'ASSET_PROVIDER_MODEL_NOT_FOUND',
        `Provider ${provider.id} 不包含模型 ${requested}。`,
      );
    }
    return model;
  }

  #dynamicModel(
    provider: ProviderDefinition,
    requested: string,
    kind: AssetJobKind,
  ): AssetModelDefinition | null {
    const kindName = providerKind(provider);
    const fallback = modelsFor(provider).find((model) => model.kind === kind);
    if (kindName === 'openai' && kind === 'image') {
      return {
        id: requested,
        label: requested,
        kind,
        adapter: 'openai-image',
        maxVariants: fallback?.maxVariants ?? 4,
        defaults: structuredClone(fallback?.defaults ?? {}),
      };
    }
    if (kindName === 'aliyun-bailian') {
      if (kind !== 'image' && kind !== 'speechGeneration') return null;
      return {
        id: requested,
        label: requested,
        kind,
        adapter:
          kind === 'speechGeneration'
            ? 'aliyun-bailian-tts'
            : 'aliyun-bailian-image',
        maxVariants:
          fallback?.maxVariants ?? (kind === 'speechGeneration' ? 1 : 4),
        defaults: structuredClone(fallback?.defaults ?? {}),
      };
    }
    if (kindName === 'elevenlabs') {
      if (kind !== 'soundEffect' && kind !== 'music') return null;
      return {
        id: requested,
        label: requested,
        kind,
        adapter:
          kind === 'soundEffect'
            ? 'elevenlabs-sound-effect'
            : 'elevenlabs-music',
        maxVariants: 1,
        defaults: structuredClone(fallback?.defaults ?? {}),
      };
    }
    return null;
  }

  #connection(
    providerId: string,
    credentialRef?: string,
  ): AssetProviderConnection {
    const configured = this.#getProviderConnection?.(providerId, credentialRef);
    if (configured) return configured;
    return {
      credentialRef: this.#getCredentialRef?.(providerId) ?? null,
      region: 'cn-beijing',
      workspaceId: null,
      apiHost: null,
    };
  }

  #endpoint(
    provider: ProviderDefinition,
    model: AssetModelDefinition,
    connection: AssetProviderConnection,
    parameters: Record<string, string | number | boolean>,
  ): string {
    if (provider.endpoint) return provider.endpoint;
    if (model.adapter === 'openai-image') {
      const baseUrl = (
        connection.apiHost || 'https://api.openai.com/v1'
      ).replace(/\/+$/u, '');
      return `${baseUrl}/images/generations`;
    }
    if (model.adapter === 'elevenlabs-sound-effect') {
      const baseUrl = (
        connection.apiHost || 'https://api.elevenlabs.io/v1'
      ).replace(/\/+$/u, '');
      const endpoint = new URL(`${baseUrl}/sound-generation`);
      endpoint.searchParams.set(
        'output_format',
        String(parameters.outputFormat ?? 'mp3_44100_128'),
      );
      return endpoint.href;
    }
    if (model.adapter === 'elevenlabs-music') {
      const baseUrl = (
        connection.apiHost || 'https://api.elevenlabs.io/v1'
      ).replace(/\/+$/u, '');
      const endpoint = new URL(`${baseUrl}/music`);
      endpoint.searchParams.set(
        'output_format',
        String(parameters.outputFormat ?? 'mp3_48000_192'),
      );
      return endpoint.href;
    }
    if (model.adapter === 'aliyun-bailian-tts') {
      if (
        connection.region !== 'cn-beijing' ||
        !connection.workspaceId ||
        !workspaceIdPattern.test(connection.workspaceId)
      ) {
        throw new ProjectError(
          'ASSET_PROVIDER_WORKSPACE_REQUIRED',
          '百炼非实时语音需要有效的北京地域 Workspace ID。',
        );
      }
      return `https://${connection.workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`;
    }
    if (connection.apiHost) {
      const host = connection.apiHost
        .replace(/\/+$/u, '')
        .replace(/\/api\/v1$/u, '');
      return `${host}/api/v1/services/aigc/multimodal-generation/generation`;
    }
    if (connection.workspaceId) {
      if (!workspaceIdPattern.test(connection.workspaceId)) {
        throw new ProjectError(
          'ASSET_PROVIDER_WORKSPACE_INVALID',
          '百炼 Workspace ID 格式无效。',
        );
      }
      return `https://${connection.workspaceId}.${connection.region}.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`;
    }
    return 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  }

  #promptLimit(model: AssetModelDefinition): number {
    return model.adapter === 'elevenlabs-sound-effect' ? 450 : 4000;
  }

  #validatePrompt(model: AssetModelDefinition, prompt: string): void {
    if (!prompt.trim() || prompt.length > 4000) {
      throw new ProjectError(
        'ASSET_JOB_PROMPT_INVALID',
        '资源提示词必须为 1–4000 字符。',
      );
    }
    const length = Array.from(prompt.trim()).length;
    const limit = this.#promptLimit(model);
    if (length > limit) {
      throw new ProjectError(
        'ASSET_JOB_PROMPT_TOO_LONG',
        `${model.id} 提示词最多 ${limit} 个字符；当前 ${length}。请精简后重新提交，系统不会自动截断或调用供应商。`,
      );
    }
  }

  #validateParameters(
    model: AssetModelDefinition,
    parameters: Record<string, string | number | boolean>,
  ): void {
    const allowedByAdapter: Record<AssetModelDefinition['adapter'], string[]> =
      {
        'local-placeholder': [],
        'openai-image': ['size', 'quality', 'format', 'background'],
        'aliyun-bailian-image': ['size', 'watermark', 'promptExtend'],
        'aliyun-bailian-tts': ['voice', 'format', 'sampleRate'],
        'aliyun-bailian-music': ['musicLengthMs', 'outputFormat'],
        'elevenlabs-sound-effect': [
          'durationSeconds',
          'loop',
          'promptInfluence',
          'outputFormat',
        ],
        'elevenlabs-music': ['musicLengthMs', 'outputFormat'],
      };
    const allowed = new Set(allowedByAdapter[model.adapter]);
    const unknown = Object.keys(parameters).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      throw new ProjectError(
        'ASSET_JOB_PARAMETER_UNKNOWN',
        `模型 ${model.id} 不支持参数：${unknown.join('、')}。`,
      );
    }
    const numberInRange = (key: string, minimum: number, maximum: number) => {
      const value = parameters[key];
      if (
        value !== undefined &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < minimum ||
          value > maximum)
      ) {
        throw new ProjectError(
          'ASSET_JOB_PARAMETER_INVALID',
          `${model.id}.${key} 必须是 ${minimum}–${maximum} 的数字。`,
        );
      }
    };
    const stringFrom = (key: string, values: string[]) => {
      const value = parameters[key];
      if (value !== undefined && !values.includes(String(value))) {
        throw new ProjectError(
          'ASSET_JOB_PARAMETER_INVALID',
          `${model.id}.${key} 必须是 ${values.join('、')} 之一。`,
        );
      }
    };
    if (model.adapter === 'openai-image') {
      stringFrom('size', ['1024x1024', '1536x1024', '1024x1536', 'auto']);
      stringFrom('quality', ['low', 'medium', 'high', 'auto']);
      stringFrom('format', ['png', 'jpeg', 'webp']);
      stringFrom('background', ['transparent', 'opaque', 'auto']);
    }
    if (model.adapter === 'aliyun-bailian-image') {
      const size = parameters.size;
      if (size !== undefined && !/^\d{2,5}\*\d{2,5}$/u.test(String(size))) {
        throw new ProjectError(
          'ASSET_JOB_PARAMETER_INVALID',
          `${model.id}.size 必须是 1280*1280 形式。`,
        );
      }
      for (const key of ['watermark', 'promptExtend']) {
        if (
          parameters[key] !== undefined &&
          typeof parameters[key] !== 'boolean'
        ) {
          throw new ProjectError(
            'ASSET_JOB_PARAMETER_INVALID',
            `${model.id}.${key} 必须是布尔值。`,
          );
        }
      }
    }
    if (model.adapter === 'aliyun-bailian-tts') {
      if (!String(parameters.voice ?? '').trim()) {
        throw new ProjectError(
          'ASSET_JOB_PARAMETER_INVALID',
          `${model.id}.voice 不能为空。`,
        );
      }
      stringFrom('format', ['wav']);
      numberInRange('sampleRate', 8_000, 48_000);
    }
    if (model.adapter === 'elevenlabs-sound-effect') {
      numberInRange('durationSeconds', 0.5, 22);
      numberInRange('promptInfluence', 0, 1);
      if (
        parameters.loop !== undefined &&
        typeof parameters.loop !== 'boolean'
      ) {
        throw new ProjectError(
          'ASSET_JOB_PARAMETER_INVALID',
          `${model.id}.loop 必须是布尔值。`,
        );
      }
      if (!/^mp3_\d{4,6}_\d{2,3}$/u.test(String(parameters.outputFormat))) {
        throw new ProjectError(
          'ASSET_JOB_PARAMETER_INVALID',
          `${model.id}.outputFormat 当前要求 MP3；裸 PCM/μ-law/A-law 未提供封装转换，不能冒充 WAV。`,
        );
      }
    }
    if (
      model.adapter === 'elevenlabs-music' ||
      model.adapter === 'aliyun-bailian-music'
    ) {
      numberInRange('musicLengthMs', 3_000, 600_000);
      if (!String(parameters.outputFormat ?? '').trim()) {
        throw new ProjectError(
          'ASSET_JOB_PARAMETER_INVALID',
          `${model.id}.outputFormat 不能为空。`,
        );
      }
      if (
        model.adapter === 'elevenlabs-music' &&
        !/^mp3_\d{4,6}_\d{2,3}$/u.test(String(parameters.outputFormat))
      ) {
        throw new ProjectError(
          'ASSET_JOB_PARAMETER_INVALID',
          `${model.id}.outputFormat 当前只支持有容器的 MP3 输出。`,
        );
      }
    }
  }

  #providerDocument(): { providers: ProviderDefinition[] } {
    const path = join(this.#root, '.ai', 'providers.json');
    const document = JSON.parse(readFileSync(path, 'utf8')) as {
      providers?: ProviderDefinition[];
    };
    return { providers: document.providers ?? [] };
  }

  #migrateProviderDocument(): void {
    const path = join(this.#root, '.ai', 'providers.json');
    if (!existsSync(path)) return;
    const document = JSON.parse(readFileSync(path, 'utf8')) as {
      schemaVersion?: string;
      providers?: ProviderDefinition[];
    };
    const providers: ProviderDefinition[] = (document.providers ?? []).map(
      (provider): ProviderDefinition => {
        if (provider.id === 'aliyun-bailian') {
          return {
            ...provider,
            id: provider.id,
            kind: 'aliyun-bailian',
            paid: true,
            enabled: provider.enabled !== false,
            defaultModelByKind: {
              image:
                provider.defaultModelByKind?.image ??
                provider.model ??
                'wan2.6-t2i',
              speechGeneration:
                provider.defaultModelByKind?.speechGeneration ??
                provider.defaultModelByKind?.audio ??
                'qwen-audio-3.0-tts-flash',
            },
            models: modelsFor(provider),
          } satisfies ProviderDefinition;
        }
        if (
          provider.kind === 'local-placeholder' ||
          provider.kind === 'test-fixture'
        ) {
          return {
            ...provider,
            models: structuredClone(localModels),
            defaultModelByKind: {
              image: 'deterministic-image',
              soundEffect: 'deterministic-sound-effect',
              music: 'deterministic-music',
              speechGeneration: 'deterministic-speech',
              ...provider.defaultModelByKind,
              audio: undefined,
            },
          } satisfies ProviderDefinition;
        }
        return {
          ...provider,
          models: modelsFor(provider),
        } satisfies ProviderDefinition;
      },
    );
    for (const providerId of [
      'openai',
      'aliyun-bailian',
      'elevenlabs',
    ] as const) {
      if (!providers.some((provider) => provider.id === providerId)) {
        providers.push(builtInExternalProvider(providerId));
      }
    }
    const migrated = { schemaVersion: '2.0.0', providers };
    if (JSON.stringify(migrated) !== JSON.stringify(document)) {
      atomicJson(path, migrated);
    }
  }

  #trustedEndpoint(value: string | undefined): string {
    const url = new URL(
      value ??
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    );
    const loopback =
      url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    const openAi =
      url.hostname === 'api.openai.com' &&
      url.pathname === '/v1/images/generations';
    const elevenLabs =
      url.hostname === 'api.elevenlabs.io' &&
      (url.pathname === '/v1/sound-generation' || url.pathname === '/v1/music');
    if (
      (!loopback && url.protocol !== 'https:') ||
      (!loopback &&
        !openAi &&
        !elevenLabs &&
        url.hostname !== 'dashscope.aliyuncs.com' &&
        !/^[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1|us-east-1)\.maas\.aliyuncs\.com$/u.test(
          url.hostname,
        ))
    ) {
      throw new ProjectError(
        'ASSET_PROVIDER_ENDPOINT_REJECTED',
        'Provider endpoint must use HTTPS on an approved OpenAI or Alibaba Cloud host.',
      );
    }
    return url.href;
  }

  #trustedCandidateUrl(value: string): string {
    const url = new URL(value);
    const loopback =
      url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (
      (!loopback && url.protocol !== 'https:') ||
      (!loopback && !url.hostname.endsWith('.aliyuncs.com'))
    ) {
      throw new ProjectError(
        'ASSET_PROVIDER_CANDIDATE_URL_REJECTED',
        'Provider candidate URL is outside the trusted Alibaba Cloud image host boundary.',
      );
    }
    return url.href;
  }

  #candidateUrls(value: unknown): string[] {
    const found: string[] = [];
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const [key, child] of Object.entries(node)) {
        if ((key === 'image' || key === 'url') && typeof child === 'string') {
          found.push(child);
        } else {
          visit(child);
        }
      }
    };
    visit(value);
    return [...new Set(found)];
  }

  #base64Candidates(value: unknown): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const data = (value as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    return data
      .map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? (item as { b64_json?: unknown }).b64_json
          : undefined,
      )
      .filter(
        (item): item is string => typeof item === 'string' && item !== '',
      );
  }

  #redact(message: string, exactSecrets: readonly string[] = []): string {
    const exactRedacted = exactSecrets.reduce(
      (value, secret) =>
        secret.length >= 4 ? value.replaceAll(secret, '[REDACTED]') : value,
      message,
    );
    return exactRedacted
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/giu, 'Bearer [REDACTED]')
      .replace(
        /(?:api[_-]?key|secret|token)\s*[:=]\s*[^\s,;]+/giu,
        '$1=[REDACTED]',
      );
  }

  #job(id: string): StudioAssetJob {
    const job = this.#store.jobs.find((item) => item.id === id);
    if (!job)
      throw new ProjectError('ASSET_JOB_NOT_FOUND', `资源任务不存在：${id}`);
    return job;
  }

  #fail(job: StudioAssetJob, message: string): StudioAssetJob {
    return this.#failDetailed(job, this.#classifyFailure(message));
  }

  #failDetailed(job: StudioAssetJob, failure: AssetJobFailure): StudioAssetJob {
    const safeFailure: AssetJobFailure = {
      ...failure,
      message: this.#redact(failure.message),
    };
    job.status = 'failed';
    job.failure = structuredClone(safeFailure);
    job.error = `${safeFailure.code}: ${safeFailure.message}`;
    job.progress = {
      stage: 'finalizing',
      fraction: null,
      message: safeFailure.retryable
        ? '任务失败，可以按诊断重试'
        : '任务失败，需要修正配置或请求',
    };
    job.updatedAt = new Date().toISOString();
    if (safeFailure.retryable && safeFailure.category !== 'timeout-ambiguous') {
      const exponential = Math.min(
        job.retryPolicy.backoffCapMs,
        job.retryPolicy.backoffBaseMs * 2 ** Math.max(0, job.attempts - 1),
      );
      const delay = Math.max(exponential, failure.retryAfterMs ?? 0);
      job.retryPolicy.nextRetryAt = new Date(Date.now() + delay).toISOString();
    } else {
      job.retryPolicy.nextRetryAt = null;
    }
    this.#finishAttempt(
      job,
      safeFailure.category === 'timeout-ambiguous' ? 'ambiguous' : 'failed',
      safeFailure.category === 'timeout-ambiguous' ? 'pending' : 'not-required',
    );
    this.#save();
    return structuredClone(job);
  }

  #save(): void {
    atomicJson(this.#storePath, this.#store);
  }

  #publishCompletionLinks(job: StudioAssetJob): void {
    if (!job.completionRunId || !this.#onExternalLink) return;
    try {
      this.#onExternalLink(job.completionRunId, 'toolCalls', job.toolCallId);
      this.#onExternalLink(job.completionRunId, 'assetJobs', job.id);
      if (job.reviewDecisionId) {
        this.#onExternalLink(
          job.completionRunId,
          'reviewDecisions',
          job.reviewDecisionId,
        );
      }
      if (job.importChangeSetId) {
        this.#onExternalLink(
          job.completionRunId,
          'changeSets',
          job.importChangeSetId,
        );
      }
    } catch (error) {
      this.#audit('asset-job.completion-link-deferred', job, {
        code:
          error instanceof ProjectError
            ? error.code
            : 'COMPLETION_RUN_LINK_FAILED',
      });
    }
  }

  #audit(
    event: string,
    job: StudioAssetJob,
    details: Record<string, unknown>,
  ): void {
    appendFileSync(
      this.#auditPath,
      `${JSON.stringify({
        schemaVersion: '1.0.0',
        event,
        jobId: job.id,
        idempotencyKey: job.idempotencyKey,
        providerId: job.providerId,
        modelId: job.modelId,
        status: job.status,
        at: new Date().toISOString(),
        details,
      })}\n`,
      'utf8',
    );
  }
}
