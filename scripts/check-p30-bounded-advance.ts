import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  ProjectScriptRuntime,
  type RunProjectOptions,
} from '../studio/runtime/project-script-runtime.ts';
import { RuntimeSessionService } from '../studio/runtime/runtime-session-service.ts';
import {
  saveRuntimeInputLog,
  readRuntimeInputLog,
} from '../studio/runtime/runtime-input-log.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import type { RuntimeSessionSummary } from '../studio/workspace/workspace-types.ts';
import type { ProjectRuntimeResult } from '../studio/runtime/project-script-runtime.ts';

const repository = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p30-bounded-'));
const projectRoot = join(temporary, 'pong');
const executable = (name: string) =>
  join(
    repository,
    'target',
    'debug',
    name + (process.platform === 'win32' ? '.exe' : ''),
  );
const scriptHostPath = executable('project-script-host');
const kernelCliPath = executable('kernelctl');
let child: ReturnType<typeof spawn> | undefined;
let registry: StudioCommandRegistry | undefined;

try {
  cpSync(join(repository, 'examples/pong-2d'), projectRoot, {
    recursive: true,
    filter: (path) =>
      !['.aigame', '.git', 'out', 'dist'].includes(
        path.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  class RecordingRuntime extends ProjectScriptRuntime {
    revisionReads = 0;
    override projectRevision() {
      this.revisionReads += 1;
      return super.projectRevision();
    }
  }
  const runtime = new RecordingRuntime({ projectRoot, scriptHostPath });
  const session = new RuntimeSessionService(runtime);
  const inputs = [
    { tick: 7, action: 'left-up', value: 1 },
    { tick: 150, action: 'left-up', value: 0 },
  ];
  const full = runtime.run({
    ticks: 221,
    seed: 20260905,
    inputs,
    persistTrace: false,
  });
  assert.equal(full.status, 'completed');
  session.start({ ticks: 1, seed: 20260905, persistTrace: false });
  assert.throws(() => session.advancePaused(2), /暂停|paused/iu);
  session.pause();
  for (const input of inputs) session.queueInput(input);
  const generation = session.generation;
  const snapshots = [...(session.result?.snapshots ?? [])];
  for (const ticks of [0, -1, 1.5, 201, Number.NaN]) {
    const before = session.stateMessage('test');
    assert.throws(() => session.advancePaused(ticks));
    assert.deepEqual(
      session.stateMessage('test'),
      before,
      'invalid batch must not mutate session',
    );
  }
  for (const ticks of [100, 120]) {
    const result = session.advancePaused(ticks);
    assert.equal(result.status, 'completed');
    assert.equal(session.state, 'paused');
    assert.equal(session.generation, generation);
    snapshots.push(...result.snapshots);
  }
  assert.equal(session.tick, 221);
  assert.equal(
    runtime.revisionReads,
    1,
    'live batches must not reread every asset for revision hashing',
  );
  assert.equal(session.result?.stateHash, full.stateHash);
  const recorded = session.exportInputLog();
  assert.deepEqual(
    recorded.request.inputs,
    inputs,
    'consumed queued inputs must remain exportable',
  );
  assert.equal(recorded.tick, 221);
  const saved = saveRuntimeInputLog(projectRoot, recorded);
  assert.deepEqual(readRuntimeInputLog(projectRoot, saved.inputLogId), saved);
  assert.throws(
    () => readRuntimeInputLog(projectRoot, 'checkpoint:win'),
    /ID/u,
  );
  const replayed = runtime.run({ ...recorded.request, persistTrace: false });
  assert.equal(replayed.stateHash, recorded.stateHash);
  const logSchema = JSON.parse(
    readFileSync(
      join(repository, 'schemas/runtime-input-log.schema.json'),
      'utf8',
    ),
  ) as { required: string[]; properties: { request: { required: string[] } } };
  assert.deepEqual(Object.keys(saved).sort(), [...logSchema.required].sort());
  assert.deepEqual(
    Object.keys(saved.request).sort(),
    [...logSchema.properties.request.required].sort(),
  );
  assert.deepEqual(
    snapshots,
    full.snapshots,
    'all batch snapshots must match continuous execution',
  );
  for (const key of [
    'scene',
    'randomState',
    'pendingEvents',
    'pendingLifecycle',
    'physicsContacts',
  ] as const)
    assert.deepEqual(session.result?.[key], full[key], key);
  const step = session.step();
  assert.equal(step.tick, 222, 'existing single step remains exactly one Tick');

  const ordered = new RuntimeSessionService(runtime);
  ordered.start({
    ticks: 1,
    seed: 20260905,
    inputs: [{ tick: 2, action: 'left-up', value: 1 }],
    persistTrace: false,
  });
  ordered.pause();
  ordered.queueInput({ tick: 2, action: 'left-up', value: 0 });
  ordered.queueInput({ tick: 20, action: 'left-up', value: 1 });
  ordered.advancePaused(5);
  const orderedLog = ordered.exportInputLog();
  assert.deepEqual(orderedLog.request.inputs, [
    { tick: 2, action: 'left-up', value: 1 },
    { tick: 2, action: 'left-up', value: 0 },
  ]);
  assert.equal(
    runtime.run({ ...orderedLog.request, persistTrace: false }).stateHash,
    orderedLog.stateHash,
    'same-Tick base/queued ordering must replay exactly; future inputs are not consumed',
  );
  const revisionFile = join(projectRoot, 'project.aigame.json');
  const revisionSource = readFileSync(revisionFile, 'utf8');
  const mixedRevision = JSON.parse(revisionSource) as { name: string };
  mixedRevision.name += ' mixed-version probe';
  writeFileSync(revisionFile, JSON.stringify(mixedRevision));
  assert.throws(() => ordered.exportInputLog(), /项目已改变/u);
  ordered.advancePaused(1);
  writeFileSync(revisionFile, revisionSource);
  assert.throws(
    () => ordered.exportInputLog(),
    /完整/u,
    'changing then restoring project does not repair a mixed-version recording',
  );
  ordered.restart(1);
  ordered.pause();
  assert.equal(
    ordered.exportInputLog().request.inputs.length,
    0,
    'restart begins a fresh generation without prior consumed inputs',
  );

  class FailureProbeRuntime extends ProjectScriptRuntime {
    failure: 'hash' | 'throw' | null = null;
    override run(options: RunProjectOptions = {}) {
      if (this.failure === 'throw')
        throw new Error('simulated host transport failure');
      return super.run(
        this.failure === 'hash'
          ? {
              ...options,
              expectedHashes: [
                {
                  tick: options.startTick ?? 0,
                  stateHash: 'deliberately-wrong-hash',
                },
              ],
            }
          : options,
      );
    }
  }
  const failureRuntime = new FailureProbeRuntime({
    projectRoot,
    scriptHostPath,
  });
  const failedSession = new RuntimeSessionService(failureRuntime);
  failedSession.start({
    ticks: 1,
    seed: 20260905,
    persistTrace: false,
  });
  failedSession.pause();
  failureRuntime.failure = 'hash';
  const failure = failedSession.advancePaused(10);
  assert.equal(failure.status, 'failed');
  assert(
    failure.diagnostics.some((item) => item.code === 'REPLAY_HASH_MISMATCH'),
  );
  assert.equal(failedSession.state, 'failed');
  assert.throws(() => failedSession.advancePaused(1));
  failureRuntime.failure = null;
  failedSession.restart(1);
  failedSession.pause();
  assert.equal(
    failedSession.advancePaused(1).tick,
    2,
    'explicit restart recovers a failed batch',
  );
  failureRuntime.failure = 'throw';
  assert.throws(() => failedSession.advancePaused(1), /transport failure/u);
  assert.equal(
    failedSession.state,
    'failed',
    'transport failure must not leave a stepping session',
  );

  registry = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath,
    scriptHostPath,
  });
  registry.execute('runtime.step_tick');
  const initial = registry.snapshot().runtime;
  const request = {
    sessionId: initial.sessionId,
    generation: initial.generation,
    expectedTick: initial.tick,
    ticks: 20,
  };
  for (const bad of [
    { ...request, ticks: 201 },
    { ...request, ticks: '20' },
    { ...request, expectedTick: 99 },
    { ...request, sessionId: 'session:stale' },
    { ...request, generation: 0 },
  ]) {
    assert.throws(() => registry!.execute('runtime.advance_ticks', bad));
    assert.deepEqual(
      registry.snapshot().runtime,
      initial,
      'rejected request leaves checkpoint untouched',
    );
  }
  registry.execute('runtime.advance_ticks', request);
  const advanced = registry.snapshot().runtime;
  assert.equal(advanced.tick, 21);
  assert.equal(advanced.status, 'paused');
  assert.throws(
    () => registry!.execute('runtime.advance_ticks', request),
    /冲突|conflict|Tick/iu,
  );
  await new Promise((resolveTimer) => setTimeout(resolveTimer, 150));
  assert.deepEqual(
    registry.snapshot().runtime,
    advanced,
    'bounded command must not start the live timer',
  );
  const sourcePath = join(projectRoot, 'scripts/systems/ball.ts');
  const preservedSource = sourcePath + '.probe-backup';
  renameSync(sourcePath, preservedSource);
  try {
    assert.throws(() =>
      registry!.execute('runtime.advance_ticks', {
        ...request,
        expectedTick: 21,
      }),
    );
    assert.equal(
      registry.snapshot().runtime.status,
      'failed',
      'host/compile exception must be visible in the shared state',
    );
  } finally {
    renameSync(preservedSource, sourcePath);
  }
  registry.dispose();
  registry = undefined;

  child = spawn(
    process.execPath,
    [
      join(repository, 'studio/server/engine-mcp-server.ts'),
      '--project',
      projectRoot,
    ],
    {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AIGAME_STUDIO_KERNEL_CLI: kernelCliPath,
        AIGAME_STUDIO_SCRIPT_HOST: scriptHostPath,
      },
    },
  );
  let buffer = '';
  type RpcResponse = {
    id: number;
    error?: unknown;
    result?: {
      isError?: boolean;
      structuredContent?: unknown;
      tools?: Array<{
        name: string;
        inputSchema: {
          properties: { ticks: { maximum: number } };
          required: string[];
        };
      }>;
    };
  };
  const pending = new Map<number, (value: RpcResponse) => void>();
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? '';
    for (const line of lines.filter(Boolean)) {
      const response = JSON.parse(line) as RpcResponse;
      pending.get(response.id)?.(response);
      pending.delete(response.id);
    }
  });
  let nextId = 0;
  const rpc = (method: string, params: Record<string, unknown>) =>
    new Promise<RpcResponse>((resolveResponse, reject) => {
      const id = ++nextId;
      const timer = setTimeout(
        () => reject(new Error('bounded advance MCP response timed out')),
        30_000,
      );
      pending.set(id, (value) => {
        clearTimeout(timer);
        resolveResponse(value);
      });
      child!.stdin!.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
      );
    });
  const call = async <T = unknown>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> => {
    const response = await rpc('tools/call', { name, arguments: args });
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    assert.equal(
      response.result?.isError,
      false,
      JSON.stringify(response.result?.structuredContent),
    );
    return response.result?.structuredContent as T;
  };
  const listed = await rpc('tools/list', {});
  const tool = listed.result?.tools?.find(
    (item) => item.name === 'runtime.advance_ticks',
  );
  assert(tool);
  assert.equal(tool.inputSchema.properties.ticks.maximum, 200);
  assert.deepEqual(tool.inputSchema.required, [
    'sessionId',
    'generation',
    'expectedTick',
    'ticks',
  ]);
  await call('runtime.step_tick');
  const before = await call<RuntimeSessionSummary>('runtime.read_state');
  const mcpRequest = {
    sessionId: before.sessionId,
    generation: before.generation,
    expectedTick: before.tick,
    ticks: 10,
  };
  const batch = await call<ProjectRuntimeResult>(
    'runtime.advance_ticks',
    mcpRequest,
  );
  assert.equal(batch.tick, before.tick + 10);
  assert.equal(batch.snapshots.length, 10);
  const checkpoint = await call<RuntimeSessionSummary>('runtime.read_state');
  assert.equal(checkpoint.status, 'paused');
  const duplicate = await rpc('tools/call', {
    name: 'runtime.advance_ticks',
    arguments: mcpRequest,
  });
  assert.equal(
    duplicate.result?.isError,
    true,
    'retrying an old Tick must not advance twice',
  );
  assert.deepEqual(await call('runtime.read_state'), checkpoint);
  child.stdin!.end();
  console.log(
    JSON.stringify({
      gate: 'P30 bounded paused advancement',
      snapshotsCompared: snapshots.length,
      singleStep: step.tick,
      boundedMaximum: 200,
      mcp: 'passed',
      duplicateRejected: true,
      result: 'passed',
    }),
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill();
    await new Promise<void>((resolveExit) => {
      if (child!.exitCode !== null || child!.signalCode !== null) resolveExit();
      else child!.once('exit', () => resolveExit());
    });
  }
  registry?.dispose();
  rmSync(temporary, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
