import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';

const repository = resolve(import.meta.dirname, '..');
const projectRoot = join(repository, 'examples', 'tank-arena');
const hostPath = join(repository, 'target', 'debug', 'project-script-host.exe');
const runtime = new ProjectScriptRuntime({
  projectRoot,
  scriptHostPath: hostPath,
});

const json = <T>(path: string): T =>
  JSON.parse(readFileSync(join(projectRoot, path), 'utf8')) as T;
const sha256 = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');

const skillPath = '.agents/skills/tank-art-direction/SKILL.md';
const skill = readFileSync(join(projectRoot, skillPath), 'utf8');
for (const contract of [
  'palette',
  'orthographic',
  'scale',
  'silhouette',
  'outline',
  'transparency',
  'atlas',
  'UI',
  'prohibited',
]) {
  assert.match(
    skill,
    new RegExp(contract, 'iu'),
    `art Skill missing ${contract}`,
  );
}

const inventory = json<{ items: Array<{ id: string; severity: string }> }>(
  'assets/briefs/p31-placeholder-inventory.json',
);
const brief = json<{
  id: string;
  resources: Array<{
    id: string;
    kind: string;
    assetId: string;
    outputName: string;
  }>;
  coverage: Record<string, string[]>;
}>('assets/briefs/tank-completion-v1.json');
assert.equal(brief.id, 'asset-brief:tank-completion-v1');
assert.equal(inventory.items.length, 10);
assert.equal(brief.resources.length, 16);
assert.deepEqual(Object.keys(brief.coverage), ['world', 'ui', 'audio']);
assert.equal(new Set(brief.resources.map((item) => item.id)).size, 16);
assert.equal(new Set(brief.resources.map((item) => item.assetId)).size, 16);

const expectedVisualCandidates = [
  'player-tank-v1.png',
  'enemy-tank-v1.png',
  'player-shell-v1.png',
  'solid-wall-v1.png',
  'destructible-wall-v1.png',
  'ground-v1.png',
  'command-base-v1.png',
  'explosion-v1.png',
  'ui-panel-v1.png',
];
const candidateRoot = join(
  projectRoot,
  '.aigame',
  'local',
  'asset-candidates',
  'p31-neon-bastion',
);
const candidateRecords = expectedVisualCandidates.map((name) => {
  const path = join(candidateRoot, name);
  assert(existsSync(path), `missing controlled visual candidate ${name}`);
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert(width >= 1024 && height >= 941, `${name} is below review resolution`);
  return { name, width, height, sha256: sha256(bytes) };
});

const prefabFiles = [
  'player-tank.prefab.json',
  'enemy-tank.prefab.json',
  'player-shell.prefab.json',
  'solid-wall.prefab.json',
  'destructible-wall.prefab.json',
  'explosion.prefab.json',
];
for (const name of prefabFiles) {
  const prefab = json<{
    schemaVersion: string;
    id: string;
    objects: Array<{ id: string; components: unknown[] }>;
    rootObjectIds: string[];
  }>(`prefabs/${name}`);
  assert.equal(prefab.schemaVersion, '2.0.0-alpha.1');
  assert(prefab.id.startsWith('tank-arena-example:prefab/'));
  assert(prefab.objects.length > 0);
  assert(
    prefab.rootObjectIds.every((id) =>
      prefab.objects.some((object) => object.id === id),
    ),
  );
}
assert.equal(
  readdirSync(join(projectRoot, 'prefabs')).filter((name) =>
    name.endsWith('.json'),
  ).length,
  prefabFiles.length,
);

const controllerSource = readFileSync(
  join(projectRoot, 'scripts/behaviors/game-controller.ts'),
  'utf8',
);
const playerSource = readFileSync(
  join(projectRoot, 'scripts/behaviors/player-tank.ts'),
  'utf8',
);
assert.match(
  playerSource,
  /spawnPrefab\('prefabs\/player-shell\.prefab\.json'/u,
);
for (const action of [
  'toggle-help',
  'toggle-mute',
  'volume-down',
  'volume-up',
]) {
  assert(controllerSource.includes(action), `controller missing ${action}`);
}

const controls = runtime.run({
  ticks: 12,
  seed: 20260905,
  persistTrace: false,
  inputs: [
    { tick: 0, action: 'toggle-help', value: 1 },
    { tick: 1, action: 'toggle-help', value: 0 },
    { tick: 2, action: 'toggle-mute', value: 1 },
    { tick: 3, action: 'toggle-mute', value: 0 },
    { tick: 4, action: 'volume-up', value: 1 },
    { tick: 5, action: 'volume-up', value: 0 },
  ],
});
const game = controls.scene.objects
  .find((object) => object.id === 'tank:game')
  ?.components.find((component) => component.type === 'tank:game-state')
  ?.data as {
  helpVisible?: boolean;
  muted?: boolean;
  masterVolume?: number;
};
assert.equal(game.helpVisible, true);
assert.equal(game.muted, true);
assert.equal(game.masterVolume, 0.9);
assert(
  controls.audioEvents.some((event) => event.payload.action === 'set-muted'),
);
assert(
  controls.audioEvents.some((event) => event.payload.action === 'set-volume'),
);
assert(
  controls.renderSnapshot.payload.drawables.some(
    (drawable) => drawable.objectId === 'tank:ui/help' && drawable.visible,
  ),
);

const wallInputs = [
  { tick: 0, action: 'start-game', value: 1 },
  { tick: 1, action: 'start-game', value: 0 },
  ...Array.from({ length: 21 }, (_, index) => ({
    tick: index + 2,
    action: 'move-left',
    value: 1,
  })),
  { tick: 23, action: 'move-left', value: 0 },
  { tick: 24, action: 'move-up', value: 1 },
  { tick: 25, action: 'move-up', value: 0 },
  { tick: 26, action: 'fire', value: 1 },
  { tick: 27, action: 'fire', value: 0 },
];
const wallRun = runtime.run({
  ticks: 120,
  seed: 20260905,
  inputs: wallInputs,
  persistTrace: false,
});
const wallEvents = wallRun.timeline.filter(
  (entry) => entry.kind === 'event:emit' && entry.type === 'tank:wall-hit',
);
assert(wallEvents.length > 0, 'projectile never emitted a semantic wall hit');
assert(
  wallRun.timeline.some(
    (entry) =>
      entry.kind === 'lifecycle:spawn:applied' &&
      typeof (entry.object as { prefab?: unknown } | undefined)?.prefab ===
        'string' &&
      (entry.object as { prefab: string }).prefab ===
        'prefabs/player-shell.prefab.json',
  ),
  'projectile was not instantiated from its Prefab',
);
assert(
  wallRun.timeline.some(
    (entry) =>
      entry.kind === 'lifecycle:spawn:applied' &&
      (entry.object as { prefab?: unknown } | undefined)?.prefab ===
        'prefabs/explosion.prefab.json',
  ),
  'wall impact did not instantiate the explosion Prefab',
);

const wallRunAgain = runtime.run({
  ticks: 120,
  seed: 20260905,
  inputs: wallInputs,
  persistTrace: false,
});
assert.equal(wallRunAgain.stateHash, wallRun.stateHash);

console.log(
  JSON.stringify(
    {
      gate: 'P31 Tank completion foundation',
      artDirection: {
        path: skillPath,
        sha256: sha256(skill),
        inventoryItems: inventory.items.length,
        assetBriefs: brief.resources.length,
      },
      visualCandidates: candidateRecords,
      reviewState: 'awaiting-human-selection',
      prefabs: prefabFiles,
      controls: {
        helpVisible: game.helpVisible,
        muted: game.muted,
        masterVolume: game.masterVolume,
      },
      prefabRuntime: {
        wallHitEvents: wallEvents.length,
        deterministicStateHash: wallRun.stateHash,
      },
      result: 'passed',
    },
    null,
    2,
  ),
);
