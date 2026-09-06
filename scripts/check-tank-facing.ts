import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';
import { drawableBounds } from '../studio/runtime/runtime-observation-service.ts';
import { StudioGameBuildService } from '../studio/workspace/studio-game-build-service.ts';

const projectRoot = resolve(process.argv[2]);
const evidence = mkdtempSync(resolve('artifacts/tank-facing-'));
const player = resolve('target/debug/ai-game-player.exe');
const scriptHostPath = resolve('target/debug/project-script-host.exe');
const runtime = new ProjectScriptRuntime({ projectRoot, scriptHostPath });
const build = new StudioGameBuildService({
  projectRoot,
  runtimeExecutablePath: player,
  scriptHostPath,
  engineVersion: '0.4.0-preview.1',
}).build('development');
const packagePath = join(build.outputDirectory, 'game', 'player-package.json');
const payload = JSON.parse(readFileSync(packagePath, 'utf8'));
const results = [];
for (const [action, angle] of [
  ['move-up', 0],
  ['move-down', -180],
  ['move-left', 90],
  ['move-right', -90],
] as const) {
  const result = runtime.run({
    scene: 'scenes/menu.game.json',
    ticks: 5,
    seed: 20260905,
    inputs: [
      { tick: 0, action: 'primary-action', value: 1 },
      { tick: 1, action: 'primary-action', value: 0 },
      { tick: 2, action, value: 1 },
      { tick: 3, action, value: 0 },
      { tick: 4, action: 'primary-action', value: 1 },
    ],
    commands: [],
    controls: [],
    persistTrace: false,
  });
  assert.equal(result.status, 'completed');
  const tankId = 'tank:object/arena/player';
  const projectile = result.scene.objects.find((o) =>
    o.components.some(
      (c) => c.type === 'tank:projectile' && c.data.ownerId === tankId,
    ),
  );
  assert(projectile);
  const snapshot = result.renderSnapshot!;
  for (const id of [tankId, projectile.id]) {
    const sprite = snapshot.payload.drawables.find(
      (d) => d.objectId === id && d.primitive === 'sprite2d',
    );
    assert(sprite, id);
    assert(Math.abs(sprite.transform2d!.rotation - angle) < 1e-8);
    const bounds = drawableBounds(
      sprite,
      snapshot.payload.cameras[0],
      [1280, 720],
    );
    assert(
      Math.abs(angle) === 90 ? bounds[2] > bounds[3] : bounds[3] > bounds[2],
      `${id}: quarter turn must swap tall sprite bounds`,
    );
  }
  // Freeze the actual runtime result into a disposable render fixture. This is a
  // GPU visual check, not an input replay or replacement for the actual game package.
  const fixture = structuredClone(payload);
  fixture.scene = result.scene;
  fixture.entryScene = result.scene.id;
  fixture.scenes = { [result.scene.id]: result.scene };
  fixture.runtime.modules = [];
  fixture.runtime.manifest.modules = [];
  fixture.runtime.manifest.systems = [];
  for (const object of fixture.scene.objects)
    object.components = object.components.filter(
      (c: { type: string }) => c.type !== 'core:script',
    );
  const fixturePath = join(
    build.outputDirectory,
    'game',
    `facing-fixture-${action}.json`,
  );
  writeFileSync(fixturePath, JSON.stringify(fixture));
  const frame = join(evidence, `${action}.png`);
  const gpu = spawnSync(
    player,
    ['--package', fixturePath, '--smoke', '2', '--smoke-capture', frame],
    { windowsHide: true, encoding: 'utf8', timeout: 45000 },
  );
  assert.equal(gpu.status, 0, gpu.stderr);
  const report = JSON.parse(gpu.stdout);
  assert.equal(report.renderer, 'wgpu-surface');
  results.push({ action, angle, frame, gpu: report });
}
const turned = runtime.run({
  scene: 'scenes/menu.game.json',
  ticks: 7,
  seed: 20260905,
  inputs: [
    { tick: 0, action: 'primary-action', value: 1 },
    { tick: 1, action: 'primary-action', value: 0 },
    { tick: 2, action: 'move-right', value: 1 },
    { tick: 3, action: 'move-right', value: 0 },
    { tick: 4, action: 'primary-action', value: 1 },
    { tick: 5, action: 'primary-action', value: 0 },
    { tick: 5, action: 'move-left', value: 1 },
    { tick: 6, action: 'move-left', value: 0 },
  ],
  commands: [],
  controls: [],
  persistTrace: false,
});
assert.equal(turned.status, 'completed');
const playerId = 'tank:object/arena/player';
const oldProjectile = turned.scene.objects.find((o) =>
  o.components.some(
    (c) => c.type === 'tank:projectile' && c.data.ownerId === playerId,
  ),
);
assert(oldProjectile);
assert.equal(
  turned.scene.objects
    .find((o) => o.id === playerId)!
    .components.find((c) => c.type === 'core:transform2d')!.data.rotation,
  90,
);
assert.equal(
  oldProjectile.components.find((c) => c.type === 'core:transform2d')!.data
    .rotation,
  -90,
);
writeFileSync(
  join(evidence, 'result.json'),
  JSON.stringify(
    { projectRoot, results, projectileIndependentAfterTurn: true },
    null,
    2,
  ),
);
console.log(JSON.stringify({ evidence, directions: results.length }));
