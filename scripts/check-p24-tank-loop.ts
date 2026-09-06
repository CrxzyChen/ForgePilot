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
const projectRoot = join(repository, 'examples', 'tank-arena');
const hostPath = join(repository, 'target', 'debug', 'project-script-host.exe');
const playerPath = join(repository, 'target', 'debug', 'ai-game-player.exe');
const runtime = new ProjectScriptRuntime({
  projectRoot,
  scriptHostPath: hostPath,
});

function gameState(result: ProjectRuntimeResult) {
  const game = result.scene.objects.find((object) => object.id === 'tank:game');
  const state = game?.components.find(
    (component) => component.type === 'tank:game-state',
  )?.data as
    | {
        phase?: string;
        score?: number;
        enemiesRemaining?: number;
        helpVisible?: boolean;
        muted?: boolean;
        masterVolume?: number;
      }
    | undefined;
  assert(state, 'Tank game state is missing');
  return state;
}

function position(result: ProjectRuntimeResult, id: string) {
  const object = result.scene.objects.find((candidate) => candidate.id === id);
  const transform = object?.components.find(
    (component) => component.type === 'core:transform2d',
  )?.data as { position?: { x?: number; y?: number } } | undefined;
  assert(transform?.position, `${id} transform is missing`);
  return transform.position;
}

function visibleUi(result: ProjectRuntimeResult) {
  return result.renderSnapshot.payload.drawables
    .filter((drawable) => drawable.space === 'ui' && drawable.visible)
    .map((drawable) => ({ id: drawable.id, text: drawable.text }));
}

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
const winInputs = [
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

const menu = runtime.run({ ticks: 1, persistTrace: false });
assert.equal(gameState(menu).phase, 'menu');
assert(
  menu.renderSnapshot.payload.drawables.some(
    (drawable) =>
      drawable.id === 'tank:player/sprite' &&
      drawable.primitive === 'sprite2d' &&
      drawable.asset?.id === 'tank-arena-example:asset/tank-sprite-v1',
  ),
);
assert(visibleUi(menu).some((item) => item.text === 'TANK ARENA'));
assert(
  visibleUi(menu).some((item) => item.id === 'tank:ui/start/button/background'),
);
const missingAssetScene = structuredClone(menu.scene);
const missingSprite = missingAssetScene.objects
  .find((object) => object.id === 'tank:player')
  ?.components.find((component) => component.type === 'render:sprite2d');
assert(missingSprite);
missingSprite.data.texture = 'tank:asset/does-not-exist';
assert.throws(
  () =>
    runtime.run({
      sceneState: missingAssetScene,
      ticks: 1,
      persistTrace: false,
    }),
  (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'RUNTIME_RESOURCE_REFERENCE_MISSING' &&
    'details' in error &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'texture' in error.details &&
    error.details.texture === 'tank:asset/does-not-exist',
);

const paused = runtime.run({
  ticks: 40,
  persistTrace: false,
  inputs: [
    ...startInputs,
    { tick: 2, action: 'pause', value: 1 },
    { tick: 3, action: 'pause', value: 0 },
  ],
});
assert.equal(gameState(paused).phase, 'paused');
assert(visibleUi(paused).some((item) => item.text === 'PAUSED'));
const enemyAtPause = paused.snapshots.find((snapshot) => snapshot.tick === 3);
const enemyLater = paused.snapshots.at(-1);
assert(enemyAtPause && enemyLater);
const pausedY = position(
  { ...paused, scene: enemyAtPause.scene } as ProjectRuntimeResult,
  'tank:enemy-1',
).y;
const laterY = position(
  { ...paused, scene: enemyLater.scene } as ProjectRuntimeResult,
  'tank:enemy-1',
).y;
assert.equal(laterY, pausedY, 'Enemy moved while the game was paused');

const won = runtime.run({
  ticks: 560,
  seed: 20260903,
  inputs: winInputs,
  persistTrace: false,
});
assert.equal(won.status, 'completed');
assert.deepEqual(gameState(won), {
  phase: 'won',
  score: 300,
  enemiesRemaining: 0,
  helpVisible: false,
  muted: false,
  masterVolume: 0.8,
});
assert(visibleUi(won).some((item) => item.text === 'YOU WIN'));
assert(
  won.physicsEvents.some(
    (event) =>
      event.phase === 'enter' &&
      event.objectA.startsWith('tank:bullet/') &&
      event.objectB.startsWith('tank:enemy-') &&
      event.colliderA.endsWith('/collider') &&
      event.colliderB.endsWith('/collider') &&
      event.contacts.length > 0 &&
      event.normal.length === 2,
  ),
);
const audioActions = won.audioEvents.map((event) => event.payload.action);
assert(audioActions.includes('play'));
assert(
  won.audioEvents.some(
    (event) => event.payload.clip?.id === 'tank-arena-example:asset/result-v1',
  ),
);

const wonAgain = runtime.run({
  ticks: 560,
  seed: 20260903,
  inputs: winInputs,
  persistTrace: false,
});
assert.equal(wonAgain.stateHash, won.stateHash);
assert.deepEqual(wonAgain.physicsEvents, won.physicsEvents);

const firstSegment = runtime.run({
  ticks: 250,
  seed: 20260903,
  inputs: winInputs,
  persistTrace: false,
});
const secondSegment = runtime.run({
  sceneState: firstSegment.scene,
  activeScene: firstSegment.activeScene,
  startTick: firstSegment.tick,
  started: true,
  randomState: firstSegment.randomState,
  pendingEvents: firstSegment.pendingEvents,
  pendingLifecycle: firstSegment.pendingLifecycle,
  physicsContacts: firstSegment.physicsContacts,
  ticks: 310,
  seed: 20260903,
  inputs: winInputs.filter((input) => input.tick >= firstSegment.tick),
  persistTrace: false,
});
assert.equal(secondSegment.stateHash, won.stateHash);

const lost = runtime.run({
  ticks: 900,
  seed: 20260903,
  inputs: startInputs,
  persistTrace: false,
});
assert.equal(gameState(lost).phase, 'lost');
assert(visibleUi(lost).some((item) => item.text === 'GAME OVER'));

const build = new StudioGameBuildService({
  projectRoot,
  runtimeExecutablePath: playerPath,
  scriptHostPath: hostPath,
  engineVersion: '0.3.0-preview.1',
}).build('development');
for (const expected of [
  'assets/imported/tank-sprite-v1.svg',
  'assets/imported/fire-v1.wav',
  'assets/imported/hit-v1.wav',
  'assets/imported/result-v1.wav',
]) {
  assert(
    build.reachability.assets.includes(expected),
    `${expected} not packaged`,
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
  validatedImageCount: number;
  projectionProtocol: string;
};
assert.equal(playerReport.validatedImageCount, 1);
assert.equal(playerReport.projectionProtocol, '3.0.0-preview.1');
assert(
  readFileSync(
    join(repository, 'crates', 'player', 'src', 'main.rs'),
    'utf8',
  ).includes('resvg::usvg::Tree::from_data'),
);
const authoringSkill = readFileSync(
  join(projectRoot, '.agents', 'skills', 'author-2d-scene', 'SKILL.md'),
  'utf8',
);
for (const contract of [
  'render:sprite2d',
  'physics:collider2d',
  'ui:button',
  'context.playAudio',
  'input/actions.json',
]) {
  assert(authoringSkill.includes(contract), `2D Skill omitted ${contract}`);
}
const mcpSource = readFileSync(
  join(repository, 'studio', 'server', 'engine-mcp-server.ts'),
  'utf8',
);
for (const tool of [
  'component.types',
  'runtime.input',
  'runtime.read_state',
  'asset.generate',
  'asset.recommend',
  'asset.regenerate',
  'build.windows',
]) {
  assert(mcpSource.includes(`'${tool}'`), `Engine MCP omitted ${tool}`);
}
const scriptHostSource = readFileSync(
  join(repository, 'crates', 'script-host', 'src', 'lib.rs'),
  'utf8',
);
const projectHostImplementation = scriptHostSource.slice(
  scriptHostSource.indexOf('impl ProjectScriptHost'),
  scriptHostSource.indexOf('impl std::fmt::Debug for ScriptHost'),
);
const projectHostConstructor = projectHostImplementation.slice(
  0,
  projectHostImplementation.indexOf('pub fn run('),
);
const projectHostRun = projectHostImplementation.slice(
  projectHostImplementation.indexOf('pub fn run('),
);
assert(!projectHostConstructor.includes('set_interrupt_handler'));
assert(projectHostRun.includes('set_interrupt_handler(Some'));
assert(projectHostRun.includes('set_interrupt_handler(None)'));
assert(projectHostRun.includes('script.project.timeout'));

console.log(
  JSON.stringify(
    {
      gate: 'P24 complete minimum 2D Tank loop',
      menu: visibleUi(menu),
      pause: { phase: gameState(paused).phase, stableEnemyY: laterY },
      win: {
        state: gameState(won),
        tick: won.tick,
        stateHash: won.stateHash,
        collisionEnterCount: won.physicsEvents.filter(
          (event) => event.phase === 'enter',
        ).length,
        audioEventCount: won.audioEvents.length,
      },
      loss: { state: gameState(lost), tick: lost.tick },
      deterministicReplay: wonAgain.stateHash === won.stateHash,
      segmentedParity: secondSegment.stateHash === won.stateHash,
      scriptHostTimeoutResetsPerRun: true,
      missingAssetDiagnostic: 'RUNTIME_RESOURCE_REFERENCE_MISSING',
      aiParity: {
        skill: '.agents/skills/author-2d-scene/SKILL.md',
        mcpTools: [
          'component.types',
          'runtime.input',
          'runtime.read_state',
          'asset.generate',
          'asset.recommend',
          'asset.regenerate',
          'build.windows',
        ],
      },
      package: {
        outputDirectory: build.outputDirectory,
        assets: build.reachability.assets,
        player: playerReport,
      },
      result: 'passed',
    },
    null,
    2,
  ),
);
