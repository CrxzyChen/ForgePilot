import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { ProjectManager } from '../studio/project/project-manager.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const examplesRoot = join(repository, 'examples');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');

type ProjectSpec = {
  directory: string;
  name: string;
  preset: 'empty-2d' | 'empty-3d';
  files: Record<string, unknown>;
};

const schedule = [
  'engine:input',
  'engine:pre-update',
  'engine:fixed-update',
  'engine:physics',
  'engine:collision-events',
  'engine:gameplay-events',
  'engine:post-update',
  'engine:snapshot',
  'engine:presentation',
];

function component(
  id: string,
  type: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return { id, type, enabled: true, data };
}

function object(
  id: string,
  name: string,
  order: number,
  components: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    id,
    name,
    enabled: true,
    visible: true,
    locked: false,
    parentId: null,
    order,
    components,
  };
}

function transform2d(id: string, x: number, y: number) {
  return component(`${id}/transform`, 'core:transform2d', {
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
  });
}

function shape2d(id: string, x: number, y: number, color: string) {
  return component(`${id}/shape`, 'render:shape2d', {
    shape: 'rectangle',
    size: { x, y },
    color,
  });
}

function transform3d(
  id: string,
  position: { x: number; y: number; z: number },
  scale = { x: 1, y: 1, z: 1 },
) {
  return component(`${id}/transform`, 'core:transform3d', {
    position,
    rotation: { x: 0, y: 0, z: 0 },
    scale,
  });
}

function mesh3d(id: string, color: string) {
  return [
    component(`${id}/mesh`, 'render:mesh3d', {
      primitive: 'cube',
      material: '',
    }),
    component(`${id}/material`, 'render:material', {
      color,
      roughness: 0.65,
    }),
  ];
}

const pongScene = {
  schemaVersion: '2.0.0-alpha.1',
  id: 'pong:scene/main',
  name: 'Pong Arena',
  space: '2d',
  objects: [
    object('pong:camera', 'Camera', 0, [
      transform2d('pong:camera', 16, 9),
      component('pong:camera/camera', 'render:camera2d', {
        zoom: 1,
        primary: true,
      }),
    ]),
    object('pong:field', 'Field', 1, [
      transform2d('pong:field', 16, 9),
      shape2d('pong:field', 31.2, 17.2, '#10243d'),
    ]),
    object('pong:center-line', 'Center Line', 2, [
      transform2d('pong:center-line', 16, 9),
      shape2d('pong:center-line', 0.12, 16, '#34506f'),
    ]),
    object('pong:left-paddle', 'Left Paddle', 3, [
      transform2d('pong:left-paddle', 2.2, 9),
      shape2d('pong:left-paddle', 0.6, 3.6, '#59e3c1'),
      component('pong:left-paddle/collider', 'physics:collider2d', {
        shape: 'box',
        isTrigger: false,
      }),
      component('pong:left-paddle/paddle', 'pong:paddle', { side: 'left' }),
      component('pong:left-paddle/script', 'core:script', {
        path: 'scripts/behaviors/paddle.ts',
        enabled: true,
      }),
    ]),
    object('pong:right-paddle', 'Right Paddle', 4, [
      transform2d('pong:right-paddle', 29.8, 9),
      shape2d('pong:right-paddle', 0.6, 3.6, '#ffb65c'),
      component('pong:right-paddle/collider', 'physics:collider2d', {
        shape: 'box',
        isTrigger: false,
      }),
      component('pong:right-paddle/paddle', 'pong:paddle', { side: 'right' }),
      component('pong:right-paddle/script', 'core:script', {
        path: 'scripts/behaviors/paddle.ts',
        enabled: true,
      }),
    ]),
    object('pong:ball', 'Ball', 5, [
      transform2d('pong:ball', 16, 9),
      shape2d('pong:ball', 0.58, 0.58, '#f4f7ff'),
      component('pong:ball/collider', 'physics:collider2d', {
        shape: 'box',
        isTrigger: false,
      }),
      component('pong:ball/velocity', 'pong:velocity', { x: 0.11, y: 0.075 }),
    ]),
  ],
};

const pongFiles: ProjectSpec['files'] = {
  'scenes/main.game.json': pongScene,
  'capabilities/components.json': {
    schemaVersion: '2.0.0-alpha.1',
    components: [
      {
        type: 'pong:paddle',
        label: 'Pong Paddle',
        fields: [{ name: 'side', type: 'string', default: 'left' }],
      },
      {
        type: 'pong:velocity',
        label: 'Pong Velocity',
        fields: [
          { name: 'x', type: 'number', default: 0.1 },
          { name: 'y', type: 'number', default: 0.08 },
        ],
      },
    ],
  },
  'input/actions.json': {
    schemaVersion: '1.0.0',
    actions: [
      { id: 'left-up', bindings: ['KeyW'] },
      { id: 'left-down', bindings: ['KeyS'] },
      { id: 'right-up', bindings: ['ArrowUp'] },
      { id: 'right-down', bindings: ['ArrowDown'] },
    ],
  },
  'scripts/behaviors/paddle.ts': `import { defineBehavior } from '@aigame/sdk';
type Transform = { position: { x: number; y: number }; rotation: number; scale: { x: number; y: number } };
export default defineBehavior({
  onInput(action, value, context) {
    if (value <= 0) return;
    const paddle = context.get('pong:paddle') as { side: string };
    const up = paddle.side === 'left' ? 'left-up' : 'right-up';
    const down = paddle.side === 'left' ? 'left-down' : 'right-down';
    if (action !== up && action !== down) return;
    const transform = context.get('core:transform2d') as Transform;
    const y = Math.max(2, Math.min(16, transform.position.y + (action === up ? -0.8 : 0.8)));
    context.set('core:transform2d', { ...transform, position: { ...transform.position, y } });
  },
});
`,
  'scripts/systems/ball.ts': `import { defineSystem } from '@aigame/sdk';
type Transform = { position: { x: number; y: number }; rotation: number; scale: { x: number; y: number } };
type Velocity = { x: number; y: number };
export const updateBall = defineSystem({
  onFixedUpdate(context) {
    for (const id of context.objects) {
      const transform = context.get(id, 'core:transform2d') as Transform;
      const velocity = context.get(id, 'pong:velocity') as Velocity;
      let x = transform.position.x + velocity.x;
      let y = transform.position.y + velocity.y;
      let vx = velocity.x;
      let vy = velocity.y;
      if (y <= 0.7 || y >= 17.3) vy = -vy;
      if (x <= 2.7 || x >= 29.3) vx = -vx;
      if (x < 0 || x > 32) { x = 16; y = 9; vx = x < 0 ? 0.11 : -0.11; }
      context.set(id, 'core:transform2d', { ...transform, position: { x, y } });
      context.set(id, 'pong:velocity', { x: vx, y: vy });
    }
  },
});
`,
  'scripts/runtime.json': {
    schemaVersion: '2.0.0-alpha.1',
    sdkVersion: '0.2.0-alpha.1',
    modules: [
      {
        id: 'pong:behavior/paddle',
        kind: 'behavior',
        source: 'scripts/behaviors/paddle.ts',
      },
      {
        id: 'pong:system/ball-module',
        kind: 'system',
        source: 'scripts/systems/ball.ts',
      },
    ],
    systems: [
      {
        id: 'pong:system/ball',
        module: 'pong:system/ball-module',
        export: 'updateBall',
        phase: 'engine:fixed-update',
        order: 10,
        query: ['core:transform2d', 'pong:velocity'],
      },
    ],
    commands: [],
    events: [],
    schedule,
    budgets: {
      memoryBytes: 16777216,
      stackBytes: 524288,
      instructionsPerTick: 100000,
      eventsPerTick: 64,
    },
    hotReload: 'restart-authoritative',
  },
  'tests/pong-headless.test.json': {
    schemaVersion: '1.0.0',
    kind: 'runtime-scenario',
    ticks: 120,
    seed: 20260902,
    assertions: [
      'pong:ball Transform2D remains finite',
      'same seed produces same state hash',
    ],
  },
  'replays/smoke.replay.json': {
    schemaVersion: '1.0.0',
    seed: 20260902,
    ticks: 120,
    inputs: [],
  },
  'docs/BUILD_FROM_EMPTY.md':
    '# Pong 2D provenance\n\nCreated from the Empty 2D preset using only project files and Studio semantic commands. No engine source change is required.\n',
};

const collectObjects: Record<string, unknown>[] = [
  object('collect:camera', 'Camera', 0, [
    transform3d('collect:camera', { x: 7, y: 8, z: 12 }),
    component('collect:camera/camera', 'render:camera3d', {
      fieldOfView: 58,
      primary: true,
    }),
  ]),
  object('collect:light', 'Sun', 1, [
    transform3d('collect:light', { x: 3, y: 8, z: 2 }),
    component('collect:light/light', 'render:directional-light', {
      color: '#ffffff',
      intensity: 1.2,
    }),
  ]),
  object('collect:floor', 'Floor', 2, [
    transform3d('collect:floor', { x: 0, y: -1, z: 0 }, { x: 9, y: 0.3, z: 9 }),
    ...mesh3d('collect:floor', '#263b52'),
    component('collect:floor/collider', 'physics:collider3d', {
      shape: 'box',
      isTrigger: false,
    }),
  ]),
  object('collect:player', 'Player', 3, [
    transform3d('collect:player', { x: 0, y: 0, z: 0 }),
    ...mesh3d('collect:player', '#57e0bd'),
    component('collect:player/collider', 'physics:collider3d', {
      shape: 'box',
      isTrigger: false,
    }),
    component('collect:player/state', 'collect:player-state', { collected: 0 }),
    component('collect:player/script', 'core:script', {
      path: 'scripts/behaviors/player.ts',
      enabled: true,
    }),
  ]),
];
for (const [index, position] of [
  { x: -2, y: 0, z: -2 },
  { x: 2, y: 0, z: 1 },
  { x: 0, y: 0, z: 3 },
].entries()) {
  const id = `collect:item-${index + 1}`;
  collectObjects.push(
    object(id, `Collectible ${index + 1}`, 4 + index, [
      transform3d(id, position, { x: 0.55, y: 0.55, z: 0.55 }),
      ...mesh3d(id, '#ffcc66'),
      component(`${id}/collider`, 'physics:collider3d', {
        shape: 'box',
        isTrigger: true,
      }),
      component(`${id}/state`, 'collect:item', { active: true }),
    ]),
  );
}

const collectFiles: ProjectSpec['files'] = {
  'scenes/main.game.json': {
    schemaVersion: '2.0.0-alpha.1',
    id: 'collect:scene/main',
    name: 'Collect Room',
    space: '3d',
    objects: collectObjects,
  },
  'capabilities/components.json': {
    schemaVersion: '2.0.0-alpha.1',
    components: [
      {
        type: 'collect:player-state',
        label: 'Player State',
        fields: [{ name: 'collected', type: 'number', default: 0 }],
      },
      {
        type: 'collect:item',
        label: 'Collectible',
        fields: [{ name: 'active', type: 'boolean', default: true }],
      },
    ],
  },
  'input/actions.json': {
    schemaVersion: '1.0.0',
    actions: [
      { id: 'move-forward', bindings: ['KeyW', 'ArrowUp'] },
      { id: 'move-back', bindings: ['KeyS', 'ArrowDown'] },
      { id: 'move-left', bindings: ['KeyA', 'ArrowLeft'] },
      { id: 'move-right', bindings: ['KeyD', 'ArrowRight'] },
    ],
  },
  'scripts/behaviors/player.ts': `import { defineBehavior } from '@aigame/sdk';
type Transform = { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } };
export default defineBehavior({
  onInput(action, value, context) {
    if (value <= 0) return;
    const transform = context.get('core:transform3d') as Transform;
    const delta = action === 'move-forward' ? { x: 0, z: -0.7 } : action === 'move-back' ? { x: 0, z: 0.7 } : action === 'move-left' ? { x: -0.7, z: 0 } : action === 'move-right' ? { x: 0.7, z: 0 } : null;
    if (!delta) return;
    context.set('core:transform3d', { ...transform, position: { ...transform.position, x: Math.max(-4, Math.min(4, transform.position.x + delta.x)), z: Math.max(-4, Math.min(4, transform.position.z + delta.z)) } });
  },
  onFixedUpdate(context) {
    const player = context.get('core:transform3d') as Transform;
    let state = context.get('collect:player-state') as { collected: number };
    for (const id of context.query(['collect:item', 'core:transform3d'])) {
      const item = context.get(id, 'collect:item') as { active: boolean };
      if (!item.active) continue;
      const transform = context.get(id, 'core:transform3d') as Transform;
      const dx = transform.position.x - player.position.x;
      const dz = transform.position.z - player.position.z;
      if (dx * dx + dz * dz <= 0.8) {
        context.set(id, 'collect:item', { active: false });
        context.set(id, 'core:transform3d', { ...transform, scale: { x: 0.02, y: 0.02, z: 0.02 } });
        state = { collected: state.collected + 1 };
        context.set('collect:player-state', state);
        context.emit('collect:item-picked', { itemId: id, total: state.collected });
      }
    }
  },
});
`,
  'scripts/events/item-picked.schema.json': {
    type: 'object',
    additionalProperties: false,
    required: ['itemId', 'total'],
    properties: { itemId: { type: 'string' }, total: { type: 'number' } },
  },
  'scripts/runtime.json': {
    schemaVersion: '2.0.0-alpha.1',
    sdkVersion: '0.2.0-alpha.1',
    modules: [
      {
        id: 'collect:behavior/player',
        kind: 'behavior',
        source: 'scripts/behaviors/player.ts',
      },
    ],
    systems: [],
    commands: [],
    events: [
      {
        id: 'collect:item-picked',
        payloadSchema: 'scripts/events/item-picked.schema.json',
      },
    ],
    schedule,
    budgets: {
      memoryBytes: 16777216,
      stackBytes: 524288,
      instructionsPerTick: 100000,
      eventsPerTick: 64,
    },
    hotReload: 'restart-authoritative',
  },
  'tests/collect-room-headless.test.json': {
    schemaVersion: '1.0.0',
    kind: 'runtime-scenario',
    ticks: 60,
    seed: 20260902,
    assertions: ['3D Scene compiles', 'collect:item-picked payload is valid'],
  },
  'replays/smoke.replay.json': {
    schemaVersion: '1.0.0',
    seed: 20260902,
    ticks: 60,
    inputs: [],
  },
  'docs/BUILD_FROM_EMPTY.md':
    '# Collect Room 3D provenance\n\nCreated from the Empty 3D preset using project Components, TypeScript and semantic commands. The Alpha player uses a wgpu isometric primitive projection.\n',
};

const tankFiles: ProjectSpec['files'] = {
  'scenes/main.game.json': {
    schemaVersion: '2.0.0-alpha.1',
    id: 'tank:scene/main',
    name: 'Tank Arena Example',
    space: '2d',
    objects: [
      object('tank:field', 'Arena', 0, [
        transform2d('tank:field', 16, 9),
        shape2d('tank:field', 31, 17, '#172b36'),
      ]),
      object('tank:player', 'Player Tank', 1, [
        transform2d('tank:player', 16, 14),
        shape2d('tank:player', 1.2, 1.2, '#59e3c1'),
        component('tank:player/collider', 'physics:collider2d', {
          shape: 'box',
          isTrigger: false,
        }),
        component('tank:player/state', 'tank:unit', {
          team: 'player',
          health: 3,
        }),
        component('tank:player/script', 'core:script', {
          path: 'scripts/behaviors/player-tank.ts',
          enabled: true,
        }),
      ]),
      ...[-5, 0, 5].map((offset, index) =>
        object(`tank:enemy-${index + 1}`, `Enemy ${index + 1}`, 2 + index, [
          transform2d(`tank:enemy-${index + 1}`, 16 + offset, 3),
          shape2d(`tank:enemy-${index + 1}`, 1.2, 1.2, '#ff6d70'),
          component(`tank:enemy-${index + 1}/collider`, 'physics:collider2d', {
            shape: 'box',
            isTrigger: false,
          }),
          component(`tank:enemy-${index + 1}/state`, 'tank:unit', {
            team: 'enemy',
            health: 1,
          }),
        ]),
      ),
      object('tank:base', 'Base', 6, [
        transform2d('tank:base', 16, 16.2),
        shape2d('tank:base', 2.2, 1, '#ffcc66'),
      ]),
    ],
  },
  'capabilities/components.json': {
    schemaVersion: '2.0.0-alpha.1',
    components: [
      {
        type: 'tank:unit',
        label: 'Tank Unit',
        fields: [
          { name: 'team', type: 'string', default: 'neutral' },
          { name: 'health', type: 'number', default: 1 },
        ],
      },
    ],
  },
  'input/actions.json': {
    schemaVersion: '1.0.0',
    actions: [
      { id: 'move-up', bindings: ['KeyW', 'ArrowUp'] },
      { id: 'move-down', bindings: ['KeyS', 'ArrowDown'] },
      { id: 'move-left', bindings: ['KeyA', 'ArrowLeft'] },
      { id: 'move-right', bindings: ['KeyD', 'ArrowRight'] },
      { id: 'fire', bindings: ['Space'] },
    ],
  },
  'scripts/behaviors/player-tank.ts': `import { defineBehavior } from '@aigame/sdk';
type Transform = { position: { x: number; y: number }; rotation: number; scale: { x: number; y: number } };
export default defineBehavior({
  onInput(action, value, context) {
    if (value <= 0) return;
    if (action === 'fire') { context.emit('tank:fired', { unitId: context.objectId }); return; }
    const transform = context.get('core:transform2d') as Transform;
    const delta = action === 'move-up' ? { x: 0, y: -0.6 } : action === 'move-down' ? { x: 0, y: 0.6 } : action === 'move-left' ? { x: -0.6, y: 0 } : action === 'move-right' ? { x: 0.6, y: 0 } : null;
    if (!delta) return;
    context.set('core:transform2d', { ...transform, position: { x: Math.max(1, Math.min(31, transform.position.x + delta.x)), y: Math.max(1, Math.min(17, transform.position.y + delta.y)) } });
  },
});
`,
  'scripts/events/fired.schema.json': {
    type: 'object',
    additionalProperties: false,
    required: ['unitId'],
    properties: { unitId: { type: 'string' } },
  },
  'scripts/runtime.json': {
    schemaVersion: '2.0.0-alpha.1',
    sdkVersion: '0.2.0-alpha.1',
    modules: [
      {
        id: 'tank:behavior/player',
        kind: 'behavior',
        source: 'scripts/behaviors/player-tank.ts',
      },
    ],
    systems: [],
    commands: [],
    events: [
      { id: 'tank:fired', payloadSchema: 'scripts/events/fired.schema.json' },
    ],
    schedule,
    budgets: {
      memoryBytes: 16777216,
      stackBytes: 524288,
      instructionsPerTick: 100000,
      eventsPerTick: 64,
    },
    hotReload: 'restart-authoritative',
  },
  'tests/tank-example.test.json': {
    schemaVersion: '1.0.0',
    kind: 'runtime-scenario',
    ticks: 60,
    seed: 20260902,
    assertions: [
      'Tank project code stays under Examples',
      'fire emits typed Event',
    ],
  },
  'replays/smoke.replay.json': {
    schemaVersion: '1.0.0',
    seed: 20260902,
    ticks: 60,
    inputs: [{ tick: 1, action: 'fire', value: 1 }],
  },
  'docs/BUILD_FROM_EMPTY.md':
    '# Tank Arena Example provenance\n\nTank Arena is a normal Empty 2D project. Its Component, behavior, Event and content vocabulary is project-owned and is not a Studio preset or production-engine behavior.\n',
};

const projects: ProjectSpec[] = [
  {
    directory: 'pong-2d',
    name: 'Pong 2D',
    preset: 'empty-2d',
    files: pongFiles,
  },
  {
    directory: 'collect-room-3d',
    name: 'Collect Room 3D',
    preset: 'empty-3d',
    files: collectFiles,
  },
  {
    directory: 'tank-arena',
    name: 'Tank Arena Example',
    preset: 'empty-2d',
    files: tankFiles,
  },
];

for (const spec of projects) {
  const target = resolve(examplesRoot, spec.directory);
  const inside = relative(examplesRoot, target);
  if (!inside || inside.startsWith('..'))
    throw new Error(`unsafe example target: ${target}`);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(examplesRoot, { recursive: true });
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: join(repository, '.aigame-example-generator'),
    engineVersion: '0.2.0-alpha.1',
  });
  const project = manager.createProject({
    parentDirectory: examplesRoot,
    directoryName: spec.directory,
    name: spec.name,
    preset: spec.preset,
    initializeGit: false,
  });
  const registry = new StudioCommandRegistry({
    projectRoot: project.root,
    kernelCliPath,
  });
  for (const [path, value] of Object.entries(spec.files)) {
    const content =
      typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
    const existing = registry
      .snapshot()
      .files.some((file) => file.path === path);
    registry.execute(existing ? 'project.file.write' : 'project.file.create', {
      path,
      content,
      ...(existing ? { baseHash: registry.readText(path).hash } : {}),
    });
  }
  registry.execute('project.validate');
  manager.closeProject();
  rmSync(join(target, '.aigame'), { recursive: true, force: true });
  console.log(`generated ${spec.directory}`);
}

rmSync(join(repository, '.aigame-example-generator'), {
  recursive: true,
  force: true,
});
