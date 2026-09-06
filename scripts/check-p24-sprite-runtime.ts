import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';
import { StudioGameBuildService } from '../studio/workspace/studio-game-build-service.ts';
import type { SceneDocument } from '../studio/workspace/scene-authoring-service.ts';

const repository = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p24-sprite-'));
const projectRoot = join(temporary, 'pong-2d');
const hostPath = join(
  repository,
  'target',
  'debug',
  process.platform === 'win32'
    ? 'project-script-host.exe'
    : 'project-script-host',
);
const playerPath = join(
  repository,
  'target',
  'debug',
  process.platform === 'win32' ? 'ai-game-player.exe' : 'ai-game-player',
);

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function testSpritePng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.from([
    0, 255, 64, 32, 255, 32, 192, 255, 255, 0, 16, 96, 255, 255, 255, 224, 64,
    255,
  ]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

try {
  cpSync(join(repository, 'examples', 'pong-2d'), projectRoot, {
    recursive: true,
  });
  const spriteBytes = testSpritePng();
  const spritePath = 'assets/imported/player.png';
  mkdirSync(join(projectRoot, 'assets', 'imported'), { recursive: true });
  writeFileSync(join(projectRoot, spritePath), spriteBytes);
  const orphanPath = 'assets/imported/orphan.png';
  writeFileSync(join(projectRoot, orphanPath), spriteBytes);
  const sha256 = createHash('sha256').update(spriteBytes).digest('hex');
  writeFileSync(
    join(projectRoot, 'assets', 'asset-manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: '1.0.0',
        assets: [
          {
            id: 'pong:asset/player',
            path: spritePath,
            kind: 'image',
            mime: 'image/png',
            bytes: spriteBytes.length,
            sha256,
            source: { type: 'import', originalName: 'player.png' },
            status: 'ready',
          },
          {
            id: 'pong:asset/orphan',
            path: orphanPath,
            kind: 'image',
            mime: 'image/png',
            bytes: spriteBytes.length,
            sha256,
            source: { type: 'import', originalName: 'orphan.png' },
            status: 'ready',
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  const scenePath = join(projectRoot, 'scenes', 'main.game.json');
  const scene = JSON.parse(readFileSync(scenePath, 'utf8')) as SceneDocument;
  const ball = scene.objects.find((object) => object.id === 'pong:ball');
  assert(ball);
  ball.components = ball.components.filter(
    (component) => component.type !== 'render:shape2d',
  );
  ball.components.push({
    id: 'pong:ball/sprite',
    type: 'render:sprite2d',
    enabled: true,
    data: {
      texture: 'pong:asset/player',
      size: { x: 1.5, y: 2 },
      pivot: { x: 0.25, y: 0.75 },
      tint: '#80ffccbf',
      filter: 'nearest',
      layer: 9,
      atlasRegion: '0,0,2,2',
    },
  });
  writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`, 'utf8');
  const unusedScene = structuredClone(scene);
  unusedScene.id = 'pong:scene/unused';
  unusedScene.name = 'Unused Scene';
  writeFileSync(
    join(projectRoot, 'scenes', 'unused.game.json'),
    `${JSON.stringify(unusedScene, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    join(projectRoot, 'scripts', 'behaviors', 'unused.ts'),
    `import { defineBehavior } from '@aigame/sdk';\nexport default defineBehavior({});\n`,
    'utf8',
  );
  const runtimePath = join(projectRoot, 'scripts', 'runtime.json');
  const runtimeManifest = JSON.parse(readFileSync(runtimePath, 'utf8')) as {
    modules: Array<Record<string, unknown>>;
  };
  runtimeManifest.modules.push({
    id: 'pong:behavior/unused',
    kind: 'behavior',
    source: 'scripts/behaviors/unused.ts',
  });
  writeFileSync(
    runtimePath,
    `${JSON.stringify(runtimeManifest, null, 2)}\n`,
    'utf8',
  );

  const runtime = new ProjectScriptRuntime({
    projectRoot,
    scriptHostPath: hostPath,
  });
  const result = runtime.run({ ticks: 1, persistTrace: false });
  assert.equal(result.status, 'completed');
  const sprite = result.renderSnapshot.payload.drawables.find(
    (drawable) => drawable.id === 'pong:ball/sprite',
  );
  assert(sprite);
  assert.equal(sprite.primitive, 'sprite2d');
  assert.equal(sprite.asset?.projectPath, spritePath);
  assert.equal(sprite.asset?.sourceHash, sha256);
  assert.deepEqual(sprite.pivot, [0.25, 0.75]);
  assert.deepEqual(sprite.atlasRegion, [0, 0, 2, 2]);
  assert.equal(sprite.filter, 'nearest');
  assert.equal(sprite.layer, 9);

  const build = new StudioGameBuildService({
    projectRoot,
    runtimeExecutablePath: playerPath,
    scriptHostPath: hostPath,
    engineVersion: '0.3.0-preview.1',
  }).build('development');
  const packagedAsset = join(build.outputDirectory, 'game', spritePath);
  assert.deepEqual(readFileSync(packagedAsset), spriteBytes);
  assert.equal(build.reachability.assets.includes(spritePath), true);
  assert.deepEqual(build.reachability.orphanedAssets, [orphanPath]);
  assert.equal(
    build.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'BUILD_ASSET_ORPHANED' &&
        diagnostic.path === orphanPath,
    ),
    true,
  );
  assert.equal(
    readFileSync(
      join(build.outputDirectory, 'game', 'player-package.json'),
      'utf8',
    ).includes('pong:behavior/unused'),
    false,
  );
  assert.equal(
    readFileSync(
      join(build.outputDirectory, 'game', 'player-package.json'),
      'utf8',
    ).includes('unused.game.json'),
    false,
  );
  assert.equal(
    (() => {
      try {
        readFileSync(join(build.outputDirectory, 'game', orphanPath));
        return true;
      } catch {
        return false;
      }
    })(),
    false,
  );
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
  const report = JSON.parse(verification.stdout) as {
    projectionProtocol: string;
    validatedImageCount: number;
    renderer: string;
  };
  assert.equal(report.projectionProtocol, '3.0.0-preview.1');
  assert.equal(report.validatedImageCount, 1);
  assert.equal(report.renderer, 'wgpu-runtime-render-snapshot');

  const playerSource = readFileSync(
    join(repository, 'crates', 'player', 'src', 'main.rs'),
    'utf8',
  );
  assert(playerSource.includes('image::load_from_memory'));
  assert(playerSource.includes('queue.write_texture'));
  assert(playerSource.includes('texture_cache'));
  assert(playerSource.includes('atlas_region'));

  console.log(
    JSON.stringify(
      {
        gate: 'P24 Sprite2D resource and native Player pipeline',
        assetId: sprite.asset.id,
        sourceHash: sha256,
        projection: {
          pivot: sprite.pivot,
          tint: sprite.tint,
          filter: sprite.filter,
          layer: sprite.layer,
          atlasRegion: sprite.atlasRegion,
        },
        player: report,
        packagedAsset: spritePath,
        reachability: build.reachability,
        diagnostics: build.diagnostics,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
