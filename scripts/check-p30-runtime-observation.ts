import assert from 'node:assert/strict';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type {
  ProjectRuntimeResult,
  RuntimeInput,
} from '../studio/runtime/project-script-runtime.ts';
import type { RuntimeObservation } from '../studio/runtime/runtime-observation-service.ts';
import { ProjectError } from '../studio/project/project-types.ts';
import {
  StudioChangeSetService,
  type StudioChangeSet,
} from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p30-observation-'));
const projectRoot = join(temporary, 'tank-arena');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');
const playerExecutablePath = join(
  repository,
  'target',
  'debug',
  'ai-game-player.exe',
);
const scriptHostPath = join(
  repository,
  'target',
  'debug',
  'project-script-host.exe',
);

type CheckpointResult = {
  result: ProjectRuntimeResult;
  observation: RuntimeObservation;
};

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

const startInputs: RuntimeInput[] = [
  { tick: 0, action: 'start-game', value: 1 },
  { tick: 1, action: 'start-game', value: 0 },
];
const winInputs: RuntimeInput[] = [
  ...startInputs,
  { tick: 2, action: 'fire', value: 1 },
  { tick: 3, action: 'fire', value: 0 },
];
repeatAction(winInputs, 'move-left', 72, 132);
winInputs.push(
  { tick: 134, action: 'move-up', value: 1 },
  { tick: 135, action: 'move-up', value: 0 },
  { tick: 140, action: 'fire', value: 1 },
  { tick: 141, action: 'fire', value: 0 },
);
repeatAction(winInputs, 'move-right', 230, 340);
winInputs.push(
  { tick: 342, action: 'move-up', value: 1 },
  { tick: 343, action: 'move-up', value: 0 },
  { tick: 348, action: 'fire', value: 1 },
  { tick: 349, action: 'fire', value: 0 },
);

function phase(result: ProjectRuntimeResult): string {
  const state = result.scene.objects
    .find((object) => object.id === 'tank:game')
    ?.components.find((component) => component.type === 'tank:game-state')
    ?.data as { phase?: string } | undefined;
  return state?.phase ?? 'missing';
}

function applyChange(
  changes: StudioChangeSetService,
  summary: string,
  command: string,
  input: Record<string, unknown>,
): StudioChangeSet {
  const proposed = changes.propose({
    summary,
    operations: [{ command, input, description: summary }],
  });
  changes.approve(proposed.id);
  return changes.apply(proposed.id);
}

function captureProject(
  registry: StudioCommandRegistry,
  checkpointId: string,
): RuntimeObservation {
  return registry.execute('runtime.capture_frame', {
    checkpointId,
    projectState: true,
    inputLogId: `fixture-${checkpointId}`,
    width: 640,
    height: 360,
  }).data as RuntimeObservation;
}

function assertDiagnostic(
  observation: RuntimeObservation,
  code: string,
  expected: Partial<RuntimeObservation['diagnostics'][number]> = {},
) {
  const diagnostic = observation.diagnostics.find((item) => item.code === code);
  assert(diagnostic, `${code} missing from ${observation.observationId}`);
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(
      diagnostic[key as keyof typeof diagnostic],
      value,
      `${code}.${key}`,
    );
  }
}

function assertProjectErrorCode(callback: () => unknown, code: string) {
  assert.throws(
    callback,
    (error: unknown) => error instanceof ProjectError && error.code === code,
    `expected ${code}`,
  );
}

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  const registry = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath,
    playerExecutablePath,
    scriptHostPath,
  });
  const changes = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry,
  });
  const navigate = (
    checkpointId: string,
    ticks: number,
    inputs: RuntimeInput[] = [],
  ) => {
    const startedAt = performance.now();
    try {
      const result = registry.execute('runtime.navigate_checkpoint', {
        checkpointId,
        ticks,
        inputs,
        seed: 20260903,
        inputLogId: `tank-${checkpointId}`,
        width: 640,
        height: 360,
      }).data as CheckpointResult;
      console.log(
        JSON.stringify({
          gate: 'P30 checkpoint timing',
          checkpointId,
          ticks,
          durationMs: Math.round(performance.now() - startedAt),
          result: 'passed',
        }),
      );
      return result;
    } catch (error) {
      console.error(
        JSON.stringify({
          gate: 'P30 checkpoint timing',
          checkpointId,
          ticks,
          durationMs: Math.round(performance.now() - startedAt),
          result: 'failed',
          code: error instanceof ProjectError ? error.code : 'UNEXPECTED_ERROR',
        }),
      );
      throw error;
    }
  };

  const menu = navigate('menu', 1);
  assert.equal(phase(menu.result), 'menu');
  assert.match(menu.observation.observationId, /^observation:[a-f0-9]{24}$/u);
  assert.match(
    menu.observation.frameArtifact.artifactId,
    /^artifact:[a-f0-9]{24}$/u,
  );
  assert.equal(menu.observation.camera.viewport.join('x'), '640x360');
  assert.equal(menu.observation.camera.projection, 'orthographic');
  assert(existsSync(join(projectRoot, menu.observation.frameArtifact.path)));
  assert.equal(
    readFileSync(join(projectRoot, menu.observation.frameArtifact.path))
      .subarray(0, 8)
      .toString('hex'),
    '89504e470d0a1a0a',
  );
  assert(
    menu.observation.drawables.some((drawable) => drawable.resource?.resolved),
  );
  assert(
    menu.observation.ui.some((target) => target.inputAction === 'start-game'),
  );
  assert.equal(
    registry.snapshot().runtime.latestObservation?.observationId,
    menu.observation.observationId,
  );
  assert.match(
    registry.readAssetPreview(menu.observation.frameArtifact.path).dataUrl,
    /^data:image\/png;base64,/u,
  );
  const observationName = menu.observation.observationId.slice(
    'observation:'.length,
  );
  const observationPath = join(
    projectRoot,
    '.aigame',
    'local',
    'runtime-observations',
    `${observationName}.json`,
  );
  const framePath = join(projectRoot, menu.observation.frameArtifact.path);
  const originalObservationText = readFileSync(observationPath, 'utf8');
  const originalFrame = readFileSync(framePath);
  assert.equal(
    (
      registry.execute('runtime.observation.read', {
        observationId: menu.observation.observationId,
      }).data as RuntimeObservation
    ).observationId,
    menu.observation.observationId,
  );
  const incompatibleObservation = JSON.parse(originalObservationText) as {
    schemaVersion: string;
  };
  incompatibleObservation.schemaVersion = '0.9.0';
  writeFileSync(
    observationPath,
    `${JSON.stringify(incompatibleObservation, null, 2)}\n`,
  );
  assertProjectErrorCode(
    () =>
      registry.execute('runtime.observation.read', {
        observationId: menu.observation.observationId,
      }),
    'RUNTIME_OBSERVATION_MIGRATION_REQUIRED',
  );
  const unaddressableObservation = JSON.parse(originalObservationText) as {
    drawables: Array<Record<string, unknown>>;
  };
  assert(unaddressableObservation.drawables[0]);
  delete unaddressableObservation.drawables[0].objectId;
  writeFileSync(
    observationPath,
    `${JSON.stringify(unaddressableObservation, null, 2)}\n`,
  );
  assertProjectErrorCode(
    () =>
      registry.execute('runtime.observation.read', {
        observationId: menu.observation.observationId,
      }),
    'RUNTIME_OBSERVATION_DOCUMENT_INVALID',
  );
  writeFileSync(observationPath, '{');
  assertProjectErrorCode(
    () =>
      registry.execute('runtime.observation.read', {
        observationId: menu.observation.observationId,
      }),
    'RUNTIME_OBSERVATION_DOCUMENT_INVALID',
  );
  writeFileSync(observationPath, originalObservationText);
  appendFileSync(framePath, Buffer.from([0]));
  assertProjectErrorCode(
    () =>
      registry.execute('runtime.observation.read', {
        observationId: menu.observation.observationId,
      }),
    'RUNTIME_OBSERVATION_ARTIFACT_HASH_MISMATCH',
  );
  writeFileSync(framePath, originalFrame);
  assert.equal(
    (
      registry.execute('runtime.observation.read', {
        observationId: menu.observation.observationId,
      }).data as RuntimeObservation
    ).frameArtifact.sha256,
    menu.observation.frameArtifact.sha256,
  );
  assertProjectErrorCode(
    () =>
      registry.execute('runtime.observation.read', {
        observationId: 'observation:not-a-stable-id',
      }),
    'RUNTIME_OBSERVATION_ID_INVALID',
  );

  const menuAgain = navigate('menu', 1);
  assert.equal(
    menuAgain.observation.frameArtifact.sha256,
    menu.observation.frameArtifact.sha256,
  );
  assert.equal(menuAgain.observation.stateHash, menu.observation.stateHash);
  assert.equal(
    menuAgain.observation.drawables.length,
    menu.observation.drawables.length,
  );

  const play = navigate('play', 20, startInputs);
  assert.equal(phase(play.result), 'playing');
  assertProjectErrorCode(
    () =>
      registry.execute('runtime.observation.compare', {
        leftObservationId: menu.observation.observationId,
        rightObservationId: play.observation.observationId,
      }),
    'RUNTIME_OBSERVATION_CHECKPOINT_MISMATCH',
  );
  const paused = navigate('pause', 20, [
    ...startInputs,
    { tick: 2, action: 'pause', value: 1 },
    { tick: 3, action: 'pause', value: 0 },
  ]);
  assert.equal(phase(paused.result), 'paused');
  const won = navigate('win', 560, winInputs);
  assert.equal(phase(won.result), 'won');
  assert(won.observation.audio.events.length > 0);
  const lost = navigate('lose', 900, startInputs);
  assert.equal(phase(lost.result), 'lost');
  const firstWonTick = won.result.snapshots.find(
    (snapshot) => phase({ ...won.result, scene: snapshot.scene }) === 'won',
  )?.tick;
  assert(firstWonTick !== undefined);
  const restart = navigate('restart', firstWonTick + 3, [
    ...winInputs,
    { tick: firstWonTick + 1, action: 'restart', value: 1 },
    { tick: firstWonTick + 2, action: 'restart', value: 0 },
  ]);
  assert.equal(phase(restart.result), 'menu');

  const scenePath = 'scenes/main.game.json';
  const sceneBefore = readFileSync(join(projectRoot, scenePath), 'utf8');

  const missingSeed = applyChange(
    changes,
    'Seed missing player texture',
    'scene.component.update',
    {
      scene: scenePath,
      objectId: 'tank:player',
      componentId: 'tank:player/sprite',
      data: { texture: 'tank-arena-example:asset/missing-texture' },
    },
  );
  const missingBefore = captureProject(registry, 'missing-texture-before');
  assertDiagnostic(missingBefore, 'RUNTIME_RESOURCE_REFERENCE_MISSING', {
    objectId: 'tank:player',
    componentId: 'tank:player/sprite',
  });
  assert(
    missingBefore.drawables.some(
      (drawable) =>
        drawable.componentId === 'tank:player/sprite' && drawable.fallback,
    ),
  );
  const missingRepair = applyChange(
    changes,
    'Repair player texture by stable asset ID',
    'scene.component.update',
    {
      scene: scenePath,
      objectId: 'tank:player',
      componentId: 'tank:player/sprite',
      data: { texture: 'tank-arena-example:asset/tank-sprite-v1' },
    },
  );
  const missingAfter = captureProject(registry, 'missing-texture-after');
  assert.equal(
    missingAfter.diagnostics.some(
      (item) => item.code === 'RUNTIME_RESOURCE_REFERENCE_MISSING',
    ),
    false,
  );
  changes.rollback(missingRepair.id);
  assertDiagnostic(
    captureProject(registry, 'missing-texture-rollback'),
    'RUNTIME_RESOURCE_REFERENCE_MISSING',
  );
  applyChange(
    changes,
    'Restore player texture after rollback proof',
    'scene.component.update',
    {
      scene: scenePath,
      objectId: 'tank:player',
      componentId: 'tank:player/sprite',
      data: { texture: 'tank-arena-example:asset/tank-sprite-v1' },
    },
  );

  const visualSeed = applyChange(
    changes,
    'Seed pivot and invisible layer defects',
    'scene.component.update',
    {
      scene: scenePath,
      objectId: 'tank:player',
      componentId: 'tank:player/sprite',
      data: { pivot: { x: 1.5, y: 0.5 }, layer: -1 },
    },
  );
  const visualBefore = captureProject(registry, 'visual-before');
  assertDiagnostic(visualBefore, 'RUNTIME_DRAWABLE_PIVOT_OUT_OF_RANGE', {
    objectId: 'tank:player',
    componentId: 'tank:player/sprite',
  });
  assertDiagnostic(visualBefore, 'RUNTIME_DRAWABLE_FULLY_OCCLUDED', {
    objectId: 'tank:player',
    componentId: 'tank:player/sprite',
  });
  const visualRepair = applyChange(
    changes,
    'Repair player pivot and render layer',
    'scene.component.update',
    {
      scene: scenePath,
      objectId: 'tank:player',
      componentId: 'tank:player/sprite',
      data: { pivot: { x: 0.5, y: 0.5 }, layer: 10 },
    },
  );
  const visualAfter = captureProject(registry, 'visual-after');
  for (const code of [
    'RUNTIME_DRAWABLE_PIVOT_OUT_OF_RANGE',
    'RUNTIME_DRAWABLE_FULLY_OCCLUDED',
  ]) {
    assert.equal(
      visualAfter.diagnostics.some((item) => item.code === code),
      false,
    );
  }
  changes.rollback(visualRepair.id);
  assertDiagnostic(
    captureProject(registry, 'visual-rollback'),
    'RUNTIME_DRAWABLE_PIVOT_OUT_OF_RANGE',
  );
  applyChange(
    changes,
    'Restore player pivot and render layer after rollback proof',
    'scene.component.update',
    {
      scene: scenePath,
      objectId: 'tank:player',
      componentId: 'tank:player/sprite',
      data: { pivot: { x: 0.5, y: 0.5 }, layer: 10 },
    },
  );

  const uiSeed = applyChange(
    changes,
    'Seed off-screen start button',
    'scene.component.update',
    {
      scene: scenePath,
      objectId: 'tank:ui/start',
      componentId: 'tank:ui/start/transform',
      data: { anchor: { x: 0.99, y: 0.48 }, size: { x: 520, y: 56 } },
    },
  );
  const uiBefore = captureProject(registry, 'ui-before');
  assertDiagnostic(uiBefore, 'RUNTIME_UI_BOUNDS_OVERFLOW', {
    objectId: 'tank:ui/start',
  });
  const uiRepair = applyChange(
    changes,
    'Restore reachable start button bounds',
    'scene.component.update',
    {
      scene: scenePath,
      objectId: 'tank:ui/start',
      componentId: 'tank:ui/start/transform',
      data: { anchor: { x: 0.5, y: 0.48 }, size: { x: 220, y: 56 } },
    },
  );
  const uiAfter = captureProject(registry, 'ui-after');
  assert.equal(
    uiAfter.diagnostics.some(
      (item) => item.code === 'RUNTIME_UI_BOUNDS_OVERFLOW',
    ),
    false,
  );
  changes.rollback(uiRepair.id);
  assertDiagnostic(
    captureProject(registry, 'ui-rollback'),
    'RUNTIME_UI_BOUNDS_OVERFLOW',
  );
  applyChange(
    changes,
    'Restore start button after rollback proof',
    'scene.component.update',
    {
      scene: scenePath,
      objectId: 'tank:ui/start',
      componentId: 'tank:ui/start/transform',
      data: { anchor: { x: 0.5, y: 0.48 }, size: { x: 220, y: 56 } },
    },
  );

  const spritePath = join(
    projectRoot,
    'assets',
    'imported',
    'tank-sprite-v1.svg',
  );
  appendFileSync(spritePath, '\n<!-- P30 hash mismatch fixture -->\n');
  const hashBefore = captureProject(registry, 'hash-before');
  assertDiagnostic(hashBefore, 'RUNTIME_RESOURCE_HASH_MISMATCH', {
    assetId: 'tank-arena-example:asset/tank-sprite-v1',
  });
  const hashRepair = applyChange(
    changes,
    'Reimport changed tank sprite and refresh its source hash',
    'resource.reimport',
    { path: 'assets/imported/tank-sprite-v1.svg' },
  );
  const hashAfter = captureProject(registry, 'hash-after');
  assert.equal(
    hashAfter.diagnostics.some(
      (item) => item.code === 'RUNTIME_RESOURCE_HASH_MISMATCH',
    ),
    false,
  );
  changes.rollback(hashRepair.id);
  assertDiagnostic(
    captureProject(registry, 'hash-rollback'),
    'RUNTIME_RESOURCE_HASH_MISMATCH',
  );
  applyChange(
    changes,
    'Reimport tank sprite after rollback proof',
    'resource.reimport',
    { path: 'assets/imported/tank-sprite-v1.svg' },
  );

  const assetManifestPath = join(projectRoot, 'assets', 'asset-manifest.json');
  const manifest = JSON.parse(readFileSync(assetManifestPath, 'utf8')) as {
    assets: Array<{ id: string; path: string }>;
  };
  const fireAsset = manifest.assets.find(
    (asset) => asset.id === 'tank-arena-example:asset/fire-v1',
  );
  assert(fireAsset);
  fireAsset.path = 'assets/imported/missing-fire-v1.wav';
  writeFileSync(assetManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const audioInputs = [
    ...startInputs,
    { tick: 2, action: 'fire', value: 1 },
    { tick: 3, action: 'fire', value: 0 },
  ];
  const audioBefore = navigate('audio-before', 12, audioInputs).observation;
  assertDiagnostic(audioBefore, 'RUNTIME_AUDIO_CLIP_MISSING', {
    assetId: 'tank-arena-example:asset/fire-v1',
  });
  const audioRepair = applyChange(
    changes,
    'Repair missing fire sound resource path',
    'resource.repair_reference',
    {
      missingPath: 'assets/imported/missing-fire-v1.wav',
      replacementPath: 'assets/imported/fire-v1.wav',
    },
  );
  const audioAfter = navigate('audio-after', 12, audioInputs).observation;
  assert.equal(
    audioAfter.diagnostics.some(
      (item) => item.code === 'RUNTIME_AUDIO_CLIP_MISSING',
    ),
    false,
  );
  changes.rollback(audioRepair.id);
  assertDiagnostic(
    navigate('audio-rollback', 12, audioInputs).observation,
    'RUNTIME_AUDIO_CLIP_MISSING',
  );
  applyChange(
    changes,
    'Restore fire sound path after rollback proof',
    'resource.repair_reference',
    {
      missingPath: 'assets/imported/missing-fire-v1.wav',
      replacementPath: 'assets/imported/fire-v1.wav',
    },
  );

  const packageObservation = registry.captureExternalRuntimeObservation({
    result: menu.result,
    source: 'player',
    checkpointId: 'package-unreachable',
    inputLogId: 'package-fixture',
    viewport: [640, 360],
    assetRoot: projectRoot,
    reachableAssetPaths: new Set<string>(),
    audioBuses: registry.snapshot().audioBuses,
  });
  assertDiagnostic(packageObservation, 'RUNTIME_PACKAGE_RESOURCE_UNREACHABLE', {
    assetId: 'tank-arena-example:asset/tank-sprite-v1',
  });

  const originalScene = JSON.parse(sceneBefore) as {
    objects: Array<{
      id: string;
      components: Array<{ type: string; data: unknown }>;
    }>;
  };
  const finalScene = JSON.parse(
    readFileSync(join(projectRoot, scenePath), 'utf8'),
  ) as typeof originalScene;
  const gameplayComponents = (scene: typeof originalScene, objectId: string) =>
    scene.objects
      .find((object) => object.id === objectId)
      ?.components.filter((component) =>
        [
          'physics:collider2d',
          'physics:rigidbody2d',
          'tank:unit',
          'tank:enemy-state',
          'tank:weapon',
        ].includes(component.type),
      );
  for (const objectId of [
    'tank:player',
    'tank:enemy-1',
    'tank:enemy-2',
    'tank:enemy-3',
  ]) {
    assert.deepEqual(
      gameplayComponents(finalScene, objectId),
      gameplayComponents(originalScene, objectId),
    );
  }

  const evidencePairs = [
    [missingBefore, missingAfter, missingRepair],
    [visualBefore, visualAfter, visualRepair],
    [uiBefore, uiAfter, uiRepair],
    [hashBefore, hashAfter, hashRepair],
    [audioBefore, audioAfter, audioRepair],
  ] as const;
  for (const [before, after, change] of evidencePairs) {
    assert.notEqual(before.observationId, after.observationId);
    assert.match(change.id, /^changeset:/u);
    assert.equal(change.status, 'applied');
  }
  for (const seed of [missingSeed, visualSeed, uiSeed]) {
    assert.match(seed.id, /^changeset:/u);
  }

  console.log(
    JSON.stringify(
      {
        gate: 'P30 runtime observation and semantic repair',
        checkpoints: {
          menu: menu.observation.observationId,
          play: play.observation.observationId,
          pause: paused.observation.observationId,
          win: won.observation.observationId,
          lose: lost.observation.observationId,
          restart: restart.observation.observationId,
        },
        inspectablePng: menu.observation.frameArtifact.sha256,
        deterministicFrame: menuAgain.observation.frameArtifact.sha256,
        persistedObservationRead: true,
        incompatibleObservationMigrationRejected: true,
        unaddressableObservationRejected: true,
        malformedObservationRejected: true,
        tamperedFrameRejected: true,
        invalidObservationIdRejected: true,
        checkpointMismatchRejected: true,
        seededDefects: [
          'missing-texture/fallback',
          'hash-mismatch',
          'pivot/layer-occlusion',
          'ui-overflow',
          'missing-audio',
          'package-resource-unreachable',
        ],
        repairs: evidencePairs.map(([before, after, change]) => ({
          changeSetId: change.id,
          beforeObservationId: before.observationId,
          afterObservationId: after.observationId,
        })),
        rollbackVerified: true,
        gameplayAndCollisionSemanticsPreserved: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
