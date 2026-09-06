import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectError } from '../studio/project/project-types.ts';
import { ProviderModelCatalogService } from '../studio/settings/provider-model-catalog-service.ts';
import {
  StudioAssetJobBroker,
  type AssetGenerationApprovalPolicy,
} from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p29-media-'));
const projectRoot = join(temporary, 'project');
const secret = 'P29_SECRET_MUST_NEVER_LEAK';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const mp3 = Buffer.from(
  readFileSync(
    join(repository, 'crates/player/tests/fixtures/tone.mp3.hex'),
    'utf8',
  ).replace(/\s/gu, ''),
  'hex',
);

function allText(path: string): string {
  let value = '';
  const textExtensions = new Set([
    '.json',
    '.jsonl',
    '.log',
    '.md',
    '.txt',
    '.ts',
    '.tsx',
    '.js',
    '.mjs',
    '.yaml',
    '.yml',
  ]);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) value += allText(child);
    else if (
      entry.isFile() &&
      textExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))
    ) {
      value += readFileSync(child, 'utf8');
    }
  }
  return value;
}

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  writeFileSync(
    join(projectRoot, '.ai', 'tool-routing.json'),
    `${JSON.stringify(
      {
        schemaVersion: '2.0.0',
        routes: {
          image: { providerId: 'openai', modelId: 'gpt-image-2' },
          soundEffect: {
            providerId: 'elevenlabs',
            modelId: 'eleven_text_to_sound_v2',
          },
          music: { providerId: 'elevenlabs', modelId: 'music_v2' },
          speechGeneration: {
            providerId: 'aliyun-bailian',
            modelId: 'qwen-audio-3.0-tts-flash',
          },
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  const registry = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
  });
  let approvalPolicy: AssetGenerationApprovalPolicy = {
    mode: 'always' as 'always' | 'budget' | 'auto',
    autoApproveMaxCny: 0.1,
  };
  const outbound: Array<{
    url: string;
    idempotencyKey: string;
    authorization: string | null;
    body: string;
  }> = [];
  const timeoutAttempts = new Map<string, number>();
  let signalDiagnosticBody: (() => void) | undefined;
  let diagnosticBodyCancelled = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : '';
    const idempotencyKey = headers.get('idempotency-key') ?? '';
    outbound.push({
      url,
      idempotencyKey,
      authorization: headers.get('authorization') ?? headers.get('xi-api-key'),
      body,
    });
    if (body.includes('diagnostic-cancelled-body')) {
      const stream = new ReadableStream<Uint8Array>({
        start() {
          signalDiagnosticBody?.();
        },
        cancel() {
          diagnosticBodyCancelled = true;
        },
      });
      return new Response(stream, {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (body.includes('diagnostic-legacy-credit')) {
      return Response.json(
        {
          detail: {
            status: 'quota_exceeded',
            message: `Private provider response ${secret}`,
          },
        },
        { status: 400 },
      );
    }
    if (body.includes('diagnostic-unknown')) {
      return Response.json(
        {
          detail: {
            status: secret,
            message: `Private provider response ${secret}`,
          },
        },
        { status: 400 },
      );
    }
    if (body.includes('secret-failure')) {
      throw new Error(
        `provider transport exposed Authorization: Bearer ${secret}; api_key=${secret}; raw=${secret}`,
      );
    }
    if (body.includes('rate-limit')) {
      return new Response('', { status: 429, headers: { 'retry-after': '2' } });
    }
    if (body.includes('quota')) return new Response('', { status: 402 });
    if (body.includes('unsafe')) return new Response('', { status: 451 });
    if (body.includes('invalid-request'))
      return new Response('', { status: 422 });
    if (body.includes('transient-failure'))
      return new Response('', { status: 503 });
    if (body.includes('ambiguous-timeout')) {
      const count = (timeoutAttempts.get(idempotencyKey) ?? 0) + 1;
      timeoutAttempts.set(idempotencyKey, count);
      if (count === 1) return new Response('', { status: 504 });
    }
    if (url.includes('/images/generations')) {
      return Response.json({ data: [{ b64_json: png.toString('base64') }] });
    }
    return new Response(
      body.includes('corrupt-audio')
        ? Buffer.from('ID3P29-DETERMINISTIC-AUDIO')
        : mp3,
      {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      },
    );
  };
  let generationContext: {
    completionRunId: string;
    planStepId: string | null;
  } | null = null;
  const broker = new StudioAssetJobBroker({
    projectRoot,
    registry,
    fetchImpl,
    getCredentialRef: () => 'credential:p29-fixture',
    getProviderConnection: (_providerId, credentialRef) => ({
      credentialRef: credentialRef ?? 'credential:p29-fixture',
      region: 'cn-beijing',
      workspaceId: 'p29-workspace',
      apiHost: 'http://127.0.0.1:43929/v1',
    }),
    getApprovalPolicy: () => approvalPolicy,
    getCompletionContext: () => generationContext,
    resolveCredential: (id) => {
      assert.equal(id, 'credential:p29-fixture');
      return secret;
    },
  });
  const disconnectedBroker = new StudioAssetJobBroker({
    projectRoot,
    registry,
  });
  assert.equal(disconnectedBroker.health('openai').available, false);
  assert.match(disconnectedBroker.health('openai').reason, /credential/u);

  const health = broker.providers();
  assert.equal(health.find((item) => item.id === 'openai')?.available, true);
  assert.equal(
    health.find((item) => item.id === 'elevenlabs')?.available,
    true,
  );
  const catalog = new ProviderModelCatalogService({
    resolveCredential: () => ({
      id: 'credential:p29-fixture',
      provider: 'elevenlabs',
      label: 'P29 ElevenLabs',
      configuration: { baseUrl: 'http://127.0.0.1:43929/v1' },
      secrets: { apiKey: secret },
    }),
    fetchImpl: async (_input, init) => {
      assert.equal(new Headers(init?.headers).get('xi-api-key'), secret);
      return Response.json([
        {
          model_id: 'eleven_turbo_v2_5',
          name: 'Eleven Turbo v2.5',
          can_do_text_to_speech: true,
        },
      ]);
    },
  });
  const discovered = await catalog.discover({
    providerId: 'elevenlabs',
    credentialId: 'credential:p29-fixture',
  });
  assert.equal(discovered.source, 'provider-api');
  assert.equal(
    discovered.models.some(
      (model) =>
        model.id === 'eleven_text_to_sound_v2' &&
        model.capabilities.includes('soundEffect'),
    ),
    true,
  );
  assert.equal(
    discovered.models.some(
      (model) =>
        model.id === 'music_v2' && model.capabilities.includes('music'),
    ),
    true,
  );
  assert.equal(
    health
      .find((item) => item.id === 'elevenlabs')
      ?.models.some((model) => model.kind === 'soundEffect'),
    true,
  );

  const sound = broker.submit({
    kind: 'soundEffect',
    prompt: 'short dry cannon sound',
    outputName: 'cannon.mp3',
    variants: 1,
  });
  assert.match(sound.id, /^asset-job:/u);
  assert.match(sound.idempotencyKey, /^idem:/u);
  assert.equal(sound.providerId, 'elevenlabs');
  assert.equal(sound.credentialRef, 'credential:p29-fixture');
  assert.equal(sound.endpointClass, 'synchronous');
  assert.equal(sound.routeSource, 'project');
  assert.equal(sound.costEstimateConfigured, false);
  assert.equal(
    (await broker.runWithPolicy(sound.id)).status,
    'awaitingApproval',
  );
  assert.equal(outbound.length, 0);
  const soundReady = await broker.approveAndRun(sound.id);
  assert.equal(soundReady.status, 'awaitingReview');
  assert.equal(soundReady.attemptHistory.length, 1);
  assert.equal(soundReady.attemptHistory[0]?.status, 'succeeded');
  assert.equal(soundReady.candidates[0]?.media.kind, 'audio');
  assert.equal(outbound[0]?.idempotencyKey, sound.idempotencyKey);
  assert.equal(outbound[0]?.authorization, secret);
  assert.match(outbound[0]?.url ?? '', /\/v1\/sound-generation/u);
  const measured = soundReady.candidates[0]!.media;
  assert.equal(measured.kind, 'audio');
  if (measured.kind !== 'audio') throw new Error('Expected audio');
  assert.equal(measured.codec, 'mp3');
  assert.equal(measured.sampleRateHz, 44100);
  assert.equal(measured.channels, 1, 'Actual mono, not fabricated stereo');
  assert(
    measured.durationMs >= 100 && measured.durationMs <= 160,
    'Measured bytes, not one-second request default',
  );
  const corruptAudio = broker.submit({
    kind: 'soundEffect',
    prompt: 'corrupt-audio',
    outputName: 'corrupt.mp3',
  });
  const corruptResult = await broker.approveAndRun(corruptAudio.id);
  assert.equal(corruptResult.status, 'failed');
  assert.equal(corruptResult.failure?.code, 'ASSET_AUDIO_DECODE_FAILED');
  assert.equal(corruptResult.failure?.retryable, false);
  assert.equal(corruptResult.candidates.length, 0);
  assert.throws(
    () =>
      broker.submit({
        kind: 'soundEffect',
        prompt: 'unsupported raw PCM',
        outputName: 'raw.wav',
        parameters: { outputFormat: 'pcm_44100' },
      }),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_JOB_PARAMETER_INVALID',
  );

  const oldImage = broker.submit({
    kind: 'image',
    prompt: 'one transparent top-down tank sprite',
    outputName: 'tank.png',
    variants: 1,
  });
  approvalPolicy = {
    mode: 'auto',
    autoApproveMaxCny: 1,
    authorizationId: 'generation-grant:p29-scoped-owner',
    completionRunId: 'completion-run:p29-scoped',
  };
  const beforeScopedRequest = outbound.length;
  assert.equal(
    (await broker.runWithPolicy(oldImage.id)).status,
    'awaitingApproval',
  );
  assert.equal(
    outbound.length,
    beforeScopedRequest,
    'A task grant must not run an unlinked old job.',
  );
  generationContext = {
    completionRunId: 'completion-run:p29-scoped',
    planStepId: null,
  };
  const image = broker.submit({
    kind: 'image',
    prompt: 'one transparent top-down tank sprite',
    outputName: 'scoped-tank.png',
    variants: 1,
  });
  const imageReady = await broker.resumeWithPolicy(image.id);
  assert.equal(imageReady.status, 'awaitingReview');
  assert.equal(imageReady.approval?.approvedBy, 'policy');
  assert.equal(
    imageReady.approval?.authorizationId,
    'generation-grant:p29-scoped-owner',
  );
  assert.deepEqual(imageReady.candidates[0]?.media, {
    kind: 'image',
    width: 1,
    height: 1,
    format: 'png',
    hasAlpha: true,
  });
  assert.match(outbound.at(-1)?.url ?? '', /\/v1\/images\/generations/u);
  const afterImageRequests = outbound.length;
  assert.equal(
    (await broker.resumeWithPolicy(image.id)).status,
    'awaitingReview',
  );
  assert.equal(
    outbound.length,
    afterImageRequests,
    'Resume cannot repeat a completed billed request.',
  );

  approvalPolicy = { mode: 'budget', autoApproveMaxCny: 0.1 };
  const unknownMusic = broker.submit({
    kind: 'music',
    prompt: 'quiet menu loop',
    outputName: 'menu.mp3',
    variants: 1,
  });
  assert.equal(
    (await broker.runWithPolicy(unknownMusic.id)).status,
    'awaitingApproval',
  );
  approvalPolicy = { mode: 'auto', autoApproveMaxCny: 0 };
  const musicReady = await broker.runWithPolicy(unknownMusic.id);
  assert.equal(musicReady.status, 'awaitingReview');
  assert.match(outbound.at(-1)?.url ?? '', /\/v1\/music/u);

  const legacy = broker.submit({
    kind: 'audio',
    providerId: 'local-placeholder',
    prompt: 'legacy narration fixture',
    outputName: 'legacy.wav',
    variants: 1,
  });
  assert.equal(legacy.kind, 'speechGeneration');
  assert.deepEqual(legacy.legacyMigration, {
    requestedCapability: 'audio',
    resolvedCapability: 'speechGeneration',
    rule: 'audio-to-speech-generation-v1',
  });
  assert.equal(broker.run(legacy.id).status, 'awaitingReview');

  assert.throws(
    () =>
      broker.submit({
        kind: 'soundEffect',
        parameters: { durationSeconds: 80 },
        prompt: 'invalid duration',
        outputName: 'invalid.mp3',
      }),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_JOB_PARAMETER_INVALID',
  );
  assert.throws(
    () =>
      broker.submit({
        kind: 'soundEffect',
        providerId: 'openai',
        prompt: 'wrong model',
        outputName: 'wrong.mp3',
      }),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_PROVIDER_MODEL_NOT_FOUND',
  );

  const expectedCategories = [
    ['rate-limit', 'rate-limit'],
    ['quota', 'quota'],
    ['unsafe', 'safety-refusal'],
    ['invalid-request', 'invalid-parameter'],
    ['transient-failure', 'transient'],
  ] as const;
  const jobsBeforeLongPrompt = broker.list().length;
  const callsBeforeLongPrompt = outbound.length;
  assert.throws(
    () =>
      broker.submit({
        kind: 'soundEffect',
        prompt: 'a'.repeat(451),
        outputName: 'too-long.mp3',
      }),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_JOB_PROMPT_TOO_LONG',
  );
  assert.equal(broker.list().length, jobsBeforeLongPrompt);
  assert.equal(outbound.length, callsBeforeLongPrompt);
  assert.equal(
    broker.estimate({ kind: 'soundEffect' }).promptMaxCharacters,
    450,
  );
  assert.equal(
    broker
      .health('elevenlabs')
      .models.find((model) => model.id === 'eleven_text_to_sound_v2')
      ?.promptMaxCharacters,
    450,
  );
  const boundaryJob = broker.submit({
    kind: 'soundEffect',
    prompt: 'a'.repeat(450),
    outputName: 'prompt-boundary.mp3',
  });
  const boundaryResult = await broker.approveAndRun(boundaryJob.id);
  assert.equal(boundaryResult.status, 'awaitingReview');
  const beforeRegeneration = JSON.stringify(broker.list());
  assert.throws(
    () =>
      broker.regenerate(
        boundaryJob.id,
        boundaryResult.candidates[0]!.id,
        'more',
      ),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_JOB_PROMPT_TOO_LONG',
  );
  assert.equal(
    JSON.stringify(broker.list()),
    beforeRegeneration,
    'Rejected regeneration must not reject its original candidate',
  );
  const unicodeBoundary = broker.submit({
    kind: 'soundEffect',
    prompt: '🎵'.repeat(450),
    outputName: 'unicode-boundary.mp3',
  });
  assert.equal(Array.from(unicodeBoundary.prompt).length, 450);
  assert.throws(
    () =>
      broker.submit({
        kind: 'soundEffect',
        prompt: '🎵'.repeat(451),
        outputName: 'unicode-too-long.mp3',
      }),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_JOB_PROMPT_TOO_LONG',
  );
  for (const [prompt, category] of expectedCategories) {
    const job = broker.submit({
      kind: 'soundEffect',
      prompt,
      outputName: `${prompt}.mp3`,
    });
    const failed = await broker.approveAndRun(job.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.failure?.category, category);
  }

  const diagnosticJob = broker.submit({
    kind: 'soundEffect',
    prompt: 'diagnostic-legacy-credit',
    outputName: 'diagnostic-legacy-credit.mp3',
  });
  const diagnosticFailure = await broker.approveAndRun(diagnosticJob.id);
  assert.equal(diagnosticFailure.failure?.category, 'quota');
  assert.equal(diagnosticFailure.failure?.retryable, false);
  assert.match(diagnosticFailure.failure?.message ?? '', /quota_exceeded/u);
  assert.equal(diagnosticFailure.attempts, 1);
  assert.equal(diagnosticFailure.candidates.length, 0);
  assert.equal(JSON.stringify(diagnosticFailure).includes(secret), false);
  assert.equal(diagnosticFailure.actualCostCny, null);
  assert.throws(
    () => broker.retry(diagnosticFailure.id),
    (error: unknown) =>
      error instanceof ProjectError && error.code === 'ASSET_JOB_NOT_RETRYABLE',
  );
  const unknownDiagnostic = broker.submit({
    kind: 'soundEffect',
    prompt: 'diagnostic-unknown',
    outputName: 'diagnostic-unknown.mp3',
  });
  const unknownFailure = await broker.approveAndRun(unknownDiagnostic.id);
  assert.equal(unknownFailure.failure?.code, 'ASSET_PROVIDER_REQUEST_REJECTED');
  assert.equal(unknownFailure.failure?.retryable, false);
  assert.equal(JSON.stringify(unknownFailure).includes(secret), false);
  const diagnosticBodyStarted = new Promise<void>((resolveReady) => {
    signalDiagnosticBody = resolveReady;
  });
  const cancelledDiagnostic = broker.submit({
    kind: 'soundEffect',
    prompt: 'diagnostic-cancelled-body',
    outputName: 'diagnostic-cancelled-body.mp3',
  });
  const pendingDiagnostic = broker.approveAndRun(cancelledDiagnostic.id);
  await diagnosticBodyStarted;
  broker.cancel(cancelledDiagnostic.id);
  const cancelledDuringRead = await pendingDiagnostic;
  assert.equal(cancelledDuringRead.status, 'cancelled');
  assert.equal(cancelledDuringRead.failure?.category, 'cancelled');
  assert.equal(cancelledDuringRead.attempts, 1);
  assert.equal(diagnosticBodyCancelled, true);

  const secretFailure = broker.submit({
    kind: 'soundEffect',
    prompt: 'secret-failure',
    outputName: 'secret-failure.mp3',
  });
  const secretFailed = await broker.approveAndRun(secretFailure.id);
  assert.equal(secretFailed.status, 'failed');
  assert.equal(secretFailed.failure?.category, 'transient');
  assert.match(secretFailed.failure?.message ?? '', /\[REDACTED\]/u);
  assert.equal(JSON.stringify(secretFailed).includes(secret), false);
  const agentTranscriptFixture = JSON.stringify({
    role: 'tool',
    toolCallId: secretFailed.toolCallId,
    content: secretFailed,
  });
  assert.equal(agentTranscriptFixture.includes(secret), false);

  const ambiguous = broker.submit({
    kind: 'soundEffect',
    prompt: 'ambiguous-timeout',
    outputName: 'timeout.mp3',
  });
  const timedOut = await broker.approveAndRun(ambiguous.id);
  assert.equal(timedOut.failure?.category, 'timeout-ambiguous');
  assert.equal(timedOut.attemptHistory[0]?.status, 'ambiguous');
  assert.throws(
    () => broker.retry(ambiguous.id),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_JOB_RECONCILIATION_REQUIRED',
  );
  broker.reconcileAmbiguousTimeout(ambiguous.id, 'confirmed-not-run');
  const retried = await broker.approveAndRetry(ambiguous.id);
  assert.equal(retried.status, 'awaitingReview');
  assert.equal(retried.attemptHistory.length, 2);
  assert.deepEqual(
    outbound
      .filter((request) => request.body.includes('ambiguous-timeout'))
      .map((request) => request.idempotencyKey),
    [ambiguous.idempotencyKey, ambiguous.idempotencyKey],
  );

  const cancelled = broker.submit({
    kind: 'music',
    prompt: 'cancel before call',
    outputName: 'cancel.mp3',
  });
  const cancelledResult = broker.cancel(cancelled.id);
  assert.equal(cancelledResult.status, 'cancelled');
  assert.equal(cancelledResult.remoteCancellationGuaranteed, false);
  assert.equal(cancelledResult.failure?.category, 'cancelled');

  const persistedText = allText(projectRoot);
  assert.equal(persistedText.includes(secret), false);
  assert.equal(JSON.stringify(broker.list()).includes(secret), false);
  assert.equal(
    readFileSync(
      join(projectRoot, '.aigame', 'local', 'asset-jobs', 'jobs.json'),
      'utf8',
    ).includes(secret),
    false,
  );
  assert.equal(
    readFileSync(
      join(projectRoot, '.aigame', 'local', 'asset-jobs', 'audit.jsonl'),
      'utf8',
    ).includes(secret),
    false,
  );
  const reloaded = new StudioAssetJobBroker({
    projectRoot,
    registry,
    fetchImpl,
    getCredentialRef: () => 'credential:p29-fixture',
    getProviderConnection: (_providerId, credentialRef) => ({
      credentialRef: credentialRef ?? 'credential:p29-fixture',
      region: 'cn-beijing',
      workspaceId: 'p29-workspace',
      apiHost: 'http://127.0.0.1:43929/v1',
    }),
    getApprovalPolicy: () => approvalPolicy,
    resolveCredential: () => secret,
  });
  assert.equal(
    reloaded.list().find((job) => job.id === sound.id)?.idempotencyKey,
    sound.idempotencyKey,
  );
  assert.deepEqual(
    reloaded.list().find((job) => job.id === diagnosticFailure.id)?.failure,
    diagnosticFailure.failure,
  );
  const legacyPath = join(projectRoot, '.aigame/local/asset-jobs/jobs.json');
  const legacyStore = JSON.parse(readFileSync(legacyPath, 'utf8'));
  const legacyCandidateJob = legacyStore.jobs.find(
    (job: { id: string }) => job.id === sound.id,
  );
  const invalidLegacy = Buffer.from('ID3P29-DETERMINISTIC-AUDIO');
  const outboundBeforeLegacyReload = outbound.length;
  writeFileSync(
    join(projectRoot, legacyCandidateJob.candidates[0].path),
    invalidLegacy,
  );
  delete legacyCandidateJob.candidates[0].media;
  legacyCandidateJob.candidates[0].sha256 = createHash('sha256')
    .update(invalidLegacy)
    .digest('hex');
  writeFileSync(legacyPath, JSON.stringify(legacyStore));
  const legacyReload = new StudioAssetJobBroker({ projectRoot, registry });
  const invalidJob = legacyReload.list().find((job) => job.id === sound.id)!;
  assert.equal(invalidJob.status, 'failed');
  assert.equal(invalidJob.failure?.code, 'ASSET_AUDIO_LEGACY_UNVERIFIED');
  assert.equal(invalidJob.candidates[0]?.media.kind, 'audio');
  assert.equal(
    legacyReload.list().length,
    legacyStore.jobs.length,
    'Other job history survives',
  );
  assert.equal(
    outbound.length,
    outboundBeforeLegacyReload,
    'Recovery must not resubmit a paid job',
  );
  console.log(
    JSON.stringify(
      {
        gate: 'P29 provider-neutral media jobs',
        capabilities: ['image', 'soundEffect', 'music', 'speechGeneration'],
        productionAdapters: [
          'openai-image',
          'elevenlabs-sound-effect',
          'elevenlabs-music',
        ],
        legacyAudioMigration: true,
        outboundRequests: outbound.length,
        idempotentRetry: true,
        failureCategories: expectedCategories.map(([, category]) => category),
        exceptionSecretBoundary: [
          'returned-job',
          'failure-message',
          'agent-transcript',
          'jobs-store',
          'audit-log',
          'project-text-files',
        ],
        secretRedacted: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
