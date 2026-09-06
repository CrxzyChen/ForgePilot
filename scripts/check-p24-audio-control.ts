import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';
import { RuntimeSessionService } from '../studio/runtime/runtime-session-service.ts';
import { RuntimeObservationService } from '../studio/runtime/runtime-observation-service.ts';

const root = resolve(import.meta.dirname, '..');
const evidence = mkdtempSync(join(root, 'artifacts/p24-audio-control-'));
const projectRoot = join(evidence, 'project');
cpSync(join(root, 'examples/pong-2d'), projectRoot, {
  recursive: true,
  filter: (path) =>
    !['.git', '.aigame', 'out', 'dist'].includes(
      path.split(/[\\/]/u).at(-1) ?? '',
    ),
});
const json = (path: string) =>
  JSON.parse(readFileSync(join(projectRoot, path), 'utf8'));
const save = (path: string, value: unknown) =>
  writeFileSync(join(projectRoot, path), JSON.stringify(value, null, 2));
const sourcePath = join(projectRoot, 'scripts/behaviors/audio-control.ts');
const sdkPath = join(projectRoot, 'scripts/game-sdk.d.ts');
// Enable the proposed signature only inside this isolated red/green fixture.
// Production projects must obtain the installed SDK through script.api + ChangeSet.
writeFileSync(
  sdkPath,
  readFileSync(sdkPath, 'utf8').replaceAll(
    'Audio(instanceId: string)',
    'Audio(instanceId: string, busId?: string)',
  ),
);
const scene = json('scenes/main.game.json');
scene.objects
  .find((object: { id: string }) => object.id === 'pong:ball')
  .components.push({
    id: 'probe:audio-script',
    type: 'core:script',
    enabled: true,
    data: { path: 'scripts/behaviors/audio-control.ts', enabled: true },
  });
save('scenes/main.game.json', scene);
const nextScene = structuredClone(scene);
nextScene.id = 'probe:destination';
for (const object of nextScene.objects)
  object.components = object.components.filter(
    (component: { id: string }) => component.id !== 'probe:audio-script',
  );
save('scenes/next.game.json', nextScene);
const manifest = json('scripts/runtime.json');
manifest.modules.push({
  id: 'probe:audio-module',
  kind: 'behavior',
  source: 'scripts/behaviors/audio-control.ts',
});
save('scripts/runtime.json', manifest);
const mp3 = Buffer.from(
  readFileSync(
    join(root, 'crates/player/tests/fixtures/tone.mp3.hex'),
    'utf8',
  ).replace(/\s/gu, ''),
  'hex',
);
mkdirSync(join(projectRoot, 'assets/imported'), { recursive: true });
writeFileSync(join(projectRoot, 'assets/imported/probe.mp3'), mp3);
save('assets/asset-manifest.json', {
  schemaVersion: '1.0.0',
  assets: [
    {
      id: 'probe:audio',
      path: 'assets/imported/probe.mp3',
      kind: 'audio',
      mime: 'audio/mpeg',
      bytes: mp3.length,
      sha256: createHash('sha256').update(mp3).digest('hex'),
      status: 'ready',
      source: { type: 'import', originalName: 'probe.mp3' },
    },
  ],
});
const buses = [{ id: 'probe:bus/music', volume: 1, muted: false }];
save('audio/buses.json', { schemaVersion: '1.0.0', buses });
const writeBehavior = (
  busExpression = "'probe:bus/music'",
  includeArgument = true,
) =>
  writeFileSync(
    sourcePath,
    `import { defineBehavior } from '@aigame/sdk';
export default defineBehavior({
  onStart(ctx) { ctx.playAudio('probe:audio', { instanceId:'probe:instance/music', busId:${busExpression}, loop:true }); },
  onFixedUpdate(ctx) {
    if(ctx.tick===0) ctx.pauseAudio('probe:instance/music'${includeArgument ? `, ${busExpression}` : ''});
    if(ctx.tick===1) ctx.resumeAudio('probe:instance/music'${includeArgument ? `, ${busExpression}` : ''});
    if(ctx.tick===2) ctx.loadScene('scenes/next.game.json');
  },
  onDestroy(ctx) { ctx.stopAudio('probe:instance/music'${includeArgument ? `, ${busExpression}` : ''}); },
});`,
  );
writeBehavior();
const runtime = new ProjectScriptRuntime({
  projectRoot,
  scriptHostPath: join(root, 'target/debug/project-script-host.exe'),
});
const options = { ticks: 4, seed: 7, persistTrace: false };
const continuous = runtime.run(options);
assert.equal(continuous.status, 'completed');
assert.deepEqual(
  continuous.audioEvents.map((event) => event.payload.action),
  ['play', 'pause', 'resume', 'stop'],
);
assert.deepEqual(
  continuous.audioEvents.map((event) => event.payload.busId),
  Array(4).fill('probe:bus/music'),
  'All control events must preserve the explicitly selected Bus',
);
const session = new RuntimeSessionService(runtime);
const first = session.start({ ...options, ticks: 1 });
session.pause();
const events = [...first.audioEvents];
for (let tick = 1; tick < 4; tick++)
  events.push(...session.advancePaused(1).audioEvents);
const semantic = (audio: typeof events) =>
  audio.map((event) => ({ tick: event.tick, payload: event.payload }));
assert.deepEqual(semantic(events), semantic(continuous.audioEvents));
assert.equal(session.result?.stateHash, continuous.stateHash);
assert.deepEqual(
  semantic(session.restart(4).audioEvents),
  semantic(continuous.audioEvents),
);
const observer = new RuntimeObservationService({
  projectRoot,
  playerExecutablePath: join(root, 'target/debug/ai-game-player.exe'),
});
const observed = observer.captureResult(continuous, {
  source: 'studio',
  checkpointId: 'audio-control-custom-bus',
  audioBuses: buses,
  viewport: [640, 360],
});
assert.deepEqual(observed.audio.failedPlaybackIds, []);
assert.deepEqual(observed.audio.missingClipIds, []);
assert.equal(
  observed.diagnostics.some((d) => d.severity === 'error'),
  false,
);
// The observer must still reject a fabricated undeclared Bus: do not weaken it.
const corrupted = structuredClone(continuous);
corrupted.audioEvents[3] = {
  ...corrupted.audioEvents[3]!,
  payload: { ...corrupted.audioEvents[3]!.payload, busId: 'probe:bus/missing' },
};
const rejected = observer.captureResult(corrupted, {
  source: 'studio',
  checkpointId: 'audio-control-invalid-bus',
  audioBuses: buses,
  viewport: [640, 360],
});
assert.equal(rejected.audio.failedPlaybackIds.length, 1);
assert(
  rejected.diagnostics.some((d) => d.code === 'RUNTIME_AUDIO_BUS_UNKNOWN'),
);
writeBehavior("'audio:bus/master'", false);
const legacy = runtime.run(options);
assert.equal(legacy.status, 'completed');
assert.deepEqual(
  legacy.audioEvents.map((event) => event.payload.busId),
  Array(4).fill('audio:bus/master'),
);
for (const method of ['stopAudio', 'pauseAudio', 'resumeAudio']) {
  for (const invalid of ["''", 'null', '42', '{}']) {
    writeFileSync(
      sourcePath,
      `export default {onStart(ctx) {ctx.${method}('probe:instance/music', ${invalid});}};`,
    );
    const result = runtime.run({ ...options, ticks: 1 });
    assert.equal(result.status, 'failed', `${method} must reject ${invalid}`);
    assert.equal(result.audioEvents.length, 0);
    assert(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes(`${method} expects a bus ID`),
      ),
      'The native argument guard must fail, not an unrelated compiler error',
    );
  }
}
const summary = {
  gate: 'P24 explicit Audio control Bus',
  result: 'passed',
  actions: ['play', 'pause', 'resume', 'stop'],
  splitTicks: [1, 1, 1, 1],
  restart: true,
  sceneDestroy: true,
  observedAudioErrors: 0,
  undeclaredBusRejected: true,
  invalidArguments: 12,
  legacyDefault: true,
  evidence,
};
writeFileSync(join(evidence, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
