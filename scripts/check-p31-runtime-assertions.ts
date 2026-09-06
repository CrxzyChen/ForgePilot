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

import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import type { ProjectRuntimeResult } from '../studio/runtime/project-script-runtime.ts';

const repository = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p31-assertions-'));
const projectRoot = join(temporary, 'project');
try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (path) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        path.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  const registry = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
    scriptHostPath: join(
      repository,
      'target',
      'debug',
      'project-script-host.exe',
    ),
  });
  function run(assertions?: unknown[]) {
    writeFileSync(
      join(projectRoot, 'tests', 'assertions.test.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        kind: 'runtime-scenario',
        ...(assertions === undefined ? {} : { assertions }),
      }),
    );
    return registry.execute('test.run', {
      test: 'tests/assertions.test.json',
      ticks: 3,
    });
  }
  assert.throws(
    () => run(['P pauses the game']),
    /TEST_ASSERTION_INVALID|可执行/u,
    'Prose must never pass as an executable assertion',
  );
  const target = {
    objectId: 'tank:game',
    componentId: 'tank:game/state',
    field: 'phase',
  };
  // Discover the exact semantic component ID from the real fixture, not an ECS handle.
  const smoke = run();
  const initial = smoke.data as ProjectRuntimeResult;
  const component = initial.scene.objects
    .find((object) => object.id === target.objectId)
    ?.components.find((candidate) => candidate.type === 'tank:game-state');
  assert(component);
  target.componentId = component.id;
  const assertion = {
    id: 'assertion:menu',
    tick: 0,
    target,
    operator: 'equals',
    expected: 'menu',
  };
  const passed = run([assertion]);
  assert.equal((passed.data as ProjectRuntimeResult).status, 'completed');
  const failed = run([{ ...assertion, expected: 'won' }]);
  assert.equal((failed.data as ProjectRuntimeResult).status, 'failed');
  assert(
    (failed.data as ProjectRuntimeResult).diagnostics.some(
      (item) => item.code === 'TEST_ASSERTION_FAILED',
    ),
  );
  assert.equal(
    (run([{ ...assertion, tick: 999 }]).data as ProjectRuntimeResult).status,
    'failed',
  );
  assert.equal(
    (
      run([
        {
          ...assertion,
          target: { ...target, componentId: 'missing:component' },
          operator: 'notEquals',
        },
      ]).data as ProjectRuntimeResult
    ).status,
    'failed',
    'Missing target must not pass notEquals',
  );
  assert.equal(
    (
      run([{ ...assertion, tick: 2, compareTick: 0, expected: undefined }])
        .data as ProjectRuntimeResult
    ).status,
    'completed',
  );
  assert.throws(
    () => run([{ ...assertion, target: { ...target, field: '__proto__.x' } }]),
    /可执行/u,
  );
  assert.throws(
    () => run([{ ...assertion, target: { ...target, field: 'objects.0' } }]),
    /可执行/u,
  );
  assert.throws(() => run([assertion, assertion]), /可执行/u);
  assert.match(
    smoke.message,
    /冒烟/u,
    'No-assertion replay must be labeled smoke-only',
  );
  writeFileSync(
    join(projectRoot, 'scenes', 'test-entry.game.json'),
    readFileSync(join(projectRoot, 'scenes', 'main.game.json')),
  );
  writeFileSync(
    join(projectRoot, 'replays', 'assertion-entry.json'),
    JSON.stringify({
      scene: 'scenes/test-entry.game.json',
      ticks: 1,
      seed: 42,
    }),
  );
  writeFileSync(
    join(projectRoot, 'tests', 'assertion-entry.test.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      kind: 'runtime-scenario',
      replay: 'replays/assertion-entry.json',
      assertions: [assertion],
    }),
  );
  const replayScene = registry.execute('test.run', {
    test: 'tests/assertion-entry.test.json',
  }).data as ProjectRuntimeResult;
  assert.equal(
    replayScene.activeScene,
    'scenes/test-entry.game.json',
    'Do not silently run the entry menu instead of the test replay scene',
  );
  writeFileSync(
    join(projectRoot, 'tests', 'inline.test.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      kind: 'runtime-scenario',
      ticks: 4,
      seed: 902,
      scene: 'scenes/test-entry.game.json',
      assertions: [{ ...assertion, tick: 3 }],
    }),
  );
  const inline = registry.execute('test.run', {
    test: 'tests/inline.test.json',
  }).data as ProjectRuntimeResult;
  assert.equal(inline.seed, 902);
  assert.equal(inline.snapshots.length, 4);
  assert.equal(inline.activeScene, 'scenes/test-entry.game.json');
  console.log(
    JSON.stringify(
      {
        gate: 'P31 executable runtime assertions',
        proseRejected: true,
        wrongExpectationFails: true,
        missingTargetFails: true,
        snapshotComparison: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
