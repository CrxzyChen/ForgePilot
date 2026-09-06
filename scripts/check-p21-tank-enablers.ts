import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { capabilitiesFor } from '../studio/capabilities/capability-registry.ts';
import { deriveStudioPlanFromText } from '../studio/electron/codex-process-manager.ts';
import { ProjectManager } from '../studio/project/project-manager.ts';
import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p21-'));
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');
const scriptHostPath = join(
  repository,
  'target',
  'debug',
  'project-script-host.exe',
);

function json(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

try {
  assert.deepEqual(
    deriveStudioPlanFromText(
      `Progress update.\n\nSTUDIO_PLAN\n- [completed] Inspect baseline\n- [in_progress] Build Arena scene\n- [pending] Package release\n`,
    ),
    [
      { step: 'Inspect baseline', status: 'completed' },
      { step: 'Build Arena scene', status: 'inProgress' },
      { step: 'Package release', status: 'pending' },
    ],
  );
  assert.deepEqual(
    deriveStudioPlanFromText(
      `STUDIO_PLAN\n- [completed] Inspect baseline\n- [in_progress] Build Arena scene\n\nSTUDIO_PLAN\n- [completed] Inspect baseline\n- [completed] Build Arena scene\n- [in_progress] Package release\n`,
    ),
    [
      { step: 'Inspect baseline', status: 'completed' },
      { step: 'Build Arena scene', status: 'completed' },
      { step: 'Package release', status: 'inProgress' },
    ],
  );
  assert.deepEqual(
    deriveStudioPlanFromText(
      '当前持续计划：①能力对齐（已完成）→ ②场景制作（执行中）→ ③发布验收',
    ),
    [
      { step: '能力对齐', status: 'completed' },
      { step: '场景制作', status: 'inProgress' },
      { step: '发布验收', status: 'pending' },
    ],
  );

  const parent = join(temporary, 'projects');
  mkdirSync(parent, { recursive: true });
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: join(temporary, 'studio-data'),
    engineVersion: '0.2.0-alpha.1',
  });
  const project = manager.createProject({
    parentDirectory: parent,
    directoryName: 'tank-enablers',
    name: 'Tank Enablers',
    preset: 'empty-2d',
    initializeGit: false,
  });
  const root = project.root;

  json(join(root, 'scenes', 'main.game.json'), {
    schemaVersion: '2.0.0-alpha.1',
    id: 'p21:scene/main',
    name: 'Main',
    space: '2d',
    objects: [
      {
        id: 'p21:object/controller',
        name: 'Controller',
        enabled: true,
        visible: true,
        locked: false,
        parentId: null,
        order: 0,
        components: [
          {
            id: 'p21:component/controller-script',
            type: 'core:script',
            enabled: true,
            data: {
              path: 'scripts/behaviors/controller.ts',
              enabled: true,
            },
          },
          {
            id: 'p21:component/controller-prefab-instance',
            type: 'core:prefab-instance',
            enabled: true,
            data: {
              path: 'prefabs/controller.prefab.json',
              sourceObjectId: 'p21:prefab-root/controller',
            },
          },
        ],
      },
    ],
  });
  json(join(root, 'scenes', 'game-over.game.json'), {
    schemaVersion: '2.0.0-alpha.1',
    id: 'p21:scene/game-over',
    name: 'Game Over',
    space: '2d',
    objects: [
      {
        id: 'p21:object/game-over-label',
        name: 'Game Over Label',
        enabled: true,
        visible: true,
        locked: false,
        parentId: null,
        order: 0,
        components: [
          {
            id: 'p21:component/game-over-transform',
            type: 'core:transform2d',
            enabled: true,
            data: {
              position: { x: 16, y: 9 },
              rotation: 0,
              scale: { x: 1, y: 1 },
            },
          },
          {
            id: 'p21:component/game-over-text',
            type: 'render:text2d',
            enabled: true,
            data: {
              text: 'GAME OVER',
              fontSize: 1.5,
              color: '#ffffff',
              align: 'center',
            },
          },
        ],
      },
    ],
  });
  mkdirSync(join(root, 'scripts', 'behaviors'), { recursive: true });
  writeFileSync(
    join(root, 'scripts', 'behaviors', 'controller.ts'),
    `import { defineBehavior } from '@aigame/sdk';
export default defineBehavior({
  onFixedUpdate(context) {
    if (context.tick === 0) {
      context.spawn({
        id: 'p21:object/projectile-001',
        name: 'Projectile',
        components: [
          { id: 'p21:component/projectile-transform', type: 'core:transform2d', data: { position: { x: 4, y: 5 }, rotation: 0, scale: { x: 1, y: 1 } } },
          { id: 'p21:component/projectile-shape', type: 'render:shape2d', data: { shape: 'rectangle', size: { x: 0.4, y: 0.4 }, color: '#ffd166' } },
        ],
      });
    }
    if (context.tick === 1) context.setVisible('p21:object/projectile-001', false);
    if (context.tick === 2) context.setEnabled('p21:object/projectile-001', false);
    if (context.tick === 3) context.destroy('p21:object/projectile-001');
    if (context.tick === 4) context.loadScene('p21:scene/game-over');
  },
});
`,
    'utf8',
  );
  json(join(root, 'scripts', 'runtime.json'), {
    schemaVersion: '2.0.0-alpha.1',
    sdkVersion: '0.2.0-alpha.1',
    modules: [
      {
        id: 'p21:behavior/controller',
        kind: 'behavior',
        source: 'scripts/behaviors/controller.ts',
      },
    ],
    systems: [],
    commands: [],
    events: [],
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
    scriptHostPath,
  });
  const first = runtime.run({ ticks: 6, seed: 21, persistTrace: false });
  assert.equal(first.status, 'completed');
  assert.equal(first.activeScene, 'scenes/game-over.game.json');
  assert.equal(first.scene.id, 'p21:scene/game-over');
  assert.equal(first.scene.objects[0]?.components[1]?.type, 'render:text2d');
  for (const kind of [
    'lifecycle:spawn:applied',
    'lifecycle:visible:applied',
    'lifecycle:enabled:applied',
    'lifecycle:destroy:applied',
    'lifecycle:load-scene:applied',
  ]) {
    assert(
      first.timeline.some((entry) => entry.kind === kind),
      kind,
    );
  }
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const repeated = runtime.run({ ticks: 6, seed: 21, persistTrace: false });
    assert.equal(repeated.stateHash, first.stateHash);
    assert.deepEqual(repeated.snapshots, first.snapshots);
  }

  const twoDimensional = capabilitiesFor(['2d']).find(
    (capability) => capability.id === '2d',
  );
  const userInterface = capabilitiesFor(['ui']).find(
    (capability) => capability.id === 'ui',
  );
  assert(
    twoDimensional?.components.some((item) => item.type === 'render:text2d'),
  );
  assert(
    capabilitiesFor(['2d'])
      .find((capability) => capability.id === 'core')
      ?.components.some((item) => item.type === 'core:prefab-instance'),
  );
  assert(userInterface?.components.some((item) => item.type === 'ui:text'));
  const sdk = readFileSync(join(root, 'scripts', 'game-sdk.d.ts'), 'utf8');
  for (const marker of [
    'spawn(object: RuntimeObject)',
    'destroy(object?: ObjectId)',
    'setEnabled(object: ObjectId',
    'setVisible(object: ObjectId',
    'loadScene(scene: string, options?: SceneLoadOptions)',
  ]) {
    assert(sdk.includes(marker), marker);
  }

  const mcpInput =
    [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'collision.define_rule',
          arguments: {
            a: 'tank',
            b: 'projectile',
            response: 'event',
          },
        },
      },
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
        AIGAME_STUDIO_KERNEL_CLI: kernelCliPath,
        AIGAME_STUDIO_SCRIPT_HOST: scriptHostPath,
      },
    },
  );
  assert.equal(mcp.status, 0, mcp.stderr || mcp.error?.message);
  assert.match(mcp.stdout, /collision\.define_rule/u);
  assert.match(mcp.stdout, /awaitingApproval/u);

  const registry = new StudioCommandRegistry({
    projectRoot: root,
    kernelCliPath,
    scriptHostPath,
  });
  const changes = new StudioChangeSetService({
    projectRoot: root,
    kernelCliPath,
    registry,
  });
  const collisionChange = changes
    .list()
    .find((change) =>
      change.operations.some(
        (operation) => operation.command === 'collision.define_rule',
      ),
    );
  assert(collisionChange);
  changes.approve(collisionChange.id);
  changes.apply(collisionChange.id);
  assert(existsSync(join(root, 'physics', 'collision-layers.json')));
  assert.match(
    readFileSync(join(root, 'physics', 'collision-layers.json'), 'utf8'),
    /"response": "event"/u,
  );

  const codexManager = readFileSync(
    join(repository, 'studio', 'electron', 'codex-process-manager.ts'),
    'utf8',
  );
  for (const marker of [
    "'thread/goal/updated'",
    "'thread/goal/cleared'",
    "'thread/goal/clear'",
    'stopGoal()',
    'clearGoal()',
    'goalPlan:',
    'deriveStudioPlanFromText',
    'STUDIO_PLAN',
    "this.#state.goal.status !== 'active'",
    "this.#state.goal.status !== 'complete'",
  ]) {
    assert(codexManager.includes(marker), marker);
  }
  const workbench = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'Workbench.tsx'),
    'utf8',
  );
  for (const marker of [
    'copilot-progress',
    'copilot-running-goal',
    'copilot-running-plan',
    'window.aiGameStudio.codex.stopGoal()',
    'window.aiGameStudio.codex.clearGoal()',
    "codex.goal.status !== 'active'",
    'codex.goalPlan',
  ]) {
    assert(workbench.includes(marker), marker);
  }

  const emptyRuntime = JSON.parse(
    readFileSync(
      join(
        repository,
        'templates',
        'empty',
        'files',
        'scripts',
        'runtime.json',
      ),
      'utf8',
    ),
  ) as { budgets?: { memoryBytes?: number } };
  assert.equal(emptyRuntime.budgets?.memoryBytes, 64 * 1024 * 1024);

  console.log(
    JSON.stringify(
      {
        gate: 'P21 Tank completion enablers',
        deterministicLifecycle: true,
        runtimeSceneSwitch: true,
        text2dAndUi: true,
        collisionMcpChangeSet: true,
        copilotLiveGoalPlan: true,
        goalStopAndRemove: true,
        goalModeResumesGoal: true,
        longReplayMemoryDefault: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
