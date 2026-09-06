import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ProjectManager } from '../studio/project/project-manager.ts';
import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const project = resolve(
  process.argv[2] ?? join(repository, 'work', 'projects', 'tank-arena'),
);
const kernel = join(repository, 'target', 'debug', 'kernelctl.exe');

function kernelJson(args: string[]) {
  const result = spawnSync(kernel, args, {
    cwd: project,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

const scenePaths = [
  'scenes/main.game.json',
  'scenes/level-02.game.json',
  'scenes/level-03.game.json',
  'scenes/level-04.game.json',
  'scenes/level-05.game.json',
];
const components = new Set<string>();
const archetypes = new Set<string>();
const terrainKinds = new Set<string>();
for (const scenePath of scenePaths) {
  const document = JSON.parse(
    readFileSync(join(project, scenePath), 'utf8'),
  ) as {
    worlds: Array<{
      entities: Array<{ components: Array<Record<string, unknown>> }>;
    }>;
  };
  for (const component of document.worlds
    .flatMap((world) => world.entities)
    .flatMap((entity) => entity.components)) {
    components.add(String(component.type));
    if (component.type === 'game:wave-spawner')
      archetypes.add(String(component.archetype));
    if (component.type === 'game:terrain')
      terrainKinds.add(String(component.kind));
  }
}
assert.deepEqual([...terrainKinds].sort(), [
  'brick',
  'foliage',
  'steel',
  'water',
]);
assert.deepEqual([...archetypes].sort(), ['heavy', 'scout', 'striker']);
for (const component of [
  'game:tank',
  'game:base',
  'game:terrain',
  'game:wave-spawner',
]) {
  assert(components.has(component));
}

const levelEvidence = [];
for (let level = 1; level <= 5; level += 1) {
  const id = String(level).padStart(2, '0');
  const scene = level === 1 ? scenePaths[0]! : `scenes/level-${id}.game.json`;
  const victory = `replays/level-${id}.victory.input.json`;
  const defeat = `replays/level-${id}.defeat.input.json`;
  const started = performance.now();
  const won = kernelJson([
    'run',
    join(project, scene),
    join(project, victory),
  ]) as {
    result: { snapshot: { outcome: { status: string }; stateHash: string } };
  };
  const durationMs = performance.now() - started;
  const lost = kernelJson([
    'run',
    join(project, scene),
    join(project, defeat),
  ]) as {
    result: { snapshot: { outcome: { status: string }; stateHash: string } };
  };
  assert.equal(
    won.result.snapshot.outcome.status,
    'won',
    `level ${id} victory`,
  );
  assert.equal(
    lost.result.snapshot.outcome.status,
    'lost',
    `level ${id} defeat`,
  );
  assert(durationMs < 500, `level ${id} replay exceeded 500ms: ${durationMs}`);
  const batch = kernelJson([
    'batch',
    join(project, scene),
    join(project, victory),
    '100',
  ]) as {
    batch: { wins: number; losses: number; incomplete: number };
  };
  assert.deepEqual(
    {
      wins: batch.batch.wins,
      losses: batch.batch.losses,
      incomplete: batch.batch.incomplete,
    },
    { wins: 100, losses: 0, incomplete: 0 },
  );
  const capture = join(project, `tests/visual/level-${id}.capture.svg`);
  assert(existsSync(capture));
  assert.match(
    readFileSync(capture, 'utf8'),
    new RegExp(`Tank Arena ${id}`, 'u'),
  );
  levelEvidence.push({
    level,
    victoryHash: won.result.snapshot.stateHash,
    defeatHash: lost.result.snapshot.stateHash,
    durationMs,
  });
}

for (const path of [
  'campaign/campaign.json',
  'waves/waves.json',
  'prefabs/player-tank.prefab.json',
  'prefabs/wave-spawner.prefab.json',
  'progression/upgrades.json',
  'presentation/animation.json',
  'presentation/particles.json',
  'presentation/audio.json',
  'accessibility/settings.json',
]) {
  assert(
    existsSync(join(project, path)),
    `missing authoring-depth file ${path}`,
  );
}

const assetTestRoot = mkdtempSync(join(tmpdir(), 'ai-game-p12-assets-'));
const assetProject = join(assetTestRoot, basename(project));
cpSync(project, assetProject, {
  recursive: true,
  filter: (source) =>
    !['.git', '.aigame', 'out', 'dist'].includes(basename(source)),
});
const assetRegistry = new StudioCommandRegistry({
  projectRoot: assetProject,
  kernelCliPath: kernel,
});
const assetChanges = new StudioChangeSetService({
  projectRoot: assetProject,
  kernelCliPath: kernel,
  registry: assetRegistry,
});
const broker = new StudioAssetJobBroker({
  projectRoot: assetProject,
  registry: assetRegistry,
  changes: assetChanges,
});
const beforeSelection = assetRegistry.snapshot().assets.length;
const image = broker.submit({
  kind: 'image',
  providerId: 'local-placeholder',
  prompt:
    'original high-contrast emerald player tank, 16-bit pixel-art language',
  outputName: 'tank-player.svg',
  variants: 2,
});
const imageReview = broker.run(image.id);
assert.equal(imageReview.status, 'awaitingReview');
assert.equal(imageReview.candidates.length, 2);
assert(
  imageReview.candidates.every((candidate) => !isAbsolute(candidate.path)),
);
assert.equal(
  assetRegistry.snapshot().assets.length,
  beforeSelection,
  'draft candidates entered manifest before review',
);
broker.previewCandidate(image.id, imageReview.candidates[0]!.id);
const imageImported = broker.select(image.id, imageReview.candidates[0]!.id);
assert.equal(imageImported.status, 'awaitingImportApproval');
assetChanges.approve(imageImported.importChangeSetId!);
assetChanges.apply(imageImported.importChangeSetId!);
const reconciledImage = broker.list().find((job) => job.id === image.id)!;
assert.equal(reconciledImage.status, 'imported');
broker.select(image.id, imageReview.candidates[0]!.id);

const audio = broker.submit({
  kind: 'audio',
  providerId: 'local-placeholder',
  prompt: 'short original square-wave tank cannon cue',
  outputName: 'fire.wav',
  variants: 1,
});
const audioReview = broker.run(audio.id);
const audioImported = broker.select(audio.id, audioReview.candidates[0]!.id);
assetChanges.approve(audioImported.importChangeSetId!);
assetChanges.apply(audioImported.importChangeSetId!);
const reconciledAudio = broker.list().find((job) => job.id === audio.id)!;
assert.equal(reconciledAudio.status, 'imported');

const recovery = broker.submit({
  kind: 'image',
  providerId: 'recovery-fixture',
  prompt: 'provider retry regression candidate',
  outputName: 'provider-recovery.svg',
  variants: 1,
});
assert.equal(broker.run(recovery.id).status, 'failed');
const recovered = broker.retry(recovery.id);
assert.equal(recovered.status, 'awaitingReview');
assert.equal(recovered.attempts, 2);
const recoveryImported = broker.select(
  recovery.id,
  recovered.candidates[0]!.id,
);
assetChanges.approve(recoveryImported.importChangeSetId!);
assetChanges.apply(recoveryImported.importChangeSetId!);
const reconciledRecovery = broker.list().find((job) => job.id === recovery.id)!;

const generatedManifest = JSON.parse(
  readFileSync(join(assetProject, 'assets/asset-manifest.json'), 'utf8'),
) as {
  assets: Array<{
    source?: { type?: string; providerId?: string; reviewedBy?: string };
  }>;
};
assert(generatedManifest.assets.length >= 3);
for (const assetId of [
  reconciledImage.importedAssetId,
  reconciledAudio.importedAssetId,
  reconciledRecovery.importedAssetId,
]) {
  assert(
    generatedManifest.assets.some(
      (asset) => (asset as { id?: string }).id === assetId,
    ),
  );
}
assert(
  generatedManifest.assets.every(
    (asset) =>
      asset.source?.type !== 'generated' || asset.source.reviewedBy === 'human',
  ),
);
assert(
  generatedManifest.assets.some(
    (asset) => asset.source?.providerId === 'local-placeholder',
  ),
);
rmSync(assetTestRoot, { recursive: true, force: true });

const manifest = JSON.parse(
  readFileSync(join(project, 'assets/asset-manifest.json'), 'utf8'),
) as {
  assets: Array<{
    source?: { type?: string; providerId?: string; reviewedBy?: string };
  }>;
};
assert(manifest.assets.length >= 3);
assert(
  manifest.assets.every(
    (asset) =>
      asset.source?.type !== 'generated' || asset.source.reviewedBy === 'human',
  ),
);

const invalidRoot = mkdtempSync(join(tmpdir(), 'ai-game-p12-invalid-'));
const invalidPath = join(invalidRoot, 'invalid.game.json');
writeFileSync(invalidPath, JSON.stringify({ kind: 'ai-game-kernel/project' }));
const invalid = spawnSync(kernel, ['validate', invalidPath], {
  encoding: 'utf8',
  windowsHide: true,
});
assert.equal(invalid.status, 2);
assert.match(invalid.stdout, /IR_SCHEMA_/u);
rmSync(invalidRoot, { recursive: true, force: true });

const migrationRoot = mkdtempSync(join(tmpdir(), 'ai-game-p12-migration-'));
const copiedProject = join(migrationRoot, basename(project));
cpSync(project, copiedProject, {
  recursive: true,
  filter: (source) =>
    !['.git', '.aigame', 'out', 'dist'].includes(basename(source)),
});
const manager = new ProjectManager({
  templateRoot: join(repository, 'templates'),
  storageDirectory: join(migrationRoot, 'state'),
  engineVersion: '0.1.1',
  doctor: { kernelCliPath: kernel },
});
manager.openProject(copiedProject);
const doctor = manager.doctor();
assert(doctor.ok, JSON.stringify(doctor));
manager.closeProject();
rmSync(migrationRoot, { recursive: true, force: true });

console.log(
  JSON.stringify({
    ok: true,
    levels: levelEvidence,
    terrainKinds: [...terrainKinds].sort(),
    archetypes: [...archetypes].sort(),
    batchRuns: 500,
    importedGeneratedAssets: manifest.assets.length,
    providerRecoveryAttempts: recovered.attempts,
    migrationDoctor: doctor.ok,
  }),
);
