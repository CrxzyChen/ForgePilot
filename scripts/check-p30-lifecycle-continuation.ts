import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';
import { RuntimeSessionService } from '../studio/runtime/runtime-session-service.ts';

const repository = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-lifecycle-'));
try {
  const projectRoot = join(temporary, 'pong');
  cpSync(join(repository, 'examples/pong-2d'), projectRoot, {
    recursive: true,
    filter: (path) =>
      !['.aigame', '.git', 'out', 'dist'].includes(
        path.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  const manifestPath = join(projectRoot, 'scripts/runtime.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.modules.push({
    id: 'probe:module',
    kind: 'system',
    source: 'scripts/systems/lifecycle.ts',
  });
  manifest.systems.push({
    id: 'probe:system',
    module: 'probe:module',
    export: 'probe',
    phase: 'engine:presentation',
    order: 100,
    query: [],
  });
  writeFileSync(manifestPath, JSON.stringify(manifest));
  writeFileSync(
    join(projectRoot, 'scripts/systems/lifecycle.ts'),
    `export const probe = {
    onFixedUpdate(context) {
      const target = context.query(['core:transform2d'])[0];
      context.setVisible(target, context.tick % 2 === 0);
    }
  };`,
  );
  const runtime = new ProjectScriptRuntime({
    projectRoot,
    scriptHostPath: join(
      repository,
      'target/debug',
      process.platform === 'win32'
        ? 'project-script-host.exe'
        : 'project-script-host',
    ),
  });
  const options = { seed: 20260905, persistTrace: false };
  const continuous = runtime.run({ ...options, ticks: 7 });
  assert.equal(continuous.status, 'completed');
  const session = new RuntimeSessionService(runtime);
  const first = session.start({ ...options, ticks: 1 });
  assert.equal(first.pendingLifecycle.length, 1);
  const snapshots = [...first.snapshots];
  session.pause();
  for (const ticks of [1, 2, 3]) {
    const result = session.advancePaused(ticks);
    assert.equal(result.status, 'completed');
    snapshots.push(...result.snapshots);
  }
  assert.deepEqual(
    snapshots,
    continuous.snapshots,
    'Studio batched snapshots retain next-post-update lifecycle timing',
  );
  assert.equal(session.result?.stateHash, continuous.stateHash);
  assert.deepEqual(
    session.result?.pendingLifecycle,
    continuous.pendingLifecycle,
  );
  const visibility = snapshots.map(
    (snapshot) =>
      snapshot.scene.objects.find(
        (object) =>
          object.id ===
          (first.pendingLifecycle[0]!.payload as { objectId: string }).objectId,
      )!.visible,
  );
  assert.deepEqual(visibility.slice(1), [
    true,
    false,
    true,
    false,
    true,
    false,
  ]);
  session.stop();
  assert.deepEqual(
    session.start({ ...options, ticks: 1 }).scene,
    first.scene,
    'stop/start must not inherit the previous run pending queue',
  );
  assert.deepEqual(
    session.restart(1).scene,
    first.scene,
    'restart also clears pending lifecycle',
  );
  console.log(
    JSON.stringify({
      ok: true,
      kind: 'p30-lifecycle-continuation',
      ticks: 7,
      batchTicks: [1, 1, 2, 3],
      allSnapshotsEqual: true,
      restartClearsQueue: true,
    }),
  );
} finally {
  assert.equal(dirname(temporary), resolve(tmpdir()));
  rmSync(temporary, { recursive: true, force: true });
}
