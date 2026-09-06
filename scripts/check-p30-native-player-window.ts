import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const temporary = mkdtempSync(join(tmpdir(), 'aigame-native-window-'));
const player = resolve(process.argv[2] ?? 'target/debug/ai-game-player.exe');
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const red = [255, 0, 0, 255];
const green = [0, 255, 0, 255];
const blue = [0, 0, 255, 255];
const yellow = [255, 255, 0, 255];
let passed = false;

function chunk(name: string, bytes: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(name), bytes]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, body, checksum]);
}

function readRgbaPng(path: string) {
  const bytes = readFileSync(path);
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8);
  assert.equal(bytes[25], 6);
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  assert.equal(rows.length, (stride + 1) * height);
  const decoded = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)]!;
    assert(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const a = x >= 4 ? decoded[index - 4]! : 0;
      const b = y ? decoded[index - stride]! : 0;
      const c = y && x >= 4 ? decoded[index - stride - 4]! : 0;
      const p = a + b - c;
      const distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth =
        distances[0]! <= distances[1]! && distances[0]! <= distances[2]!
          ? a
          : distances[1]! <= distances[2]!
            ? b
            : c;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth][filter]!;
      decoded[index] = (rows[y * (stride + 1) + x + 1]! + prediction) & 255;
    }
  }
  return {
    width,
    height,
    bytes,
    pixel: (x: number, y: number) => [
      ...decoded.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
    ],
  };
}

try {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  const texture = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk(
      'IDAT',
      deflateSync(Buffer.from([0, ...red, ...green, 0, ...blue, ...yellow])),
    ),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(join(temporary, 'checker.png'), texture);
  const transform = (id: string, x: number) => ({
    id: `${id}/transform`,
    type: 'core:transform2d',
    enabled: true,
    data: { position: { x, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
  });
  const sprite = (
    id: string,
    x: number,
    pivot: { x: number; y: number },
    region: string,
  ) => ({
    id,
    name: id,
    enabled: true,
    visible: true,
    parentId: null,
    order: 0,
    components: [
      transform(id, x),
      {
        id: `${id}/sprite`,
        type: 'render:sprite2d',
        enabled: true,
        data: {
          texture: 'test:checker',
          size: { x: 4, y: 4 },
          pivot,
          tint: '#ffffff',
          filter: 'nearest',
          layer: 1,
          atlasRegion: region,
        },
      },
    ],
  });
  const scene = {
    schemaVersion: '2.0.0-alpha.1',
    id: 'test:scene',
    name: 'Native GPU fixture',
    space: '2d',
    objects: [
      {
        id: 'test:camera',
        name: 'Camera',
        enabled: true,
        visible: true,
        parentId: null,
        order: 0,
        components: [
          transform('test:camera', 0),
          {
            id: 'test:camera/projection',
            type: 'render:camera2d',
            enabled: true,
            data: { primary: true, zoom: 1, clearColor: '#000000' },
          },
        ],
      },
      sprite('test:offset-pivot', -8, { x: 0.25, y: 0.75 }, '0,0,1,1'),
      sprite('test:pixel-crop', 0, { x: 0.5, y: 0.5 }, '1,0,1,2'),
      {
        id: 'test:ui',
        name: 'UI atlas',
        enabled: true,
        visible: true,
        parentId: null,
        order: 0,
        components: [
          {
            id: 'test:ui/transform',
            type: 'core:ui-transform',
            enabled: true,
            data: { anchor: { x: 0.75, y: 0.5 }, size: { x: 160, y: 160 } },
          },
          {
            id: 'test:ui/image',
            type: 'ui:image',
            enabled: true,
            data: {
              texture: 'test:checker',
              tint: '#ffffff',
              filter: 'nearest',
              atlasRegion: '0,0,1,1',
            },
          },
        ],
      },
    ],
  };
  const packagePath = join(temporary, 'fixture.json');
  writeFileSync(
    packagePath,
    JSON.stringify({
      schemaVersion: '1.0.0',
      kind: 'ai-game-studio/player-package',
      project: {
        id: 'test:native-gpu',
        name: 'Native GPU acceptance',
        version: '1',
      },
      entryScene: 'test:scene',
      scene,
      scenes: { 'test:scene': scene },
      prefabs: {},
      inputActions: [],
      audioBuses: [],
      assets: [
        {
          id: 'test:checker',
          path: 'checker.png',
          kind: 'image',
          mime: 'image/png',
          sha256: hash(texture),
          bytes: texture.length,
          status: 'ready',
        },
      ],
      runtime: {
        tickRate: 60,
        memoryBytes: 67_108_864,
        stackBytes: 1_048_576,
        modules: [],
        manifest: {
          schemaVersion: '2.0.0-alpha.1',
          sdkVersion: '0.2.0-alpha.1',
          modules: [],
          systems: [],
          commands: [],
          events: [],
          schedule: [
            'engine:input',
            'engine:fixed-update',
            'engine:snapshot',
            'engine:presentation',
          ],
          budgets: {
            memoryBytes: 67_108_864,
            stackBytes: 1_048_576,
            instructionsPerTick: 1_000_000,
            eventsPerTick: 4096,
          },
        },
      },
    }),
  );
  const output = join(temporary, 'gpu.png');
  const result = spawnSync(
    player,
    ['--package', packagePath, '--smoke', '5', '--smoke-capture', output],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 45_000,
      env: {
        NODE_ENV: 'production',
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
      },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.framesPresented, 5);
  assert.equal(report.capturedGpuFrame, true);
  assert.equal(report.renderer, 'wgpu-surface');
  const frame = readRgbaPng(output);
  console.log(
    JSON.stringify({
      report,
      width: frame.width,
      height: frame.height,
      output,
    }),
  );
  const samples = [
    [300, 260, red],
    [420, 260, green],
    [300, 380, blue],
    [420, 380, yellow],
    [600, 300, green],
    [600, 420, yellow],
    [900, 300, red],
    [1000, 300, green],
    [900, 420, blue],
    [1000, 420, yellow],
  ] as const;
  for (const [x, y, color] of samples)
    assert.deepEqual(
      frame.pixel(
        Math.floor((x * frame.width) / 1280),
        Math.floor((y * frame.height) / 720),
      ),
      color,
      `GPU pixel ${x},${y}`,
    );
  const invalid = spawnSync(
    player,
    ['--package', packagePath, '--smoke', '121'],
    { encoding: 'utf8', windowsHide: true, timeout: 10_000 },
  );
  // Rotate an asymmetric quadrant texture around a noncentral pivot. GPU pixels,
  // rather than matching snapshots alone, prove the public degree convention.
  const rotationEvidence = [];
  for (const degrees of [0, 90, -90, 180]) {
    const rotated = structuredClone(scene);
    const object = rotated.objects.find(
      (item) => item.id === 'test:offset-pivot',
    )!;
    const transformData = object.components.find(
      (item) => item.type === 'core:transform2d',
    )!.data as { rotation: number };
    transformData.rotation = degrees;
    const payload = JSON.parse(readFileSync(packagePath, 'utf8'));
    payload.scene = rotated;
    payload.scenes[rotated.id] = rotated;
    writeFileSync(packagePath, JSON.stringify(payload));
    const capture = join(temporary, `rotation-${degrees}.png`);
    const rotationRun = spawnSync(
      player,
      ['--package', packagePath, '--smoke', '2', '--smoke-capture', capture],
      { encoding: 'utf8', windowsHide: true, timeout: 45000 },
    );
    assert.equal(rotationRun.status, 0, rotationRun.stderr);
    const pixels = readRgbaPng(capture);
    const radians = (degrees * Math.PI) / 180;
    // pivot world (-8,0) maps to (320,360); rotate screen displacements with Y inverted.
    for (const [x, y, color] of samples.slice(0, 4)) {
      const dx = x - 320,
        dy = y - 360;
      const rx = 320 + dx * Math.cos(radians) + dy * Math.sin(radians);
      const ry = 360 - dx * Math.sin(radians) + dy * Math.cos(radians);
      assert.deepEqual(
        pixels.pixel(
          Math.round((rx * pixels.width) / 1280),
          Math.round((ry * pixels.height) / 720),
        ),
        color,
        `rotation ${degrees} at ${rx},${ry}`,
      );
    }
    rotationEvidence.push({
      degrees,
      sha256: hash(pixels.bytes),
      pixelAssertions: 4,
    });
  }
  console.log(JSON.stringify({ rotationEvidence }));
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /frame count from 1 to 120/u);
  console.log(
    JSON.stringify(
      {
        gate: 'P30 native GPU window',
        report,
        pixelAssertions: samples.length,
        normalizedAtlas: true,
        pixelAtlas: true,
        nonCentralPivot: true,
        uiTextureOrientation: true,
        gpuFrameSha256: hash(frame.bytes),
        result: 'passed',
      },
      null,
      2,
    ),
  );
  passed = true;
} finally {
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  if (passed) rmSync(temporary, { recursive: true, force: true });
  else console.error(`Retained failed GPU evidence: ${temporary}`);
}
