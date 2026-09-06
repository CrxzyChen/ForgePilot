import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  ProjectScriptRuntime,
  type ProjectRuntimeResult,
  type RuntimeInput,
} from '../studio/runtime/project-script-runtime.ts';
import { StudioGameBuildService } from '../studio/workspace/studio-game-build-service.ts';

const repository = resolve(import.meta.dirname, '..');
const projectRoot = join(repository, 'examples', 'collect-room-3d');
const hostPath = join(repository, 'target', 'debug', 'project-script-host.exe');
const playerPath = join(repository, 'target', 'debug', 'ai-game-player.exe');
const runtime = new ProjectScriptRuntime({
  projectRoot,
  scriptHostPath: hostPath,
});

function repeatAction(
  inputs: RuntimeInput[],
  action: string,
  start: number,
  end: number,
) {
  for (let tick = start; tick <= end; tick += 1) {
    inputs.push({ tick, action, value: 1 });
  }
  inputs.push({ tick: end + 1, action, value: 0 });
}

function componentData<T>(
  result: ProjectRuntimeResult,
  objectId: string,
  type: string,
): T {
  const value = result.scene.objects
    .find((object) => object.id === objectId)
    ?.components.find((component) => component.type === type)?.data;
  assert(value, `${objectId}/${type} is missing`);
  return value as T;
}

const inputs: RuntimeInput[] = [];
repeatAction(inputs, 'move-right', 0, 17);
repeatAction(inputs, 'move-forward', 20, 52);
repeatAction(inputs, 'move-back', 55, 132);
repeatAction(inputs, 'move-right', 135, 165);
repeatAction(inputs, 'move-right', 168, 195);
repeatAction(inputs, 'move-forward', 198, 230);

const result = runtime.run({
  ticks: 260,
  seed: 20260903,
  inputs,
  persistTrace: false,
});
assert.equal(result.status, 'completed');
assert.equal(
  componentData<{ collected: number }>(
    result,
    'collect:player',
    'collect:player-state',
  ).collected,
  3,
);
for (const item of ['collect:item-1', 'collect:item-2', 'collect:item-3']) {
  assert.equal(
    componentData<{ active: boolean }>(result, item, 'collect:item').active,
    false,
  );
  assert.equal(
    result.scene.objects.find((object) => object.id === item)?.visible,
    false,
  );
}
const ui = result.renderSnapshot.payload.drawables.filter(
  (drawable) => drawable.space === 'ui' && drawable.visible,
);
assert(ui.some((drawable) => drawable.text === 'CRYSTALS 3 / 3'));
assert(ui.some((drawable) => drawable.text === 'ROOM CLEARED'));
assert(ui.some((drawable) => drawable.inputAction === 'restart'));

const collectibleEnters = result.physicsEvents.filter(
  (event) =>
    event.phase === 'enter' &&
    [event.objectA, event.objectB].some((id) => id.startsWith('collect:item-')),
);
assert.equal(
  new Set(
    collectibleEnters.map((event) =>
      [event.objectA, event.objectB].sort().join('|'),
    ),
  ).size,
  3,
);
assert(collectibleEnters.every((event) => event.space === '3d'));
assert(
  collectibleEnters.every(
    (event) => event.normal.length === 3 && event.contacts[0]?.length === 3,
  ),
);

const projection = result.renderSnapshot.payload;
const camera = projection.cameras.find(
  (candidate) => candidate.space === '3d' && candidate.primary,
);
assert(
  camera?.verticalFovRadians && camera.near === 0.1 && camera.far === 1_000,
);
assert(
  projection.lights.some(
    (light) => light.kind === 'directional' && light.direction?.length === 3,
  ),
);
assert.equal(
  projection.drawables.filter((drawable) => drawable.space === '3d').length,
  7,
);
assert(
  projection.drawables.filter((drawable) => drawable.asset?.kind === 'mesh')
    .length === 3,
);
assert(
  projection.drawables.some(
    (drawable) =>
      drawable.texture?.id === 'collect-room-example:asset/floor-grid-v1',
  ),
);
const player = projection.drawables.find(
  (drawable) => drawable.objectId === 'collect:player',
);
const marker = projection.drawables.find(
  (drawable) => drawable.objectId === 'collect:player-marker',
);
assert(player?.transform3d && marker?.transform3d);
assert(
  Math.abs(
    marker.transform3d.position[1] - (player.transform3d.position[1] + 1.2),
  ) < 1e-9,
  JSON.stringify({
    markerParent: result.scene.objects.find(
      (object) => object.id === 'collect:player-marker',
    )?.parentId,
    player: player.transform3d,
    marker: marker.transform3d,
  }),
);

const again = runtime.run({
  ticks: 260,
  seed: 20260903,
  inputs,
  persistTrace: false,
});
assert.equal(again.stateHash, result.stateHash);
assert.deepEqual(again.physicsEvents, result.physicsEvents);
const first = runtime.run({
  ticks: 140,
  seed: 20260903,
  inputs,
  persistTrace: false,
});
const second = runtime.run({
  sceneState: first.scene,
  activeScene: first.activeScene,
  startTick: first.tick,
  started: true,
  randomState: first.randomState,
  pendingEvents: first.pendingEvents,
  pendingLifecycle: first.pendingLifecycle,
  physicsContacts: first.physicsContacts,
  ticks: 120,
  seed: 20260903,
  inputs: inputs.filter((input) => input.tick >= first.tick),
  persistTrace: false,
});
assert.equal(second.stateHash, result.stateHash);

const playerSource = readFileSync(
  join(repository, 'crates', 'player', 'src', 'main.rs'),
  'utf8',
);
const shaderSource = readFileSync(
  join(repository, 'crates', 'player', 'src', 'player-mesh3d.wgsl'),
  'utf8',
);
const studioRenderer = readFileSync(
  join(repository, 'studio', 'electron', 'renderer', 'webgl3d-renderer.ts'),
  'utf8',
);
for (const contract of [
  'perspective(',
  'Depth32Float',
  'RenderItem::Mesh3D',
  'Face::Back',
]) {
  const source =
    contract === 'perspective('
      ? `${playerSource}\n${studioRenderer}`
      : playerSource;
  assert(source.includes(contract), `3D renderer omitted ${contract}`);
}
for (const contract of [
  'uViewProjection',
  'uModel',
  'DEPTH_TEST',
  'uLightDirection',
]) {
  assert(
    `${studioRenderer}\n${shaderSource}`
      .toLowerCase()
      .includes(contract.toLowerCase()),
    `3D shader omitted ${contract}`,
  );
}
for (const contract of [
  'parse_obj_mesh',
  'textureSample(material_texture',
  'load_mesh',
]) {
  assert(
    `${playerSource}\n${shaderSource}`.includes(contract),
    `Player omitted ${contract}`,
  );
}
const behaviorSource = readFileSync(
  join(projectRoot, 'scripts', 'behaviors', 'player.ts'),
  'utf8',
);
assert(
  !behaviorSource.includes('Math.hypot'),
  'Collect Room still uses scripted proximity',
);
assert(behaviorSource.includes('onCollisionEnter'));

const build = new StudioGameBuildService({
  projectRoot,
  runtimeExecutablePath: playerPath,
  scriptHostPath: hostPath,
  engineVersion: '0.3.0-preview.1',
}).build('development');
for (const asset of [
  'assets/imported/crystal-v1.obj',
  'assets/imported/floor-grid-v1.svg',
]) {
  assert(
    build.reachability.assets.includes(asset),
    `${asset} was not packaged`,
  );
}
const verification = spawnSync(
  join(build.outputDirectory, build.executable),
  [
    '--verify',
    '--package',
    join(build.outputDirectory, 'game', 'player-package.json'),
  ],
  { encoding: 'utf8', windowsHide: true, timeout: 30_000 },
);
assert.equal(
  verification.status,
  0,
  verification.stderr || verification.stdout,
);
const playerReport = JSON.parse(verification.stdout) as {
  sceneSpace: string;
  projectedDrawableCount: number;
  validatedImageCount: number;
  validatedMeshCount: number;
  renderer: string;
};
assert.equal(playerReport.sceneSpace, '3d');
assert(playerReport.projectedDrawableCount >= 10);
assert.equal(playerReport.validatedImageCount, 1);
assert.equal(playerReport.validatedMeshCount, 1);
assert.equal(playerReport.renderer, 'wgpu-runtime-render-snapshot');

console.log(
  JSON.stringify(
    {
      gate: 'P25 minimum true 3D Collect Room loop',
      collected: 3,
      tick: result.tick,
      stateHash: result.stateHash,
      deterministicReplay: again.stateHash === result.stateHash,
      segmentedParity: second.stateHash === result.stateHash,
      physics3dEnterCount: collectibleEnters.length,
      projectedMeshCount: projection.drawables.filter(
        (drawable) => drawable.space === '3d',
      ).length,
      childWorldPosition: marker.transform3d.position,
      studioRenderer: 'webgl2-perspective-depth-directional-light',
      player: playerReport,
      outputDirectory: build.outputDirectory,
      result: 'passed',
    },
    null,
    2,
  ),
);
