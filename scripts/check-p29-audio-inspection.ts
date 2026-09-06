import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inspectAudioCandidate } from '../studio/workspace/audio-candidate-inspection.ts';
import { ProjectError } from '../studio/project/project-types.ts';

const root = resolve(import.meta.dirname, '..');
const player =
  process.argv[2] ??
  join(
    root,
    'target/debug',
    process.platform === 'win32' ? 'ai-game-player.exe' : 'ai-game-player',
  );
const mp3 = Buffer.from(
  readFileSync(
    join(root, 'crates/player/tests/fixtures/tone.mp3.hex'),
    'utf8',
  ).replace(/\s/gu, ''),
  'hex',
);
const info = inspectAudioCandidate(mp3, 'audio/mpeg', player);
assert.equal(info.codec, 'mp3');
assert.equal(info.channels, 1);
assert.equal(info.sampleRateHz, 44100);
assert(info.durationMs >= 100 && info.durationMs <= 160);
const reject = (data: Buffer, mime: string, code: string) =>
  assert.throws(
    () => inspectAudioCandidate(data, mime, player),
    (error: unknown) => error instanceof ProjectError && error.code === code,
  );
reject(
  Buffer.from('ID3P29-DETERMINISTIC-AUDIO'),
  'audio/mpeg',
  'ASSET_AUDIO_DECODE_FAILED',
);
reject(Buffer.alloc(0), 'audio/mpeg', 'ASSET_AUDIO_SIZE_INVALID');
reject(
  Buffer.alloc(25 * 1024 * 1024 + 1),
  'audio/mpeg',
  'ASSET_AUDIO_SIZE_INVALID',
);
reject(mp3, 'audio/wav', 'ASSET_AUDIO_MIME_MISMATCH');
assert.throws(
  () =>
    inspectAudioCandidate(
      mp3,
      'audio/mpeg',
      join(root, 'absent-inspector.exe'),
    ),
  (error: unknown) =>
    error instanceof ProjectError &&
    error.code === 'ASSET_AUDIO_INSPECTOR_UNAVAILABLE',
);

// A valid PCM WAV with an extra JUNK chunk defeats the old fixed-offset reader.
const wav = Buffer.alloc(56 + 1600);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('JUNK', 36);
wav.writeUInt32LE(4, 40);
wav.write('test', 44);
wav.write('data', 48);
wav.writeUInt32LE(1600, 52);
for (let i = 0; i < 800; i++)
  wav.writeInt16LE(
    Math.round(8000 * Math.sin((i * 2 * Math.PI * 440) / 8000)),
    56 + 2 * i,
  );
const pcm = inspectAudioCandidate(wav, 'audio/wav', player);
assert.deepEqual(pcm, {
  kind: 'audio',
  codec: 'pcm_s16le',
  durationMs: 100,
  sampleRateHz: 8000,
  channels: 1,
});
reject(wav, 'audio/mpeg', 'ASSET_AUDIO_MIME_MISMATCH');
const broken = Buffer.from(wav);
broken.writeUInt16LE(0, 22);
reject(broken, 'audio/wav', 'ASSET_AUDIO_DECODE_FAILED');
console.log(
  JSON.stringify({
    gate: 'P29 decoded audio metadata',
    mp3: info,
    pcm,
    rejects: [
      'fake-mp3',
      'empty',
      'oversized',
      'mismatched-mime',
      'invalid-wav',
      'missing-inspector',
    ],
    result: 'passed',
  }),
);
