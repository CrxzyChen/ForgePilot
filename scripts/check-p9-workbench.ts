import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectManager } from '../studio/project/project-manager.ts';
import { ProjectError } from '../studio/project/project-types.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-kernel-p9-'));
const projectParent = join(temporary, 'projects');
const storage = join(temporary, 'studio-data');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');

type LegacySnapshot = {
  tileMap?: {
    layers: Array<{ tiles: Array<{ x: number; y: number; tileId: string }> }>;
  };
  worlds: Array<{
    entities: Array<{
      id: string;
      components: Array<Record<string, unknown>>;
    }>;
  }>;
};

function legacySnapshot(value: unknown): LegacySnapshot {
  return value as LegacySnapshot;
}

try {
  mkdirSync(projectParent, { recursive: true });
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: storage,
    engineVersion: '0.1.1',
  });
  const project = manager.createProject({
    parentDirectory: projectParent,
    name: 'P9 Workbench Gate',
  });
  let registry = new StudioCommandRegistry({
    projectRoot: project.root,
    kernelCliPath,
  });
  const initial = registry.snapshot();
  assert(initial.files.some((file) => file.path === initial.entryScene));
  assert.equal(legacySnapshot(initial).tileMap?.layers[0]?.tiles.length, 0);
  assert.equal(
    legacySnapshot(initial).worlds[0]?.entities[0]?.id,
    'p9-workbench-gate:player',
  );
  assert(initial.commands.includes('scene.entity.set_transform'));

  registry.execute('scene.entity.set_transform', {
    entityId: 'p9-workbench-gate:player',
    x: 4,
    y: 7,
  });
  assert.deepEqual(
    legacySnapshot(registry.snapshot()).worlds[0]?.entities[0]?.components[0]
      ?.position,
    { x: 4, y: 7 },
  );
  registry.execute('history.undo');
  assert.deepEqual(
    legacySnapshot(registry.snapshot()).worlds[0]?.entities[0]?.components[0]
      ?.position,
    { x: 2, y: 9 },
  );
  registry.execute('history.redo');

  registry.execute('input.define_action', {
    id: 'secondary-action',
    bindings: ['KeyE'],
  });
  registry.execute('scene.tile.paint', {
    x: 3,
    y: 5,
    tileId: 'terrain:brick',
  });
  assert.deepEqual(
    legacySnapshot(registry.snapshot()).tileMap?.layers[0]?.tiles[0],
    {
      x: 3,
      y: 5,
      tileId: 'terrain:brick',
    },
  );
  registry.execute('collision.define_rule', {
    a: 'player',
    b: 'projectile',
    response: 'event',
  });
  registry.execute('project.file.create', {
    path: 'prefabs/player-tank.json',
    content: '{"kind":"prefab","id":"p9-workbench-gate:player-tank"}\n',
  });
  registry.execute('project.file.duplicate', {
    from: 'prefabs/player-tank.json',
    to: 'prefabs/player-tank-copy.json',
  });
  registry.execute('project.file.rename', {
    from: 'prefabs/player-tank-copy.json',
    to: 'prefabs/player-tank-variant.json',
  });
  registry.execute('project.file.create', {
    path: 'tests/collision.test.json',
    content:
      '{"schemaVersion":"1.0.0","name":"collision smoke","expect":{"outcome":"valid"}}\n',
  });
  registry.execute('project.file.trash', {
    path: 'tests/collision.test.json',
  });
  assert(!existsSync(join(project.root, 'tests', 'collision.test.json')));
  registry.execute('history.undo');
  assert(existsSync(join(project.root, 'tests', 'collision.test.json')));

  const text = registry.readText('docs/IDE_GAP_LEDGER.md');
  registry.execute('project.file.write', {
    path: text.path,
    content: `${text.source}\nP9 workbench gate: closed.\n`,
    baseHash: text.hash,
  });
  assert.throws(
    () =>
      registry.execute('project.file.write', {
        path: text.path,
        content: text.source,
        baseHash: text.hash,
      }),
    (error: unknown) =>
      error instanceof ProjectError && error.code === 'WORKSPACE_BASE_CHANGED',
  );

  const sourceAsset = join(temporary, 'player.svg');
  writeFileSync(
    sourceAsset,
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#5eead4"/></svg>\n',
  );
  const imported = registry.importAsset(sourceAsset);
  assert.equal(imported.snapshot.assets.length, 1);
  const importedPath = imported.snapshot.assets[0]?.path;
  assert.equal(typeof importedPath, 'string');
  const preview = registry.readAssetPreview(importedPath as string);
  assert(preview.dataUrl.startsWith('data:image/svg+xml;base64,'));
  registry.execute('history.undo');
  assert.equal(registry.snapshot().assets.length, 0);
  registry.execute('history.redo');
  assert.equal(registry.snapshot().assets.length, 1);

  const runtime = registry.execute('runtime.start', { seed: 12345 });
  assert.equal((runtime.data as { ok?: boolean }).ok, true);
  assert.equal(
    (
      runtime.data as {
        result?: { snapshot?: { stateHash?: string } };
      }
    ).result?.snapshot?.stateHash?.length,
    64,
  );
  assert.equal(runtime.snapshot.runtime.seed, 12345);
  assert((runtime.snapshot.runtime.durationMs ?? 0) > 0);
  assert.equal(
    (registry.execute('test.run').data as { ok?: boolean }).ok,
    true,
  );
  assert(
    (
      registry.execute('audit.list').data as {
        events: unknown[];
      }
    ).events.length > 0,
  );
  registry.execute('runtime.stop');
  const step = registry.execute('runtime.step_tick');
  assert.equal(step.snapshot.runtime.status, 'paused');
  assert.equal(step.snapshot.runtime.tick, 2);
  assert.equal(
    registry.execute('runtime.pause').snapshot.runtime.status,
    'paused',
  );

  registry.execute('project.file.create', {
    path: 'scripts/recovery.txt',
    content: 'before\n',
  });
  writeFileSync(join(project.root, 'scripts', 'recovery.txt'), 'after\n');
  writeFileSync(
    join(
      project.root,
      '.aigame',
      'local',
      'pending-workspace-transaction.json',
    ),
    `${JSON.stringify({
      schemaVersion: '1.0.0',
      phase: 'prepared',
      entry: {
        id: 'p9-crash-fixture',
        label: 'crash fixture',
        createdAt: new Date().toISOString(),
        before: [{ path: 'scripts/recovery.txt', content: 'before\n' }],
        after: [{ path: 'scripts/recovery.txt', content: 'after\n' }],
      },
    })}\n`,
  );
  registry = new StudioCommandRegistry({
    projectRoot: project.root,
    kernelCliPath,
  });
  assert.equal(
    readFileSync(join(project.root, 'scripts', 'recovery.txt'), 'utf8'),
    'before\n',
  );
  assert(registry.snapshot().history.canUndo);

  manager.closeProject();
  const reopened = manager.openProject(project.root);
  assert.equal(reopened.manifest.id, project.manifest.id);
  const reopenedRegistry = new StudioCommandRegistry({
    projectRoot: reopened.root,
    kernelCliPath,
  });
  assert.deepEqual(
    legacySnapshot(reopenedRegistry.snapshot()).worlds[0]?.entities[0]
      ?.components[0]?.position,
    { x: 4, y: 7 },
  );
  manager.closeProject();

  console.log(
    '[P9 workbench] files, semantic inspector edit, text save, input, trash, undo/redo, replay, crash recovery, and reopen passed',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
