import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectManager } from '../studio/project/project-manager.ts';
import {
  ProjectScriptRuntime,
  type ProjectRuntimeResult,
} from '../studio/runtime/project-script-runtime.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p18-'));

function json(path: string, value: unknown) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

try {
  const projects = join(temporary, 'projects');
  mkdirSync(projects, { recursive: true });
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: join(temporary, 'studio-data'),
    engineVersion: '0.2.0-alpha.1',
  });
  const project = manager.createProject({
    parentDirectory: projects,
    name: 'P18 Runtime Gate',
    directoryName: 'runtime-gate',
    preset: 'empty-2d',
    initializeGit: false,
  });
  const root = project.root;
  const objectId = 'p18:object/player';

  json(join(root, 'capabilities', 'components.json'), {
    schemaVersion: '2.0.0-alpha.1',
    components: [
      {
        type: 'p18:velocity',
        label: 'Velocity',
        fields: [{ name: 'x', type: 'number', default: 0 }],
      },
      {
        type: 'p18:stats',
        label: 'Runtime Stats',
        fields: [
          'starts',
          'enables',
          'inputs',
          'commands',
          'events',
          'systemEvents',
          'collisionEnter',
          'collisionExit',
          'disables',
          'destroys',
        ].map((name) => ({ name, type: 'number', default: 0 })),
      },
    ],
  });
  json(join(root, 'scenes', 'main.game.json'), {
    schemaVersion: '2.0.0-alpha.1',
    id: 'p18:scene/main',
    name: 'Runtime Gate',
    space: '2d',
    objects: [
      {
        id: objectId,
        name: 'Player',
        enabled: true,
        visible: true,
        locked: false,
        parentId: null,
        order: 0,
        components: [
          {
            id: 'p18:component/transform',
            type: 'core:transform2d',
            enabled: true,
            data: {
              position: { x: 0, y: 0 },
              rotation: 0,
              scale: { x: 1, y: 1 },
            },
          },
          {
            id: 'p18:component/velocity',
            type: 'p18:velocity',
            enabled: true,
            data: { x: 2 },
          },
          {
            id: 'p18:component/stats',
            type: 'p18:stats',
            enabled: true,
            data: {
              starts: 0,
              enables: 0,
              inputs: 0,
              commands: 0,
              events: 0,
              systemEvents: 0,
              collisionEnter: 0,
              collisionExit: 0,
              disables: 0,
              destroys: 0,
            },
          },
          {
            id: 'p18:component/script',
            type: 'core:script',
            enabled: true,
            data: { path: 'scripts/behaviors/player.ts', enabled: true },
          },
        ],
      },
    ],
  });
  mkdirSync(join(root, 'scripts', 'behaviors'), { recursive: true });
  mkdirSync(join(root, 'scripts', 'systems'), { recursive: true });
  mkdirSync(join(root, 'scripts', 'events'), { recursive: true });
  writeFileSync(
    join(root, 'scripts', 'behaviors', 'player.ts'),
    `import { defineBehavior } from '@aigame/sdk';
type Transform = { position: { x: number; y: number }; rotation: number; scale: { x: number; y: number } };
type Velocity = { x: number };
type Stats = Record<string, number>;
const updateStats = (context: any, field: string) => {
  const stats = context.get('p18:stats') as Stats;
  context.set('p18:stats', { ...stats, [field]: stats[field] + 1 });
};
export default defineBehavior({
  onStart(context) { updateStats(context, 'starts'); },
  onEnable(context) {
    updateStats(context, 'enables');
    context.emit('p18:ready', { objectId: context.objectId });
  },
  onInput(action, value, context) { if (action === 'jump' && value > 0) updateStats(context, 'inputs'); },
  onCommand(command, context) {
    if (command.type === 'p18:boost') {
      const velocity = context.get('p18:velocity') as Velocity;
      context.set('p18:velocity', { x: velocity.x + Number((command.payload as any).amount) });
      updateStats(context, 'commands');
    }
  },
  onFixedUpdate(context) {
    const transform = context.get('core:transform2d') as Transform;
    const next = { ...transform, position: { ...transform.position, x: transform.position.x + 1 } };
    context.set('core:transform2d', next);
    context.emit('p18:moved', { objectId: context.objectId, x: next.position.x });
  },
  onEvent(event, context) { if (event.type === 'p18:ready' || event.type === 'p18:moved') updateStats(context, 'events'); },
  onCollisionEnter(_other, context) { updateStats(context, 'collisionEnter'); },
  onCollisionExit(_other, context) { updateStats(context, 'collisionExit'); },
  onDisable(context) { updateStats(context, 'disables'); },
  onDestroy(context) { updateStats(context, 'destroys'); },
  onFrame(context) { context.get('core:transform2d'); },
});
`,
    'utf8',
  );
  writeFileSync(
    join(root, 'scripts', 'systems', 'movement.ts'),
    `import { defineSystem } from '@aigame/sdk';
type Transform = { position: { x: number; y: number }; rotation: number; scale: { x: number; y: number } };
type Velocity = { x: number };
type Stats = Record<string, number>;
export const movement = defineSystem({
  onFixedUpdate(context) {
    for (const id of context.objects) {
      const transform = context.get(id, 'core:transform2d') as Transform;
      const velocity = context.get(id, 'p18:velocity') as Velocity;
      context.set(id, 'core:transform2d', { ...transform, position: { ...transform.position, x: transform.position.x + velocity.x } });
    }
  },
  onEvent(event, context) {
    if (event.type !== 'p18:moved') return;
    for (const id of context.objects) {
      const stats = context.get(id, 'p18:stats') as Stats;
      context.set(id, 'p18:stats', { ...stats, systemEvents: stats.systemEvents + 1 });
    }
  },
});
`,
    'utf8',
  );
  const objectPayload = {
    type: 'object',
    additionalProperties: false,
    required: ['objectId'],
    properties: { objectId: { type: 'string' } },
  };
  json(join(root, 'scripts', 'events', 'ready.schema.json'), objectPayload);
  json(join(root, 'scripts', 'events', 'moved.schema.json'), {
    type: 'object',
    additionalProperties: false,
    required: ['objectId', 'x'],
    properties: { objectId: { type: 'string' }, x: { type: 'number' } },
  });
  json(join(root, 'scripts', 'events', 'boost.schema.json'), {
    type: 'object',
    additionalProperties: false,
    required: ['amount'],
    properties: { amount: { type: 'number' } },
  });
  json(join(root, 'scripts', 'runtime.json'), {
    schemaVersion: '2.0.0-alpha.1',
    sdkVersion: '0.2.0-alpha.1',
    modules: [
      {
        id: 'p18:behavior/player',
        kind: 'behavior',
        source: 'scripts/behaviors/player.ts',
      },
      {
        id: 'p18:system/movement-module',
        kind: 'system',
        source: 'scripts/systems/movement.ts',
      },
    ],
    systems: [
      {
        id: 'p18:system/movement',
        module: 'p18:system/movement-module',
        export: 'movement',
        phase: 'engine:fixed-update',
        order: 10,
        query: ['core:transform2d', 'p18:velocity'],
      },
    ],
    commands: [
      {
        id: 'p18:boost',
        payloadSchema: 'scripts/events/boost.schema.json',
      },
    ],
    events: [
      {
        id: 'p18:ready',
        payloadSchema: 'scripts/events/ready.schema.json',
      },
      {
        id: 'p18:moved',
        payloadSchema: 'scripts/events/moved.schema.json',
      },
    ],
    schedule: [
      'engine:input',
      'engine:pre-update',
      'engine:fixed-update',
      'engine:physics',
      'engine:collision-events',
      'engine:gameplay-events',
      'engine:post-update',
      'engine:snapshot',
      'engine:presentation',
    ],
    budgets: {
      memoryBytes: 16 * 1024 * 1024,
      stackBytes: 512 * 1024,
      instructionsPerTick: 100_000,
      eventsPerTick: 64,
    },
    hotReload: 'restart-authoritative',
  });

  const runtime = new ProjectScriptRuntime({
    projectRoot: root,
    scriptHostPath: join(
      repository,
      'target',
      'debug',
      'project-script-host.exe',
    ),
  });
  const options = {
    ticks: 4,
    seed: 42,
    inputs: [{ tick: 1, action: 'jump', value: 1 }],
    commands: [{ tick: 1, type: 'p18:boost', payload: { amount: 1 } }],
    controls: [
      { tick: 3, action: 'disable' as const, objectId },
      { tick: 3, action: 'destroy' as const, objectId },
    ],
    watches: ['objects.0.components.0.data.position.x'],
    persistTrace: false,
  };
  const first = runtime.run(options);
  assert.equal(first.status, 'completed');
  assert.equal(first.diagnostics.length, 0);
  assert.equal(first.scene.objects.length, 0);
  const beforeRemoval = first.snapshots.find(
    (snapshot) => snapshot.tick === 2,
  )!;
  const components = beforeRemoval.scene.objects[0]!.components;
  const transform = components.find(
    (component) => component.type === 'core:transform2d',
  )!.data as { position: { x: number } };
  const stats = components.find((component) => component.type === 'p18:stats')!
    .data as Record<string, number>;
  assert.equal(transform.position.x, 11);
  assert.deepEqual(stats, {
    starts: 1,
    enables: 1,
    inputs: 1,
    commands: 1,
    events: 4,
    systemEvents: 3,
    collisionEnter: 0,
    collisionExit: 0,
    disables: 0,
    destroys: 0,
  });
  for (const hook of [
    'onStart',
    'onEnable',
    'onFixedUpdate',
    'onFrame',
    'onInput',
    'onCommand',
    'onEvent',
    'onDisable',
    'onDestroy',
  ])
    assert(
      first.timeline.some((entry) => entry.hook === hook),
      hook,
    );
  assert(
    first.timeline.some(
      (entry) => entry.kind === 'event:deliver' && entry.type === 'p18:moved',
    ),
  );
  assert.equal(first.systemTrace.length >= 8, true);
  assert.equal(first.snapshots.length, 4);
  assert.equal(first.watches.length, 4);
  assert(first.budgets.memoryUsedBytes > 0);
  assert(first.bundle.outputHash.length === 64);

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const repeated = runtime.run(options);
    assert.equal(repeated.stateHash, first.stateHash);
    assert.deepEqual(repeated.snapshots, first.snapshots);
  }

  const paused = runtime.run({
    ticks: 2,
    persistTrace: false,
    breakpoints: [
      {
        id: 'break:player-update',
        moduleId: 'p18:behavior/player',
        objectId,
        hook: 'onFixedUpdate',
        line: 10,
      },
    ],
  });
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pausedAt?.file, 'scripts/behaviors/player.ts');
  assert.equal(paused.pausedAt?.hook, 'onFixedUpdate');

  const replayFailure = runtime.run({
    ...options,
    persistTrace: false,
    expectedHashes: [{ tick: 2, stateHash: 'not-the-recorded-hash' }],
  });
  assert.equal(replayFailure.status, 'failed');
  const mismatch = replayFailure.diagnostics.find(
    (diagnostic) => diagnostic.code === 'REPLAY_HASH_MISMATCH',
  );
  assert.equal(mismatch?.tick, 2);
  assert.equal(mismatch?.phase, 'engine:snapshot');

  const registry = new StudioCommandRegistry({
    projectRoot: root,
    kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
    scriptHostPath: join(
      repository,
      'target',
      'debug',
      'project-script-host.exe',
    ),
  });
  registry.execute('debug.watch.set', {
    path: 'objects.0.components.0.data.position.x',
  });
  registry.execute('debug.breakpoint.set', {
    id: 'break:registry-player',
    moduleId: 'p18:behavior/player',
    hook: 'onFixedUpdate',
  });
  const registryPaused = registry.execute('runtime.start', {
    ticks: 2,
  }).data as ProjectRuntimeResult;
  assert.equal(registryPaused.status, 'paused');
  registry.execute('debug.breakpoint.remove', {
    id: 'break:registry-player',
  });
  const registryRun = registry.execute('runtime.start', options)
    .data as ProjectRuntimeResult;
  assert.equal(registryRun.stateHash, first.stateHash);
  assert.equal(registry.snapshot().runtime.watches?.length, 4);
  assert.equal(
    (registry.execute('runtime.read_trace').data as ProjectRuntimeResult)
      .stateHash,
    first.stateHash,
  );
  const reload = registry.execute('runtime.hot_reload').data as {
    policy: string;
  };
  assert.equal(reload.policy, 'restart-authoritative');

  const mcpInput =
    [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ]
      .map((value) => JSON.stringify(value))
      .join('\n') + '\n';
  const mcp = spawnSync(
    process.execPath,
    [
      join(repository, 'studio', 'server', 'engine-mcp-server.ts'),
      '--project',
      root,
    ],
    {
      cwd: repository,
      encoding: 'utf8',
      input: mcpInput,
      timeout: 30_000,
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
        AIGAME_STUDIO_ENGINE_VERSION: '0.2.0-alpha.1',
      },
    },
  );
  assert.equal(mcp.status, 0, mcp.stderr || mcp.error?.message);
  const list = mcp.stdout
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((message) => message.id === 2);
  assert(list);
  const mcpTools = (
    list.result as { tools: Array<{ name: string }> }
  ).tools.map((tool) => tool.name);
  for (const name of [
    'runtime.run',
    'runtime.read_trace',
    'runtime.hot_reload',
    'debug.breakpoint.set',
    'debug.watch.set',
    'replay.run',
  ])
    assert(mcpTools.includes(name), name);

  const failingSystemPath = join(root, 'scripts', 'systems', 'movement.ts');
  writeFileSync(
    failingSystemPath,
    `import { defineSystem } from '@aigame/sdk';
export const movement = defineSystem({
  onFixedUpdate() {
    throw new Error('intentional P18 failure');
  },
});
`,
    'utf8',
  );
  const failing = runtime.run({
    ticks: 1,
    persistTrace: false,
    expectedHashes: [{ tick: 0, stateHash: first.snapshots[0]!.stateHash }],
  });
  assert.equal(failing.status, 'failed');
  const diagnostic = failing.diagnostics[0]!;
  assert.equal(diagnostic.tick, 0);
  assert.equal(diagnostic.phase, 'engine:fixed-update');
  assert.equal(diagnostic.objectId, objectId);
  assert.equal(diagnostic.systemId, 'p18:system/movement');
  assert.equal(diagnostic.moduleId, 'p18:system/movement-module');
  assert.equal(diagnostic.file, 'scripts/systems/movement.ts');
  assert(diagnostic.line >= 1);
  assert.match(diagnostic.stack, /intentional P18 failure/u);

  assert.throws(
    () =>
      runtime.run({
        ticks: 1,
        persistTrace: false,
        commands: [
          { tick: 0, type: 'p18:boost', payload: { amount: 'wrong' } },
        ],
      }),
    /payload/u,
  );

  console.log(
    JSON.stringify(
      {
        gate: 'P18 project TypeScript runtime',
        lifecycleHooks: 11,
        stableSystemOrder: true,
        queuedTypedEvents: true,
        repeatedRuns: 101,
        authoritativeHash: first.stateHash,
        breakpointsAndWatches: true,
        studioCommandRegistry: true,
        engineMcpParity: true,
        failingReplayDiagnostic: mismatch,
        scriptDiagnostic: {
          tick: diagnostic.tick,
          phase: diagnostic.phase,
          moduleId: diagnostic.moduleId,
          systemId: diagnostic.systemId,
          objectId: diagnostic.objectId,
          file: diagnostic.file,
          line: diagnostic.line,
        },
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
