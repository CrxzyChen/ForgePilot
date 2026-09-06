import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p24-audio-'));
const projectRoot = join(temporary, 'pong-2d');
const useMp3 = process.argv.includes('--mp3');
const executable = (name: string) =>
  join(
    repository,
    'target',
    'debug',
    process.platform === 'win32' ? `${name}.exe` : name,
  );

function wavTone(): Buffer {
  const sampleRate = 8_000;
  const samples = 800;
  const dataBytes = samples * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.round(
      Math.sin((index * 2 * Math.PI * 440) / sampleRate) * 8_000,
    );
    bytes.writeInt16LE(sample, 44 + index * 2);
  }
  return bytes;
}

try {
  cpSync(join(repository, 'examples', 'pong-2d'), projectRoot, {
    recursive: true,
  });
  const audio = useMp3
    ? Buffer.from(
        readFileSync(
          join(repository, 'crates/player/tests/fixtures/tone.mp3.hex'),
          'utf8',
        ).replace(/\s/gu, ''),
        'hex',
      )
    : wavTone();
  const audioPath = `assets/imported/beep.${useMp3 ? 'mp3' : 'wav'}`;
  mkdirSync(join(projectRoot, 'assets', 'imported'), { recursive: true });
  writeFileSync(join(projectRoot, audioPath), audio);
  const sha256 = createHash('sha256').update(audio).digest('hex');
  writeFileSync(
    join(projectRoot, 'assets', 'asset-manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: '1.0.0',
        assets: [
          {
            id: 'pong:asset/beep',
            path: audioPath,
            kind: 'audio',
            mime: useMp3 ? 'audio/mpeg' : 'audio/wav',
            bytes: audio.length,
            sha256,
            status: 'ready',
            source: {
              type: 'import',
              originalName: `beep.${useMp3 ? 'mp3' : 'wav'}`,
            },
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
  ball.components.push({
    id: 'pong:ball/audio-script',
    type: 'core:script',
    enabled: true,
    data: { path: 'scripts/behaviors/audio.ts', enabled: true },
  });
  writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(projectRoot, 'scripts', 'behaviors', 'audio.ts'),
    `import { defineBehavior } from '@aigame/sdk';
export default defineBehavior({
  onStart(context) {
    context.playAudio('pong:asset/beep', { instanceId: 'audio:instance/beep', busId: 'audio:bus/sfx', volume: 0.5, loop: true });
    context.setAudioBus('audio:bus/sfx', { volume: 0.75, muted: false });
  },
  onFixedUpdate(context) {
    if (context.tick === 0) context.pauseAudio('audio:instance/beep', 'audio:bus/sfx');
    if (context.tick === 1) context.resumeAudio('audio:instance/beep', 'audio:bus/sfx');
    if (context.tick === 2) context.stopAudio('audio:instance/beep', 'audio:bus/sfx');
  },
});
`,
    'utf8',
  );
  const runtimePath = join(projectRoot, 'scripts', 'runtime.json');
  const manifest = JSON.parse(readFileSync(runtimePath, 'utf8')) as {
    modules: Array<Record<string, unknown>>;
  };
  manifest.modules.push({
    id: 'pong:behavior/audio',
    kind: 'behavior',
    source: 'scripts/behaviors/audio.ts',
  });
  writeFileSync(runtimePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const runtime = new ProjectScriptRuntime({
    projectRoot,
    scriptHostPath: executable('project-script-host'),
  });
  const result = runtime.run({ ticks: 3, persistTrace: false });
  assert.equal(result.status, 'completed');
  assert.deepEqual(
    result.audioEvents.map((event) => event.payload.action),
    ['play', 'set-volume', 'set-muted', 'pause', 'resume', 'stop'],
  );
  const play = result.audioEvents[0]!;
  assert.equal(play.protocolVersion, '3.0.0-preview.1');
  assert.equal(play.payload.clip?.projectPath, audioPath);
  assert.equal(play.payload.clip?.sourceHash, sha256);
  assert.equal(play.payload.busId, 'audio:bus/sfx');
  assert.equal(play.payload.volume, 0.5);
  assert.equal(play.payload.loop, true);
  assert(
    result.audioEvents.every(
      (event) => event.payload.busId === 'audio:bus/sfx',
    ),
  );

  const build = new StudioGameBuildService({
    projectRoot,
    runtimeExecutablePath: executable('ai-game-player'),
    scriptHostPath: executable('project-script-host'),
    engineVersion: '0.3.0-preview.1',
  }).build('development');
  assert.deepEqual(
    readFileSync(join(build.outputDirectory, 'game', audioPath)),
    audio,
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
    validatedAudioCount: number;
  };
  assert.equal(report.validatedAudioCount, 1);

  const playerSource = readFileSync(
    join(repository, 'crates', 'player', 'src', 'main.rs'),
    'utf8',
  );
  const studioSource = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'Workbench.tsx'),
    'utf8',
  );
  assert(playerSource.includes('OutputStreamBuilder::open_default_stream'));
  assert(playerSource.includes('Decoder::try_from'));
  assert(studioSource.includes('new Audio(source)'));
  assert(studioSource.includes('audioBusesRef'));

  console.log(
    JSON.stringify(
      {
        gate: 'P24 AudioEvent and Studio/Player audio adapters',
        fixtureFormat: useMp3 ? 'mp3' : 'wav',
        actions: result.audioEvents.map((event) => ({
          action: event.payload.action,
          tick: event.tick,
          eventId: event.payload.eventId,
        })),
        clip: play.payload.clip,
        validatedAudioCount: report.validatedAudioCount,
        studioAdapter: 'HTMLAudioElement',
        playerAdapter: 'rodio',
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
