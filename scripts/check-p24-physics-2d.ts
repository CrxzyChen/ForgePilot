import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';
import { RuntimeSessionService } from '../studio/runtime/runtime-session-service.ts';
import type { SceneDocument } from '../studio/workspace/scene-authoring-service.ts';

const repository = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p24-physics-'));
const projectRoot = join(temporary, 'pong-2d');
const scenePath = join(projectRoot, 'scenes', 'main.game.json');
const hostPath = join(
  repository,
  'target',
  'debug',
  process.platform === 'win32'
    ? 'project-script-host.exe'
    : 'project-script-host',
);

try {
  cpSync(join(repository, 'examples', 'pong-2d'), projectRoot, {
    recursive: true,
  });
  const scene = JSON.parse(readFileSync(scenePath, 'utf8')) as SceneDocument;
  const field = scene.objects.find((object) => object.id === 'pong:field');
  const ball = scene.objects.find((object) => object.id === 'pong:ball');
  assert(field && ball);
  field.components.push({
    id: 'pong:field/trigger',
    type: 'physics:collider2d',
    enabled: true,
    data: {
      shape: 'box',
      size: { x: 31.2, y: 17.2 },
      offset: { x: 0, y: 0 },
      isTrigger: true,
      layer: 'world',
    },
  });
  ball.components.push({
    id: 'pong:ball/body',
    type: 'physics:rigidbody2d',
    enabled: true,
    data: {
      bodyType: 'dynamic',
      velocity: { x: 0.6, y: 0 },
      gravityScale: 0,
      mass: 1,
      linearDamping: 0,
    },
  });
  writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`, 'utf8');

  const runtime = new ProjectScriptRuntime({
    projectRoot,
    scriptHostPath: hostPath,
  });
  const options = {
    ticks: 3,
    seed: 2402,
    controls: [{ tick: 1, action: 'destroy' as const, objectId: 'pong:ball' }],
    persistTrace: false,
  };
  const continuous = runtime.run(options);
  assert.equal(continuous.status, 'completed');
  assert.equal(continuous.diagnostics.length, 0);

  const pairEvents = continuous.physicsEvents.filter(
    (event) =>
      event.colliderA === 'pong:ball/collider' ||
      event.colliderB === 'pong:ball/collider',
  );
  assert.deepEqual(
    pairEvents.map((event) => [event.phase, event.tick]),
    [
      ['enter', 0],
      ['stay', 1],
      ['exit', 2],
    ],
    'real overlapping colliders must produce deterministic enter/stay/exit',
  );
  for (const event of pairEvents) {
    assert.equal(event.space, '2d');
    assert.equal(event.sensor, true);
    assert(event.objectA.includes(':') && event.objectB.includes(':'));
    assert(event.colliderA.includes('/') && event.colliderB.includes('/'));
    assert.equal(event.normal.length, 2);
    assert(event.contacts.length > 0);
    assert(Number.isFinite(event.contacts[0]?.[0]));
    assert(Number.isSafeInteger(event.tick));
  }
  assert.deepEqual(
    continuous.timeline
      .filter(
        (entry) =>
          entry.kind === 'physics:event' &&
          (entry.colliderA === 'pong:ball/collider' ||
            entry.colliderB === 'pong:ball/collider'),
      )
      .map((entry) => entry.phase),
    ['enter', 'stay', 'exit'],
  );

  const session = new RuntimeSessionService(runtime);
  session.start({ ...options, ticks: 1 });
  session.pause();
  const second = session.step();
  const third = session.step();
  assert.equal(second.physicsEvents.at(-1)?.phase, 'stay');
  assert.equal(third.physicsEvents.at(-1)?.phase, 'exit');
  assert.equal(third.stateHash, continuous.stateHash);
  assert.deepEqual(third.physicsContacts, continuous.physicsContacts);
  assert.equal(
    third.scene.objects.some((object) => object.id === 'pong:ball'),
    false,
  );

  const hostSource = readFileSync(
    join(repository, 'crates', 'script-host', 'src', 'lib.rs'),
    'utf8',
  );
  assert(!hostSource.includes('request.collisions || []'));
  assert(hostSource.includes('function physicsStep()'));

  console.log(
    JSON.stringify(
      {
        gate: 'P24 deterministic Collider2D/RigidBody2D adapter',
        phases: pairEvents.map((event) => ({
          phase: event.phase,
          tick: event.tick,
          objectA: event.objectA,
          colliderA: event.colliderA,
          objectB: event.objectB,
          colliderB: event.colliderB,
          sensor: event.sensor,
          normal: event.normal,
          contacts: event.contacts,
        })),
        segmentedStateHash: third.stateHash,
        continuousStateHash: continuous.stateHash,
        syntheticCollisionInput: false,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
