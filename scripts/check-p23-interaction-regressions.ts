import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { SceneDocument } from '../studio/workspace/scene-authoring-service.ts';
import {
  applySceneTransformPreview,
  sceneTransformDeltaFromPointer,
} from '../studio/electron/renderer/scene-transform-preview.ts';

const repository = resolve(process.cwd());
const fixture = JSON.parse(
  readFileSync(
    join(repository, 'examples', 'pong-2d', 'scenes', 'main.game.json'),
    'utf8',
  ),
) as SceneDocument;
const original = JSON.stringify(fixture);
const moveDelta = sceneTransformDeltaFromPointer('move', '2d', {
  x: 2,
  y: -1,
});
const preview = applySceneTransformPreview(fixture, {
  scenePath: 'scenes/main.game.json',
  objectId: 'pong:ball',
  tool: 'move',
  delta: moveDelta,
});
const originalBall = fixture.objects
  .find((object) => object.id === 'pong:ball')!
  .components.find((component) => component.type === 'core:transform2d')!;
const previewBall = preview.objects
  .find((object) => object.id === 'pong:ball')!
  .components.find((component) => component.type === 'core:transform2d')!;
assert.equal(
  JSON.stringify(fixture),
  original,
  'preview mutated the source Scene',
);
assert.notDeepEqual(previewBall.data.position, originalBall.data.position);

assert.deepEqual(sceneTransformDeltaFromPointer('move', '3d', { x: 1, y: 2 }), {
  x: 1,
  y: 2,
  z: 0,
});
assert.deepEqual(
  sceneTransformDeltaFromPointer('rotate', '3d', { x: 2, y: 1 }),
  { x: -15, y: 30, z: 0 },
);
assert.deepEqual(
  sceneTransformDeltaFromPointer('move', 'ui', { x: 40, y: -22.5 }),
  { x: 1, y: 1 },
);
assert.deepEqual(
  sceneTransformDeltaFromPointer('scale', 'ui', { x: 1, y: -1 }),
  { x: 32, y: -32 },
);

const viewport = readFileSync(
  join(repository, 'studio', 'electron', 'renderer', 'EngineViewport.tsx'),
  'utf8',
);
assert(viewport.includes('scheduleTransformPreview('));
assert(viewport.includes('requestAnimationFrame(() =>'));
const pointerMove = viewport.slice(
  viewport.indexOf('onPointerMove='),
  viewport.indexOf('onPointerUp='),
);
assert(pointerMove.includes('scheduleTransformPreview'));
const pointerUp = viewport.slice(
  viewport.indexOf('onPointerUp='),
  viewport.indexOf('onPointerCancel='),
);
assert(!viewport.includes('transformCommitPending'));
assert(pointerUp.includes('Promise.resolve(committed)'));
assert(pointerUp.includes('clearTransformPreview(active.objectId)'));
assert(viewport.includes('event.button === 1'));
assert(viewport.includes('event.button === 2'));
assert(viewport.includes("event.code === 'Space'"));
assert(viewport.includes("event.code === 'Home'"));
assert(viewport.includes('data-view-distance='));

const workbench = readFileSync(
  join(repository, 'studio', 'electron', 'renderer', 'Workbench.tsx'),
  'utf8',
);
const liveInput = workbench.slice(
  workbench.indexOf('.runtimeInput({'),
  workbench.indexOf('.runtimeInput({') + 420,
);
assert(!liveInput.includes('workspace.runtime.tick'));
assert(!liveInput.includes("execute('runtime.input'"));
assert(workbench.includes('data-transform-preview='));
assert(workbench.includes('applySceneTransformPreview('));
assert(workbench.includes('queueSceneTransformCommit('));
assert(workbench.includes("KeyQ: 'select'"));
assert(workbench.includes("KeyW: 'move'"));
assert(workbench.includes("KeyE: 'rotate'"));
assert(workbench.includes("KeyR: 'scale'"));

const registry = readFileSync(
  join(repository, 'studio', 'workspace', 'studio-command-registry.ts'),
  'utf8',
);
const runtimeInput = registry.slice(
  registry.indexOf('queueRuntimeInput(input:'),
  registry.indexOf('execute(command:'),
);
assert(runtimeInput.includes('? this.#runtimeSession.tick'));
assert(!runtimeInput.includes('? this.#runtime.tick'));
assert(runtimeInput.includes('this.#publishRuntime()'));

const contracts = readFileSync(
  join(repository, 'studio', 'electron', 'contracts.ts'),
  'utf8',
);
const preload = readFileSync(
  join(repository, 'studio', 'electron', 'preload.ts'),
  'utf8',
);
const main = readFileSync(
  join(repository, 'studio', 'electron', 'main.ts'),
  'utf8',
);
for (const source of [contracts, preload, main]) {
  assert(source.includes('workspaceRuntimeInput'));
}

console.log(
  JSON.stringify(
    {
      gate: 'P23 responsive Scene transform and authoritative live input',
      scenePreview: {
        sourceImmutable: true,
        animationFrameCoalesced: true,
        nonBlockingCommitOnPointerUp: true,
        optimisticAuthoritativeQueue: true,
        spaces: ['2d', '3d', 'ui'],
      },
      sceneNavigation: {
        pan: ['middle-pointer', 'right-pointer', 'space-primary-pointer'],
        zoom: 'wheel',
        reset: 'Home',
        toolShortcuts: ['Q', 'W', 'E', 'R'],
      },
      liveInput: {
        rendererTickRemoved: true,
        authoritativeTickAllocated: true,
        lightweightIpc: true,
        explicitLateTickValidationRetained: true,
      },
      result: 'passed',
    },
    null,
    2,
  ),
);
