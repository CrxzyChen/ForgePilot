import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

import { StudioSettingsService } from '../studio/settings/studio-settings-service.ts';
import { ProviderModelCatalogService } from '../studio/settings/provider-model-catalog-service.ts';
import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p26-'));
const projectRoot = join(temporary, 'tank-workflow');
const scriptHostPath = join(
  repository,
  'target',
  'debug',
  process.platform === 'win32'
    ? 'project-script-host.exe'
    : 'project-script-host',
);
const kernelCliPath = join(
  repository,
  'target',
  'debug',
  process.platform === 'win32' ? 'kernelctl.exe' : 'kernelctl',
);

function git(args: string[], expectSuccess = true): string {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (expectSuccess)
    assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function allText(root: string): string {
  let output = '';
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (/\.(?:json|md|toml|txt|ts|tsx|css)$/u.test(entry.name)) {
        const value = readFileSync(child);
        if (value.byteLength < 2_000_000) output += value.toString('utf8');
      }
    }
  };
  visit(root);
  return output;
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
  });
  rmSync(join(projectRoot, '.git'), { recursive: true, force: true });
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'P26 Gate']);
  git(['config', 'user.email', 'p26@example.invalid']);
  git(['add', '.']);
  git(['commit', '-m', 'Initial project']);

  const registry = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath,
    scriptHostPath,
  });
  const discovered = registry.execute('test.discover').data as Array<{
    path: string;
  }>;
  assert.equal(discovered.length, 1);
  const testResult = registry.execute('test.run', {
    test: discovered[0]!.path,
    ticks: 2,
  }).data as { status: string };
  assert.notEqual(testResult.status, 'failed');

  registry.execute('debug.breakpoint.set', {
    id: 'p26:on-fixed-update',
    hook: 'onFixedUpdate',
  });
  registry.execute('debug.watch.set', {
    path: 'tank:player/core:transform2d.position',
  });
  const debugResult = registry.execute('test.run', {
    test: discovered[0]!.path,
    ticks: 3,
  }).data as {
    pausedAt?: {
      callStack?: unknown[];
      scopes?: Record<string, unknown>;
    } | null;
  };
  assert.ok(debugResult.pausedAt);
  assert.ok((debugResult.pausedAt?.callStack?.length ?? 0) > 0);
  assert.ok(Object.keys(debugResult.pausedAt?.scopes ?? {}).length > 0);

  registry.execute('project.file.create', {
    path: 'docs/p26-workflow.md',
    content: '# Daily workflow\n',
  });
  registry.execute('source-control.stage', { path: 'docs/p26-workflow.md' });
  const commit = registry.execute('source-control.commit', {
    message: 'Exercise Studio commit workflow',
  }).data as { commit: string };
  assert.match(commit.commit, /^[0-9a-f]{40}$/u);
  assert.ok(
    (registry.execute('source-control.history').data as unknown[]).length >= 2,
  );

  registry.execute('source-control.branch.create', { name: 'p26-feature' });
  registry.execute('project.file.create', {
    path: 'docs/stash-me.md',
    content: 'stash candidate\n',
  });
  registry.execute('source-control.stash.push', { message: 'P26 stash' });
  assert.equal(
    (registry.execute('source-control.stash.list').data as unknown[]).length,
    1,
  );
  registry.execute('source-control.stash.pop', {});
  registry.execute('project.file.trash', { path: 'docs/stash-me.md' });
  registry.execute('source-control.branch.switch', { name: 'main' });

  writeFileSync(join(projectRoot, 'conflict.txt'), 'base\n');
  git(['add', 'conflict.txt']);
  git(['commit', '-m', 'Conflict base']);
  git(['switch', '-c', 'p26-conflict']);
  writeFileSync(join(projectRoot, 'conflict.txt'), 'feature\n');
  git(['commit', '-am', 'Feature side']);
  git(['switch', 'main']);
  writeFileSync(join(projectRoot, 'conflict.txt'), 'main\n');
  git(['commit', '-am', 'Main side']);
  git(['merge', 'p26-conflict'], false);
  const conflicted = registry.execute('source-control.status').data as {
    files: Array<{ path: string; gitStatus?: string }>;
  };
  assert.equal(
    conflicted.files.find((file) => file.path === 'conflict.txt')?.gitStatus,
    'conflicted',
  );
  git(['merge', '--abort']);

  const capabilitiesBefore = JSON.parse(
    registry.readText('project.aigame.json').source,
  ) as { capabilities: string[] };
  registry.execute('capability.set', { id: 'ui', enabled: false });
  const disabled = JSON.parse(
    registry.readText('project.aigame.json').source,
  ) as { capabilities: string[] };
  assert.equal(disabled.capabilities.includes('ui'), false);
  registry.execute('history.undo');
  const restored = JSON.parse(
    registry.readText('project.aigame.json').source,
  ) as { capabilities: string[] };
  assert.deepEqual(restored.capabilities, capabilitiesBefore.capabilities);

  registry.execute('prefab.create', {
    scene: 'scenes/main.game.json',
    objectId: 'tank:player',
    objectIds: ['tank:player'],
    name: 'P26 Tank Prefab',
    path: 'prefabs/p26-tank.prefab.json',
  });
  const instance = registry.execute('prefab.instantiate', {
    scene: 'scenes/main.game.json',
    path: 'prefabs/p26-tank.prefab.json',
  }).data as { objectIds: string[] };
  registry.execute('scene.object.update', {
    scene: 'scenes/main.game.json',
    objectId: instance.objectIds[0],
    name: 'Overridden Tank',
  });
  const overrides = registry.execute('prefab.overrides', {
    scene: 'scenes/main.game.json',
    objectId: instance.objectIds[0],
  }).data as { overrides: unknown[] };
  assert.ok(overrides.overrides.length > 0);

  const settings = new StudioSettingsService({
    userDataDirectory: join(temporary, 'user-data'),
    getProjectRoot: () => projectRoot,
  });
  assert.equal(
    settings.update('studio', { autosave: 'delay' }).values.autosave,
    'delay',
  );
  assert.equal(
    settings.update('agent', { contextScope: 'scene' }).values.contextScope,
    'scene',
  );
  assert.equal(
    settings.update('ai-tools', {
      mcpEnabled: false,
      projectSkillsEnabled: false,
      generationApprovalMode: 'budget',
      generationAutoApproveMaxCny: 1,
    }).values.generationApprovalMode,
    'budget',
  );
  assert.throws(
    () => settings.update('ai-tools', { apiKey: 'must-not-be-stored' }),
    /设置不能保存明文凭据/u,
  );

  const secret = 'P26_SUPER_SECRET_VALUE';
  let generationRequests = 0;
  let openAiRequests = 0;
  let voiceRequests = 0;
  let modelCatalogRequests = 0;
  let lastRequestBody = '';
  const wav = Buffer.from('524946462400000057415645666d7420', 'hex');
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes('/api/v1/models')) {
      modelCatalogRequests += 1;
      assert.equal(
        new Headers(init?.headers).get('authorization'),
        `Bearer ${secret}`,
      );
      return new Response(
        JSON.stringify({
          success: true,
          output: {
            total: 5,
            page_no: 1,
            page_size: 100,
            models: [
              {
                model: 'wan2.6-t2i',
                name: '万相 2.6 文生图',
                provider: 'wan',
                capabilities: ['IG'],
              },
              {
                model: 'qwen-image-max',
                name: 'Qwen Image Max',
                provider: 'qwen',
                capabilities: ['IG'],
              },
              {
                model: 'wan2.6-t2v',
                name: '万相 2.6 文生视频',
                provider: 'wan',
                capabilities: ['VG'],
              },
              {
                model: 'qwen3-tts-flash',
                name: '千问语音合成',
                provider: 'qwen',
                capabilities: ['TTS'],
              },
              {
                model: 'qwen3-asr-flash',
                name: '千问语音识别',
                provider: 'qwen',
                capabilities: ['ASR'],
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === 'https://api.openai.com/v1/models') {
      modelCatalogRequests += 1;
      assert.equal(
        new Headers(init?.headers).get('authorization'),
        `Bearer ${secret}`,
      );
      return new Response(
        JSON.stringify({
          data: [
            { id: 'gpt-image-2', owned_by: 'openai' },
            { id: 'sora-2', owned_by: 'openai' },
            { id: 'gpt-4o-mini-tts', owned_by: 'openai' },
            { id: 'gpt-4o-transcribe', owned_by: 'openai' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/audio/tts/SpeechSynthesizer')) {
      voiceRequests += 1;
      lastRequestBody = typeof init?.body === 'string' ? init.body : '';
      return new Response(
        JSON.stringify({
          output: {
            audio: { url: 'https://p26-result.aliyuncs.com/voice.wav' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === 'https://api.openai.com/v1/images/generations') {
      openAiRequests += 1;
      lastRequestBody = typeof init?.body === 'string' ? init.body : '';
      return new Response(
        JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/aigc/multimodal-generation/generation')) {
      generationRequests += 1;
      lastRequestBody = typeof init?.body === 'string' ? init.body : '';
      return new Response(
        JSON.stringify({
          output: {
            choices: [
              {
                message: {
                  content: [
                    { image: 'https://p26-result.aliyuncs.com/candidate.png' },
                  ],
                },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    return new Response(url.endsWith('.wav') ? wav : png, {
      status: 200,
      headers: {
        'content-type': url.endsWith('.wav') ? 'audio/wav' : 'image/png',
      },
    });
  }) as typeof fetch;
  const catalog = new ProviderModelCatalogService({
    fetchImpl,
    resolveCredential: (id) => ({
      id,
      provider: id.startsWith('openai') ? 'openai' : 'aliyun-bailian',
      label: 'P26 model catalog',
      configuration: (id.startsWith('openai')
        ? { baseUrl: 'https://api.openai.com/v1' }
        : {
            region: 'cn-beijing',
            workspaceId: 'p26-workspace',
          }) as Record<string, string>,
      secrets: { apiKey: secret },
    }),
  });
  const bailianCatalog = await catalog.discover({
    providerId: 'aliyun-bailian',
    credentialId: 'bailian-catalog-credential',
  });
  assert.equal(bailianCatalog.source, 'provider-api');
  assert.equal(bailianCatalog.models.length, 5);
  assert.deepEqual(
    bailianCatalog.models.find((model) => model.id === 'wan2.6-t2i')
      ?.capabilities,
    ['image'],
  );
  assert.deepEqual(
    bailianCatalog.models.find((model) => model.id === 'wan2.6-t2v')
      ?.capabilities,
    ['video'],
  );
  const openAiCatalog = await catalog.discover({
    providerId: 'openai',
    credentialId: 'openai-catalog-credential',
  });
  assert.equal(openAiCatalog.source, 'provider-api');
  assert.equal(openAiCatalog.models.length, 4);
  assert.equal(modelCatalogRequests, 2);
  assert.deepEqual(
    openAiCatalog.models.find((model) => model.id === 'gpt-image-2')
      ?.capabilities,
    ['image'],
  );
  assert.doesNotMatch(JSON.stringify(openAiCatalog), /P26_SUPER_SECRET_VALUE/u);
  let approvalPolicy = {
    mode: 'always' as 'always' | 'budget' | 'auto',
    autoApproveMaxCny: 1,
  };
  const assetChanges = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry,
  });
  const broker = new StudioAssetJobBroker({
    projectRoot,
    registry,
    changes: assetChanges,
    fetchImpl,
    getCredentialRef: () => 'p26-credential-ref',
    getProviderConnection: (_providerId, credentialRef) => ({
      credentialRef: credentialRef ?? 'p26-credential-ref',
      region: 'cn-beijing',
      workspaceId: 'p26-workspace',
    }),
    getApprovalPolicy: () => approvalPolicy,
    resolveCredential: (id) => {
      assert.equal(id, 'p26-credential-ref');
      return secret;
    },
  });
  const providers = broker.providers();
  assert.equal(
    providers.find((provider) => provider.id === 'local-placeholder')?.testOnly,
    true,
  );
  assert.equal(
    providers.find((provider) => provider.id === 'aliyun-bailian')?.available,
    true,
  );
  assert.equal(
    providers.find((provider) => provider.id === 'openai')?.available,
    true,
  );
  assert.equal(
    broker.estimate({ providerId: 'aliyun-bailian', variants: 2 })
      .estimatedCostCny,
    0.28,
  );
  const pending = broker.submit({
    kind: 'image',
    providerId: 'aliyun-bailian',
    credentialRef: 'p26-credential-ref',
    modelId: 'wan2.6-t2i',
    parameters: { size: '1280*1280' },
    prompt: 'small blue tank sprite on transparent background',
    outputName: 'p26-tank.png',
    variants: 1,
  });
  assert.equal(pending.credentialRef, 'p26-credential-ref');
  assert.equal((await broker.runAsync(pending.id)).status, 'awaitingApproval');
  assert.equal(generationRequests, 0);
  const generated = await broker.approveAndRun(pending.id);
  assert.equal(generated.status, 'awaitingReview');
  assert.equal(generated.modelId, 'wan2.6-t2i');
  assert.ok(generated.approval);
  assert.equal(generated.actualCostCny, 0.14);
  assert.equal(generationRequests, 1);
  assert.match(lastRequestBody, /"size":"1280\*1280"/u);
  const imported = broker.select(generated.id, generated.candidates[0]!.id);
  assert.equal(imported.status, 'awaitingImportApproval');
  assetChanges.approve(imported.importChangeSetId!);
  assetChanges.apply(imported.importChangeSetId!);
  assert.equal(
    broker.list().find((job) => job.id === generated.id)?.status,
    'imported',
  );
  assert.equal(allText(projectRoot).includes(secret), false);

  const voicePending = broker.submit({
    kind: 'audio',
    parameters: { voice: 'longanhuan_v3.6', sampleRate: 24000 },
    prompt: '发现敌军，请准备战斗。',
    outputName: 'p26-voice.wav',
    variants: 1,
  });
  assert.equal(voicePending.status, 'awaitingApproval');
  assert.equal(voicePending.providerId, 'aliyun-bailian');
  assert.equal(voicePending.modelId, 'qwen-audio-3.0-tts-flash');
  const voice = await broker.approveAndRun(voicePending.id);
  assert.equal(voice.status, 'awaitingReview');
  assert.equal(voiceRequests, 1);
  assert.match(lastRequestBody, /"format":"wav"/u);

  approvalPolicy = { mode: 'budget', autoApproveMaxCny: 0.2 };
  const withinBudget = broker.submit({
    kind: 'image',
    providerId: 'aliyun-bailian',
    modelId: 'wan2.6-t2i',
    prompt: 'known-price generation inside the user threshold',
    outputName: 'p26-within-budget.png',
    variants: 1,
  });
  const budgetGenerated = await broker.runWithPolicy(withinBudget.id);
  assert.equal(budgetGenerated.status, 'awaitingReview');
  assert.equal(budgetGenerated.approval?.approvedBy, 'policy');
  assert.equal(budgetGenerated.approval?.policy, 'budget');
  assert.equal(generationRequests, 2);

  approvalPolicy = { mode: 'auto', autoApproveMaxCny: 0 };
  const routedOpenAi = broker.submit({
    kind: 'image',
    prompt: 'top-down blue tank sprite with transparent background',
    outputName: 'p26-openai-tank.png',
    variants: 1,
  });
  assert.equal(routedOpenAi.providerId, 'openai');
  assert.equal(routedOpenAi.modelId, 'gpt-image-2');
  const openAiGenerated = await broker.runWithPolicy(routedOpenAi.id);
  assert.equal(openAiGenerated.status, 'awaitingReview');
  assert.equal(openAiGenerated.approval?.approvedBy, 'policy');
  assert.equal(openAiGenerated.approval?.policy, 'auto');
  assert.equal(openAiRequests, 1);
  assert.match(lastRequestBody, /"model":"gpt-image-2"/u);
  assert.match(lastRequestBody, /"output_format":"png"/u);

  const dynamicallyDiscovered = broker.submit({
    kind: 'image',
    providerId: 'openai',
    credentialRef: 'p26-openai-credential-ref',
    modelId: 'gpt-image-newly-discovered',
    prompt: 'provider-discovered model should not require a manifest release',
    outputName: 'p26-dynamic-model.png',
    variants: 1,
  });
  assert.equal(dynamicallyDiscovered.modelId, 'gpt-image-newly-discovered');
  assert.equal(
    dynamicallyDiscovered.credentialRef,
    'p26-openai-credential-ref',
  );
  assert.equal(dynamicallyDiscovered.costEstimateConfigured, false);

  approvalPolicy = { mode: 'budget', autoApproveMaxCny: 10 };
  const unknownPrice = broker.submit({
    kind: 'image',
    prompt: 'unknown-cost image must still wait under budget policy',
    outputName: 'p26-unknown-cost.png',
    variants: 1,
  });
  assert.equal(
    (await broker.runWithPolicy(unknownPrice.id)).status,
    'awaitingApproval',
  );
  assert.equal(openAiRequests, 1);

  const legacyRoot = join(temporary, 'legacy-provider-project');
  cpSync(projectRoot, legacyRoot, { recursive: true });
  rmSync(join(legacyRoot, '.aigame', 'local', 'asset-jobs'), {
    recursive: true,
    force: true,
  });
  writeFileSync(
    join(legacyRoot, '.ai', 'providers.json'),
    `${JSON.stringify({
      schemaVersion: '1.0.0',
      providers: [
        { id: 'local-placeholder', kind: 'local-placeholder', paid: false },
        {
          id: 'aliyun-bailian',
          kind: 'external-http',
          paid: true,
          enabled: false,
        },
      ],
    })}\n`,
  );
  const legacyRegistry = new StudioCommandRegistry({
    projectRoot: legacyRoot,
    kernelCliPath,
    scriptHostPath,
  });
  new StudioAssetJobBroker({
    projectRoot: legacyRoot,
    registry: legacyRegistry,
  });
  const migratedProviders = JSON.parse(
    readFileSync(join(legacyRoot, '.ai', 'providers.json'), 'utf8'),
  ) as {
    schemaVersion: string;
    providers: Array<{ id: string; kind: string; models?: unknown[] }>;
  };
  assert.equal(migratedProviders.schemaVersion, '2.0.0');
  assert.equal(
    migratedProviders.providers.find((item) => item.id === 'aliyun-bailian')
      ?.kind,
    'aliyun-bailian',
  );
  assert.ok(
    (migratedProviders.providers.find((item) => item.id === 'aliyun-bailian')
      ?.models?.length ?? 0) >= 6,
  );
  assert.ok(
    migratedProviders.providers.some((item) => item.id === 'openai'),
    'Provider migration must add the built-in OpenAI adapter to older projects',
  );

  const schemaTwoRoot = join(temporary, 'schema-two-missing-provider-project');
  cpSync(projectRoot, schemaTwoRoot, { recursive: true });
  rmSync(join(schemaTwoRoot, '.aigame', 'local', 'asset-jobs'), {
    recursive: true,
    force: true,
  });
  const schemaTwoProviderPath = join(schemaTwoRoot, '.ai', 'providers.json');
  const schemaTwoProviders = JSON.parse(
    readFileSync(schemaTwoProviderPath, 'utf8'),
  ) as {
    schemaVersion: string;
    providers: Array<{ id: string }>;
  };
  schemaTwoProviders.providers = schemaTwoProviders.providers.filter(
    (item) => item.id !== 'openai',
  );
  writeFileSync(
    schemaTwoProviderPath,
    `${JSON.stringify(schemaTwoProviders, null, 2)}\n`,
  );
  const schemaTwoRegistry = new StudioCommandRegistry({
    projectRoot: schemaTwoRoot,
    kernelCliPath,
    scriptHostPath,
  });
  new StudioAssetJobBroker({
    projectRoot: schemaTwoRoot,
    registry: schemaTwoRegistry,
  });
  const repairedSchemaTwoProviders = JSON.parse(
    readFileSync(schemaTwoProviderPath, 'utf8'),
  ) as { providers: Array<{ id: string }> };
  assert.ok(
    repairedSchemaTwoProviders.providers.some((item) => item.id === 'openai'),
    'Schema 2 projects created before OpenAI support must be repaired too',
  );

  const cancelRoot = join(temporary, 'cancel-project');
  cpSync(projectRoot, cancelRoot, { recursive: true });
  rmSync(join(cancelRoot, '.aigame', 'local', 'asset-jobs'), {
    recursive: true,
    force: true,
  });
  const cancelRegistry = new StudioCommandRegistry({
    projectRoot: cancelRoot,
    kernelCliPath,
    scriptHostPath,
  });
  const waitingFetch = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('cancelled', 'AbortError')),
      );
    })) as typeof fetch;
  const cancelBroker = new StudioAssetJobBroker({
    projectRoot: cancelRoot,
    registry: cancelRegistry,
    fetchImpl: waitingFetch,
    getCredentialRef: () => 'p26-credential-ref',
    getProviderConnection: () => ({
      credentialRef: 'p26-credential-ref',
      region: 'cn-beijing',
      workspaceId: 'p26-workspace',
    }),
    resolveCredential: () => secret,
  });
  const cancelJob = cancelBroker.submit({
    kind: 'image',
    providerId: 'aliyun-bailian',
    prompt: 'cancel this provider request',
    outputName: 'cancel.png',
    variants: 1,
  });
  const cancellation = cancelBroker.approveAndRun(cancelJob.id);
  await Promise.resolve();
  cancelBroker.cancel(cancelJob.id);
  assert.equal((await cancellation).status, 'cancelled');

  rmSync(join(projectRoot, 'tests'), { recursive: true, force: true });
  assert.throws(
    () => registry.execute('test.run', { ticks: 1 }),
    /项目中没有可运行的测试/u,
  );

  const studioText = allText(join(repository, 'studio'));
  for (const marker of [
    'main-menu-popup',
    'Animation Timeline',
    '材质预览',
    'assetProviderList',
    'source-control.commit',
    'external-conflict-banner',
    'callStack',
    '任务输出',
    '资源生成供应商接口模型',
    '资源生成手动模型 ID',
    '来源：供应商接口',
    '百炼 Workspace ID',
    'costEstimateConfigured',
    'generationApprovalMode',
    'AIGAME_STUDIO_ASSET_BROKER_URL',
    'gpt-image-2',
  ]) {
    assert.ok(studioText.includes(marker), marker);
  }

  console.log(
    `[p26-daily-workflows] ${JSON.stringify({
      discoveredTests: discovered.length,
      debugger: {
        callStack: debugResult.pausedAt?.callStack?.length ?? 0,
        scopes: Object.keys(debugResult.pausedAt?.scopes ?? {}).length,
      },
      git: { commit: commit.commit.slice(0, 8), conflictDetected: true },
      settings: {
        autosave: 'delay',
        contextScope: 'scene',
        plaintextRejected: true,
      },
      provider: {
        id: generated.providerId,
        candidates: generated.candidates.length,
        estimatedCostCny: generated.estimatedCostCny,
        actualCostCny: generated.actualCostCny,
        cancelled: true,
        voiceCandidates: voice.candidates.length,
        paidRunRequiresApproval: true,
        configurableApprovalPolicy: true,
        capabilityRoute: 'image -> openai/gpt-image-2',
        speechGenerationRoute:
          'speechGeneration -> aliyun-bailian/qwen-audio-3.0-tts-flash',
        discoveredModels: {
          bailian: bailianCatalog.models.length,
          openai: openAiCatalog.models.length,
        },
        dynamicallyDiscoveredModel: dynamicallyDiscovered.modelId,
        secureMainProcessBridge: true,
        legacyConfigMigrated: true,
        secretRedacted: true,
      },
      specializedEditors: ['material', 'animation', 'prefab'],
      prefabOverrides: overrides.overrides.length,
    })}`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
