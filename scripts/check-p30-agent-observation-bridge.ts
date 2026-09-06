import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p30-agent-'));
const projectRoot = join(temporary, 'tank-arena');
let runningChild: ReturnType<typeof spawn> | null = null;

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  const child = (runningChild = spawn(
    process.execPath,
    [
      join(repository, 'dist', 'electron', 'engine-mcp', 'server.js'),
      '--project',
      projectRoot,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        AIGAME_STUDIO_KERNEL_CLI: join(
          repository,
          'target',
          'debug',
          'kernelctl.exe',
        ),
        AIGAME_STUDIO_SCRIPT_HOST: join(
          repository,
          'target',
          'debug',
          'project-script-host.exe',
        ),
        AIGAME_STUDIO_GAME_RUNTIME: join(
          repository,
          'target',
          'debug',
          'ai-game-player.exe',
        ),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  ));
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (stderr += String(chunk)));
  let stdout = '';
  const pending = new Map<number, (value: Record<string, unknown>) => void>();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    const lines = stdout.split(/\r?\n/u);
    stdout = lines.pop() ?? '';
    for (const line of lines.filter((item) => item.trim())) {
      const message = JSON.parse(line) as { id?: number } & Record<
        string,
        unknown
      >;
      if (typeof message.id === 'number') {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
    }
  });
  const rpc = (
    id: number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> =>
    new Promise((resolveResponse, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`P30 Engine MCP timed out: ${stderr}`)),
        90_000,
      );
      pending.set(id, (value) => {
        clearTimeout(timer);
        resolveResponse(value);
      });
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
      );
    });
  const content = <T>(response: Record<string, unknown>): T => {
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    const result = response.result as
      | { structuredContent?: T; isError?: boolean }
      | undefined;
    assert.equal(
      result?.isError,
      false,
      JSON.stringify(result?.structuredContent),
    );
    const value = result?.structuredContent;
    assert(value, JSON.stringify(response));
    return value;
  };

  const toolsResponse = await rpc(1, 'tools/list', {});
  const tools =
    (
      toolsResponse.result as {
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        }>;
      }
    ).tools ?? [];
  const toolNames = tools.map((tool) => tool.name);
  for (const name of [
    'runtime.capture_frame',
    'runtime.navigate_checkpoint',
    'runtime.read_observation',
    'runtime.compare_observations',
    'runtime.compare_player',
    'change.propose',
  ]) {
    assert(toolNames.includes(name), `Engine MCP omitted ${name}`);
  }
  for (const forbidden of [
    'runtime.click_screen',
    'runtime.inspect_dom',
    'runtime.renderer_handle',
    'asset.select',
  ]) {
    assert.equal(toolNames.includes(forbidden), false, forbidden);
  }
  const observationTools = tools.filter((tool) =>
    tool.name.startsWith('runtime.'),
  );
  const observationContract = JSON.stringify(observationTools);
  for (const forbidden of [
    'screenX',
    'screenY',
    'domSelector',
    'pointerHandle',
  ]) {
    assert.equal(observationContract.includes(forbidden), false, forbidden);
  }

  const navigated = content<{
    result: { stateHash: string; tick: number };
    observation: {
      observationId: string;
      checkpointId: string;
      stateHash: string;
      frameArtifact: { path: string; sha256: string };
      drawables: Array<{ drawableId: string; objectId: string }>;
      ui: Array<{ uiId: string; inputAction?: string }>;
      audio: { events: unknown[]; buses: unknown[] };
    };
  }>(
    await rpc(2, 'tools/call', {
      name: 'runtime.navigate_checkpoint',
      arguments: {
        checkpointId: 'menu',
        inputLogId: 'p30-agent-menu',
        ticks: 1,
        seed: 20260903,
        width: 640,
        height: 360,
      },
    }),
  );
  assert.equal(navigated.observation.checkpointId, 'checkpoint:menu');
  assert.equal(navigated.observation.stateHash, navigated.result.stateHash);
  assert.match(navigated.observation.observationId, /^observation:/u);
  assert.match(navigated.observation.frameArtifact.path, /\.png$/u);
  assert.match(navigated.observation.frameArtifact.sha256, /^[a-f0-9]{64}$/u);
  assert(
    navigated.observation.drawables.every(
      (drawable) => drawable.drawableId && drawable.objectId,
    ),
  );
  assert(
    navigated.observation.ui.some(
      (target) => target.inputAction === 'start-game',
    ),
  );

  const read = content<{ observationId: string }>(
    await rpc(3, 'tools/call', {
      name: 'runtime.read_observation',
      arguments: { observationId: navigated.observation.observationId },
    }),
  );
  assert.equal(read.observationId, navigated.observation.observationId);
  const compared = content<{
    comparisonId: string;
    stateHashMatches: boolean;
    drawableIdentityMatches: boolean;
    resourceIdentityMatches: boolean;
    audioIdentityMatches: boolean;
    mismatches: unknown[];
  }>(
    await rpc(4, 'tools/call', {
      name: 'runtime.compare_observations',
      arguments: {
        leftObservationId: navigated.observation.observationId,
        rightObservationId: navigated.observation.observationId,
      },
    }),
  );
  assert.match(compared.comparisonId, /^observation-comparison:/u);
  assert.equal(compared.stateHashMatches, true);
  assert.equal(compared.drawableIdentityMatches, true);
  assert.equal(compared.resourceIdentityMatches, true);
  assert.equal(compared.audioIdentityMatches, true);
  assert.deepEqual(compared.mismatches, []);

  const parity = content<{
    studio: { inputLogId: string; frameArtifact: { sha256: string } };
    player: { inputLogId: string; frameArtifact: { sha256: string } };
    comparison: {
      stateHashMatches: boolean;
      drawableIdentityMatches: boolean;
      resourceIdentityMatches: boolean;
      audioIdentityMatches: boolean;
      mismatches: unknown[];
    };
    build: { reproducibleCoreHash: string };
  }>(
    await rpc(5, 'tools/call', {
      name: 'runtime.compare_player',
      arguments: {
        checkpointId: 'menu-parity',
        inputLogId: 'p30-studio-player-menu',
        ticks: 1,
        seed: 20260903,
        width: 640,
        height: 360,
      },
    }),
  );
  assert.equal(parity.studio.inputLogId, parity.player.inputLogId);
  assert.equal(
    parity.studio.frameArtifact.sha256,
    parity.player.frameArtifact.sha256,
  );
  assert.deepEqual(parity.comparison, {
    ...parity.comparison,
    stateHashMatches: true,
    drawableIdentityMatches: true,
    resourceIdentityMatches: true,
    audioIdentityMatches: true,
    mismatches: [],
  });
  assert.match(parity.build.reproducibleCoreHash, /^[a-f0-9]{64}$/u);

  // Real native Player replay across multiple batches, using a durable log
  // recorded through exactly the same MCP controls exposed to the Copilot.
  let nextId = 20;
  const call = async <T>(name: string, args: Record<string, unknown>) =>
    content<T>(await rpc(nextId++, 'tools/call', { name, arguments: args }));
  const rejectCall = async (args: Record<string, unknown>, code: string) => {
    const response = await rpc(nextId++, 'tools/call', {
      name: 'runtime.compare_player',
      arguments: args,
    });
    assert.match(JSON.stringify(response), new RegExp(code, 'u'));
  };
  await rejectCall({ checkpointId: 'not-a-recipe' }, 'RUNTIME_REPLAY_REQUIRED');
  await rejectCall(
    { checkpointId: 'missing', inputLogId: `input-log:${'0'.repeat(64)}` },
    'RUNTIME_INPUT_LOG_MISSING',
  );
  await call('runtime.navigate_checkpoint', {
    checkpointId: 'recorded-start',
    ticks: 1,
    seed: 20260905,
    inputs: [{ tick: 0, action: 'start-game', value: 1 }],
    width: 640,
    height: 360,
  });
  let checkpoint = await call<{
    sessionId: string;
    generation: number;
    tick: number;
  }>('runtime.read_state', {});
  for (const input of [
    { tick: 1, action: 'start-game', value: 0 },
    { tick: 2, action: 'fire', value: 1 },
    { tick: 3, action: 'fire', value: 0 },
  ])
    await call('runtime.input', input);
  for (const ticks of [200, 200, 150]) {
    await call('runtime.advance_ticks', {
      sessionId: checkpoint.sessionId,
      generation: checkpoint.generation,
      expectedTick: checkpoint.tick,
      ticks,
    });
    checkpoint = await call('runtime.read_state', {});
  }
  const exported = await call<{
    inputLogId: string;
    stateHash: string;
    request: { inputs: unknown[] };
  }>('runtime.export_input_log', {
    sessionId: checkpoint.sessionId,
    generation: checkpoint.generation,
    expectedTick: checkpoint.tick,
  });
  assert.equal(exported.request.inputs.length, 4);
  const longParity = await call<{
    studio: {
      tick: number;
      stateHash: string;
      frameArtifact: { sha256: string };
    };
    player: {
      tick: number;
      stateHash: string;
      frameArtifact: { sha256: string };
    };
    comparison: { mismatches: unknown[] };
  }>('runtime.compare_player', {
    checkpointId: 'recorded-combat',
    inputLogId: exported.inputLogId,
    width: 640,
    height: 360,
  });
  assert.equal(longParity.studio.tick, 551);
  assert.equal(longParity.player.tick, 551);
  assert.equal(longParity.studio.stateHash, exported.stateHash);
  assert.equal(longParity.player.stateHash, exported.stateHash);
  assert.deepEqual(longParity.comparison.mismatches, []);
  assert.equal(
    longParity.studio.frameArtifact.sha256,
    longParity.player.frameArtifact.sha256,
  );
  const packageFiles = (
    readdirSync(join(projectRoot, 'out/windows-development'), {
      recursive: true,
    }) as string[]
  ).filter((path) =>
    path.replaceAll('\\', '/').endsWith('/game/player-package.json'),
  );
  assert.equal(packageFiles.length, 1);
  const packaged = JSON.parse(
    readFileSync(
      join(projectRoot, 'out/windows-development', packageFiles[0]),
      'utf8',
    ),
  ) as { prefabs: Record<string, unknown> };
  assert(
    packaged.prefabs['prefabs/player-shell.prefab.json'],
    'firing requires actual packaged Prefab definitions, not only a reachability list',
  );
  await rejectCall(
    { checkpointId: 'override', inputLogId: exported.inputLogId, ticks: 1 },
    'RUNTIME_INPUT_LOG_OVERRIDE_FORBIDDEN',
  );
  const logPath = join(
    projectRoot,
    '.aigame/local/runtime-input-logs',
    `${exported.inputLogId.slice(10)}.json`,
  );
  const sourceLog = readFileSync(logPath, 'utf8');
  writeFileSync(logPath, sourceLog.replace('20260905', '20260904'));
  await rejectCall(
    { checkpointId: 'tampered', inputLogId: exported.inputLogId },
    'RUNTIME_INPUT_LOG_TAMPERED',
  );
  writeFileSync(logPath, sourceLog);
  const projectFile = join(projectRoot, 'project.aigame.json');
  const projectSource = readFileSync(projectFile, 'utf8');
  writeFileSync(projectFile, projectSource + '\n');
  await rejectCall(
    { checkpointId: 'stale', inputLogId: exported.inputLogId },
    'RUNTIME_INPUT_LOG_REVISION_CONFLICT',
  );
  writeFileSync(projectFile, projectSource);

  for (const path of [
    join(projectRoot, '.agents', 'skills', 'repair-game-failure', 'SKILL.md'),
    join(projectRoot, '.agents', 'skills', 'build-and-test-game', 'SKILL.md'),
  ]) {
    const skill = readFileSync(path, 'utf8');
    for (const instruction of [
      'runtime.capture_frame',
      'runtime.navigate_checkpoint',
      'runtime.compare_player',
      'before/after',
      'ChangeSet',
    ]) {
      assert(skill.includes(instruction), `${path} omitted ${instruction}`);
    }
  }

  child.kill();
  await new Promise<void>((resolveExit) => {
    if (child.exitCode !== null) resolveExit();
    else child.once('exit', () => resolveExit());
  });
  runningChild = null;
  console.log(
    JSON.stringify(
      {
        gate: 'P30 project Codex runtime observation bridge',
        addressableFrame: navigated.observation.observationId,
        comparableStudioPlayer: true,
        sameInputLog: parity.studio.inputLogId,
        recordedCombatTicks: 551,
        durableInputLog: exported.inputLogId,
        missingTamperedStaleAndOverriddenLogsRejected: true,
        forbiddenScreenAndPrivateHandlesAbsent: true,
        projectSkillDecisionPath: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  if (runningChild) {
    runningChild.kill();
    await new Promise<void>((resolveExit) => {
      if (runningChild?.exitCode !== null) resolveExit();
      else runningChild?.once('exit', () => resolveExit());
    });
  }
  rmSync(temporary, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
