import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectManager } from '../studio/project/project-manager.ts';
import {
  ProjectScriptRuntime,
  type ProjectRuntimeResult,
} from '../studio/runtime/project-script-runtime.ts';
import type { SceneDocument } from '../studio/workspace/scene-authoring-service.ts';

const repository = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p21-scene-transfer-'));
const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

try {
  const parent = join(temporary, 'projects');
  mkdirSync(parent);
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: join(temporary, 'studio-data'),
    engineVersion: '0.3.0-preview.1',
  });
  const { root } = manager.createProject({
    parentDirectory: parent,
    directoryName: 'transfer',
    name: 'Scene transfer',
    preset: 'empty-2d',
    initializeGit: false,
  });
  writeJson(join(root, 'capabilities/components.json'), {
    schemaVersion: '2.0.0-alpha.1',
    components: [
      {
        type: 'transfer:preferences',
        label: 'Preferences',
        fields: [
          { name: 'volume', type: 'number', default: 0.8 },
          { name: 'muted', type: 'boolean', default: false },
          { name: 'marker', type: 'string', default: '' },
        ],
      },
    ],
  });
  function scene(name: string): SceneDocument {
    return {
      schemaVersion: '2.0.0-alpha.1',
      id: `transfer:scene/${name}`,
      name,
      space: '2d',
      objects: [
        {
          id: `transfer:object/${name}`,
          name,
          enabled: true,
          visible: true,
          locked: false,
          parentId: null,
          order: 0,
          components: [
            {
              id: `transfer:component/${name}/preferences`,
              type: 'transfer:preferences',
              enabled: true,
              data: { volume: 0.8, muted: false, marker: name },
            },
            {
              id: `transfer:component/${name}/script`,
              type: 'core:script',
              enabled: true,
              data: { path: 'scripts/behaviors/transfer.ts', enabled: true },
            },
          ],
        },
      ],
    };
  }
  writeJson(join(root, 'scenes/main.game.json'), scene('menu'));
  writeJson(join(root, 'scenes/arena.game.json'), scene('arena'));
  const manifestPath = join(root, 'scripts/runtime.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.modules = [
    {
      id: 'transfer:behavior/settings',
      kind: 'behavior',
      source: 'scripts/behaviors/transfer.ts',
    },
  ];
  writeJson(manifestPath, manifest);
  mkdirSync(join(root, 'scripts/behaviors'), { recursive: true });
  const scriptPath = join(root, 'scripts/behaviors/transfer.ts');
  const script = `import { defineBehavior } from '@aigame/sdk';
export default defineBehavior({
  onStart(context) {
    const preferences = context.get<any>('transfer:preferences');
    context.setAudioBus('audio:bus/master', { volume: preferences.volume, muted: preferences.muted });
  },
  onInput(action, value, context) {
    if (value <= 0) return;
    const preferences = context.get<any>('transfer:preferences');
    if (action === 'configure') {
      context.set('transfer:preferences', { ...preferences, volume: 0.4, muted: true });
      return;
    }
    if (action === 'damage') {
      context.set('transfer:preferences', { ...preferences, marker: 'damaged-live-world' });
      return;
    }
    const target = action === 'return' ? 'menu' : 'arena';
    const patch = { objectId: 'transfer:object/' + target, componentId: 'transfer:component/' + target + '/preferences', data: { volume: preferences.volume, muted: preferences.muted } };
    const options: any = { componentOverrides: [patch] };
    if (action === 'missing-object') options.componentOverrides.push({ ...patch, objectId: 'transfer:object/missing' });
    if (action === 'missing-component') options.componentOverrides.push({ ...patch, componentId: 'transfer:component/missing' });
    if (action === 'duplicate') options.componentOverrides.push(patch);
    if (action === 'invalid-data') patch.data = [] as any;
    if (action === 'invalid-options') return (context as any).loadScene('transfer:scene/arena', []);
    if (action === 'legacy') return context.loadScene('transfer:scene/arena');
    (context as any).loadScene('transfer:scene/' + target, options);
    patch.data.volume = 0.99;
  },
});
`;
  writeFileSync(scriptPath, script);
  const runtime = new ProjectScriptRuntime({
    projectRoot: root,
    scriptHostPath: join(
      repository,
      'target/debug',
      process.platform === 'win32'
        ? 'project-script-host.exe'
        : 'project-script-host',
    ),
  });
  const inputs = [
    { tick: 0, action: 'configure', value: 1 },
    { tick: 1, action: 'start', value: 1 },
    { tick: 2, action: 'restart', value: 1 },
    { tick: 3, action: 'return', value: 1 },
  ];
  const preferences = (document: SceneDocument) =>
    document.objects[0].components.find(
      (c) => c.type === 'transfer:preferences',
    )!.data;
  const first = runtime.run({
    ticks: 5,
    seed: 21,
    inputs,
    persistTrace: false,
  });
  assert.equal(first.status, 'completed', JSON.stringify(first.diagnostics));
  for (const snapshot of first.snapshots) {
    assert.equal(
      preferences(snapshot.scene).volume,
      0.4,
      `volume at ${snapshot.tick}`,
    );
    assert.equal(
      preferences(snapshot.scene).muted,
      true,
      `mute at ${snapshot.tick}`,
    );
    const name = snapshot.tick === 1 || snapshot.tick === 2 ? 'arena' : 'menu';
    assert.equal(
      preferences(snapshot.scene).marker,
      name,
      'unrelated destination defaults preserved',
    );
    assert.equal(
      snapshot.scene.objects[0].components[0].id,
      `transfer:component/${name}/preferences`,
    );
  }
  const transitions = first.timeline.filter(
    (entry) => entry.kind === 'lifecycle:load-scene:applied',
  );
  assert.equal(transitions.length, 3);
  const startupEvents = first.audioEvents.filter((event) => event.tick > 0);
  assert.equal(
    startupEvents.length,
    6,
    'both audio properties observed on every destination onStart',
  );
  for (const event of startupEvents) {
    if (event.payload.action === 'set-volume')
      assert.equal(event.payload.volume, 0.4);
    if (event.payload.action === 'set-muted')
      assert.equal(event.payload.muted, true);
  }
  let previous: ProjectRuntimeResult | undefined;
  for (let tick = 0; tick < 5; tick++) {
    previous = runtime.run({
      ticks: 1,
      seed: 21,
      inputs,
      startTick: tick,
      started: tick > 0,
      ...(previous
        ? {
            sceneState: previous.scene,
            activeScene: previous.activeScene,
            randomState: previous.randomState,
            pendingEvents: previous.pendingEvents,
            pendingLifecycle: previous.pendingLifecycle,
            physicsContacts: previous.physicsContacts,
          }
        : {}),
      persistTrace: false,
    });
    assert.equal(
      previous.status,
      'completed',
      JSON.stringify(previous.diagnostics),
    );
    assert.equal(
      previous.stateHash,
      first.snapshots[tick].stateHash,
      `split request at tick ${tick}`,
    );
  }
  for (let repetition = 0; repetition < 10; repetition++) {
    const repeated = runtime.run({
      ticks: 5,
      seed: 21,
      inputs,
      persistTrace: false,
    });
    assert.deepEqual(repeated.snapshots, first.snapshots);
    assert.deepEqual(repeated.audioEvents, first.audioEvents);
  }
  const reloadInputs = [
    { tick: 0, action: 'configure', value: 1 },
    { tick: 1, action: 'start', value: 1 },
    { tick: 2, action: 'damage', value: 1 },
    { tick: 3, action: 'restart', value: 1 },
    { tick: 4, action: 'return', value: 1 },
    { tick: 5, action: 'start', value: 1 },
  ];
  const reload = runtime.run({
    ticks: 6,
    seed: 21,
    inputs: reloadInputs,
    persistTrace: false,
  });
  assert.equal(reload.status, 'completed', JSON.stringify(reload.diagnostics));
  assert.equal(
    preferences(reload.snapshots[2].scene).marker,
    'damaged-live-world',
  );
  assert.equal(preferences(reload.snapshots[3].scene).marker, 'arena');
  assert.equal(preferences(reload.snapshots[5].scene).marker, 'arena');
  let reloadPrevious: ProjectRuntimeResult | undefined;
  const reloadAudio: ProjectRuntimeResult['audioEvents'] = [];
  for (let tick = 0; tick < 6; tick++) {
    reloadPrevious = runtime.run({
      ticks: 1,
      seed: 21,
      inputs: reloadInputs,
      startTick: tick,
      started: tick > 0,
      ...(reloadPrevious
        ? {
            sceneState: reloadPrevious.scene,
            activeScene: reloadPrevious.activeScene,
            randomState: reloadPrevious.randomState,
            pendingEvents: reloadPrevious.pendingEvents,
            pendingLifecycle: reloadPrevious.pendingLifecycle,
            physicsContacts: reloadPrevious.physicsContacts,
          }
        : {}),
      persistTrace: false,
    });
    assert.equal(
      reloadPrevious.status,
      'completed',
      JSON.stringify(reloadPrevious.diagnostics),
    );
    assert.deepEqual(
      reloadPrevious.snapshots[0],
      reload.snapshots[tick],
      `same-scene reload must use authored defaults at split Tick ${tick}`,
    );
    reloadAudio.push(...reloadPrevious.audioEvents);
  }
  assert.deepEqual(
    reloadAudio,
    reload.audioEvents,
    'reload lifecycle preserves audio overrides',
  );
  for (const action of [
    'missing-object',
    'missing-component',
    'duplicate',
    'invalid-data',
    'invalid-options',
  ]) {
    const result = runtime.run({
      ticks: 2,
      inputs: [{ tick: 0, action, value: 1 }],
      persistTrace: false,
    });
    assert.equal(result.status, 'failed', action);
    assert(
      result.diagnostics.some((d) =>
        d.code.startsWith('SCRIPT_SCENE_OVERRIDE_'),
      ),
      JSON.stringify(result.diagnostics),
    );
    assert.equal(
      result.scene.id,
      'transfer:scene/menu',
      'invalid patch cannot commit a partial scene switch',
    );
    assert.deepEqual(result.scene, scene('menu'));
    assert(
      !result.timeline.some(
        (entry) => entry.kind === 'lifecycle:load-scene:applied',
      ),
    );
  }
  const legacy = runtime.run({
    ticks: 2,
    inputs: [{ tick: 0, action: 'legacy', value: 1 }],
    persistTrace: false,
  });
  assert.equal(legacy.status, 'completed');
  assert.equal(
    preferences(legacy.scene).volume,
    0.8,
    'one-argument loadScene retains authored defaults',
  );
  assert.deepEqual(
    JSON.parse(readFileSync(join(root, 'scenes/arena.game.json'), 'utf8')),
    scene('arena'),
    'runtime transfer never edits project authority',
  );
  console.log(
    JSON.stringify({
      gate: 'P21 deterministic Scene settings transfer',
      splitRequestParity: true,
      destinationLifecycle: true,
      invalidTransferAtomicity: true,
      legacyCompatibility: true,
      sameSceneReloadRestoresAuthoredState: true,
      result: 'passed',
    }),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
