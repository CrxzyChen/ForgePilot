import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectManager } from '../studio/project/project-manager.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import type { SceneDocument } from '../studio/workspace/scene-authoring-service.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p17-'));
const projects = join(temporary, 'projects');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');

try {
  mkdirSync(projects, { recursive: true });
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: join(temporary, 'studio-data'),
    engineVersion: '0.2.0-alpha.1',
  });
  const project = manager.createProject({
    parentDirectory: projects,
    directoryName: 'authoring-gate',
    name: 'P17 Authoring Gate',
    preset: 'empty-2d',
    initializeGit: false,
  });
  const registry = new StudioCommandRegistry({
    projectRoot: project.root,
    kernelCliPath,
  });
  const entry = project.manifest.entry.scene;

  const initial = registry.execute('scene.inspect', { path: entry })
    .data as SceneDocument;
  assert.equal(initial.space, '2d');
  assert.deepEqual(initial.objects, []);
  assert(
    registry
      .snapshot()
      .scenes?.some((scene) => scene.path === entry && scene.startup),
  );
  assert(registry.execute('component.types').data instanceof Array);
  const componentTypes = registry.execute('component.types').data as Array<{
    type: string;
  }>;
  assert(componentTypes.some((item) => item.type === 'core:transform2d'));
  assert(!componentTypes.some((item) => item.type === 'core:transform3d'));
  const projectComponents = registry.readText('capabilities/components.json');
  registry.execute('project.file.write', {
    path: 'capabilities/components.json',
    baseHash: projectComponents.hash,
    content: `${JSON.stringify(
      {
        schemaVersion: '2.0.0-alpha.1',
        components: [
          {
            type: 'p17:health',
            label: 'Health',
            inspectorEditor: 'p17:compact-stats',
            fields: [
              { name: 'maximum', type: 'number', default: 100 },
              { name: 'current', type: 'number', default: 100 },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  });
  assert(
    (registry.execute('component.types').data as Array<{ type: string }>).some(
      (item) => item.type === 'p17:health',
    ),
  );
  assert.equal(
    (
      registry.execute('component.types').data as Array<{
        type: string;
        inspectorEditor?: string;
      }>
    ).find((item) => item.type === 'p17:health')?.inspectorEditor,
    'p17:compact-stats',
  );

  registry.execute('scene.create', {
    path: 'scenes/chapters/second.scene.json',
    name: 'Second',
    space: '2d',
  });
  registry.execute('scene.set_startup', {
    scene: 'scenes/chapters/second.scene.json',
  });
  assert.equal(
    registry.snapshot().entryScene,
    'scenes/chapters/second.scene.json',
  );
  assert.equal(
    JSON.parse(
      readFileSync(join(project.root, 'settings', 'project.json'), 'utf8'),
    ).startupScene,
    'scenes/chapters/second.scene.json',
  );
  for (const name of ['windows.development.json', 'windows.release.json']) {
    assert.equal(
      JSON.parse(readFileSync(join(project.root, 'build', name), 'utf8')).entry,
      'scenes/chapters/second.scene.json',
    );
  }
  assert.throws(
    () =>
      registry.execute('scene.trash', {
        scene: 'scenes/chapters/second.scene.json',
      }),
    /启动 Scene/u,
  );
  registry.execute('scene.set_startup', { scene: entry });
  registry.execute('scene.rename', {
    scene: 'scenes/chapters/second.scene.json',
    name: 'Second Renamed',
  });
  registry.execute('scene.duplicate', {
    scene: 'scenes/chapters/second.scene.json',
    path: 'scenes/second-copy.scene.json',
    name: 'Second Copy',
  });
  registry.execute('scene.trash', {
    scene: 'scenes/chapters/second.scene.json',
  });
  assert(
    !registry
      .snapshot()
      .scenes?.some(
        (scene) => scene.path === 'scenes/chapters/second.scene.json',
      ),
  );
  registry.execute('history.undo');
  assert(
    registry
      .snapshot()
      .scenes?.some(
        (scene) => scene.path === 'scenes/chapters/second.scene.json',
      ),
  );
  registry.execute('history.redo');

  const root = registry.execute('scene.object.create', {
    scene: entry,
    name: 'Root',
  }).data as { id: string };
  const child = registry.execute('scene.object.create', {
    scene: entry,
    name: 'Child',
    parentId: root.id,
  }).data as { id: string };
  const sibling = registry.execute('scene.object.create', {
    scene: entry,
    name: 'Sibling',
  }).data as { id: string };
  assert.match(root.id, /^p17-authoring-gate:object\//u);
  assert.throws(
    () =>
      registry.execute('scene.object.set_parent', {
        scene: entry,
        objectId: root.id,
        parentId: child.id,
      }),
    /循环/u,
  );
  registry.execute('scene.object.set_visibility', {
    scene: entry,
    objectId: child.id,
    visible: false,
  });
  registry.execute('scene.object.set_lock', {
    scene: entry,
    objectId: child.id,
    locked: true,
  });
  registry.execute('scene.object.reorder', {
    scene: entry,
    objectId: sibling.id,
    order: 0,
  });
  registry.execute('scene.object.duplicate', {
    scene: entry,
    objectId: root.id,
  });

  registry.execute('scene.component.add', {
    scene: entry,
    objectId: root.id,
    type: 'render:shape2d',
    data: { color: '#ff0066' },
  });
  registry.execute('scene.component.add', {
    scene: entry,
    objectId: root.id,
    type: 'p17:health',
    data: { current: 75 },
  });
  let scene = registry.execute('scene.inspect', { path: entry })
    .data as SceneDocument;
  const shape = scene.objects
    .find((item) => item.id === root.id)
    ?.components.find((item) => item.type === 'render:shape2d');
  assert(shape);
  registry.execute('scene.component.update', {
    scene: entry,
    objectId: root.id,
    componentId: shape.id,
    data: { size: { x: 3, y: 2 } },
  });
  assert.throws(
    () =>
      registry.execute('scene.component.update', {
        scene: entry,
        objectId: root.id,
        componentId: shape.id,
        data: { imaginary: true },
      }),
    /没有字段/u,
  );
  registry.execute('scene.component.add', {
    scene: entry,
    objectId: root.id,
    type: 'core:metadata',
    data: { tags: 'assets/imported/gate.png' },
  });

  registry.execute('prefab.create', {
    scene: entry,
    objectId: root.id,
    objectIds: [root.id],
    name: 'Root Prefab',
    path: 'prefabs/root.prefab.json',
  });
  const instantiated = registry.execute('prefab.instantiate', {
    scene: entry,
    path: 'prefabs/root.prefab.json',
  }).data as { objectIds: string[] };
  const instanceRoot = instantiated.objectIds[0]!;
  const prefabBeforeApply = JSON.parse(
    registry.readText('prefabs/root.prefab.json').source,
  ) as { objects: SceneDocument['objects'] };
  const sourceIdsBeforeApply = prefabBeforeApply.objects[0]!.components.map(
    (component) => component.id,
  );
  const instanceIdsBeforeRevert = (
    registry.execute('scene.inspect', { path: entry }).data as SceneDocument
  ).objects
    .find((item) => item.id === instanceRoot)!
    .components.map((component) => component.id);
  registry.execute('scene.object.update', {
    scene: entry,
    objectId: instanceRoot,
    name: 'Applied Instance',
  });
  registry.execute('prefab.apply', { scene: entry, objectId: instanceRoot });
  assert.deepEqual(
    (
      JSON.parse(registry.readText('prefabs/root.prefab.json').source) as {
        objects: SceneDocument['objects'];
      }
    ).objects[0]!.components.map((component) => component.id),
    sourceIdsBeforeApply,
    'prefab apply preserves source component identity',
  );
  registry.execute('scene.object.update', {
    scene: entry,
    objectId: instanceRoot,
    name: 'Temporary Override',
  });
  registry.execute('prefab.revert', { scene: entry, objectId: instanceRoot });
  scene = registry.execute('scene.inspect', { path: entry })
    .data as SceneDocument;
  assert.equal(
    scene.objects.find((item) => item.id === instanceRoot)?.name,
    'Applied Instance',
  );
  assert.deepEqual(
    scene.objects
      .find((item) => item.id === instanceRoot)!
      .components.map((component) => component.id),
    instanceIdsBeforeRevert,
    'prefab revert preserves instance component identity',
  );

  // Legacy instances used arbitrary IDs. Unique types can be matched safely;
  // repeated types must use stable identity or an explicit semantic map.
  const editFixture = (path: string, value: unknown): void => {
    const file = registry.readText(path);
    registry.execute('project.file.write', {
      path,
      baseHash: file.hash,
      content: `${JSON.stringify(value, null, 2)}\n`,
    });
  };
  const legacyInstance = scene.objects.find(
    (item) => item.id === instanceRoot,
  )!;
  for (const component of legacyInstance.components) {
    if (component.type !== 'core:prefab-instance') component.id += '-legacy';
  }
  const legacyIds = legacyInstance.components.map((component) => component.id);
  editFixture(entry, scene);
  registry.execute('prefab.revert', { scene: entry, objectId: instanceRoot });
  scene = registry.execute('scene.inspect', { path: entry })
    .data as SceneDocument;
  assert.deepEqual(
    scene.objects
      .find((item) => item.id === instanceRoot)!
      .components.map((component) => component.id),
    legacyIds,
  );

  const duplicatePrefab = JSON.parse(
    registry.readText('prefabs/root.prefab.json').source,
  ) as { objects: SceneDocument['objects'] };
  const prefabRoot = duplicatePrefab.objects[0]!;
  const metadataSource = prefabRoot.components.find(
    (component) => component.type === 'core:metadata',
  )!;
  prefabRoot.components.push({
    ...structuredClone(metadataSource),
    id: `${metadataSource.id}-second`,
    data: { tags: 'second' },
  });
  editFixture('prefabs/root.prefab.json', duplicatePrefab);
  const repeatedRoot = (
    registry.execute('prefab.instantiate', {
      scene: entry,
      path: 'prefabs/root.prefab.json',
    }).data as { objectIds: string[] }
  ).objectIds[0]!;
  scene = registry.execute('scene.inspect', { path: entry })
    .data as SceneDocument;
  const repeated = scene.objects.find((item) => item.id === repeatedRoot)!;
  const idsByTags = Object.fromEntries(
    repeated.components
      .filter((component) => component.type === 'core:metadata')
      .map((component) => [String(component.data.tags), component.id]),
  );
  repeated.components.reverse();
  editFixture(entry, scene);
  registry.execute('prefab.revert', { scene: entry, objectId: repeatedRoot });
  scene = registry.execute('scene.inspect', { path: entry })
    .data as SceneDocument;
  const restored = scene.objects.find((item) => item.id === repeatedRoot)!;
  assert.deepEqual(
    Object.fromEntries(
      restored.components
        .filter((component) => component.type === 'core:metadata')
        .map((component) => [String(component.data.tags), component.id]),
    ),
    idsByTags,
    'same-type components do not swap identity after reordering',
  );

  const explicitMap: Record<string, string> = {};
  for (const component of restored.components.filter(
    (component) => component.type === 'core:metadata',
  )) {
    component.id += '-legacy';
    const source = prefabRoot.components.find(
      (candidate) =>
        candidate.type === component.type &&
        candidate.data.tags === component.data.tags,
    )!;
    explicitMap[source.id] = component.id;
  }
  editFixture(entry, scene);
  const ambiguousBefore = registry.readText(entry).hash;
  assert.throws(
    () =>
      registry.execute('prefab.revert', {
        scene: entry,
        objectId: repeatedRoot,
      }),
    /无法唯一匹配/u,
  );
  assert.equal(
    registry.readText(entry).hash,
    ambiguousBefore,
    'ambiguous revert performs no write',
  );
  assert.throws(
    () =>
      registry.execute('prefab.revert', {
        scene: entry,
        objectId: repeatedRoot,
        componentIds: { [metadataSource.id]: 'missing:component' },
      }),
    /映射目标不存在/u,
  );
  assert.equal(registry.readText(entry).hash, ambiguousBefore);
  registry.execute('prefab.revert', {
    scene: entry,
    objectId: repeatedRoot,
    componentIds: explicitMap,
  });
  scene = registry.execute('scene.inspect', { path: entry })
    .data as SceneDocument;
  for (const instanceId of Object.values(explicitMap))
    assert(
      scene.objects
        .find((item) => item.id === repeatedRoot)!
        .components.some((component) => component.id === instanceId),
    );

  const secondInstance = scene.objects.find(
    (item) => item.id === repeatedRoot,
  )!;
  const secondShape = secondInstance.components.find(
    (component) => component.type === 'render:shape2d',
  )!;
  registry.execute('scene.component.update', {
    scene: entry,
    objectId: repeatedRoot,
    componentId: secondShape.id,
    data: { color: '#aabbcc' },
  });
  const sourceIds = prefabRoot.components.map((component) => component.id);
  registry.execute('prefab.apply', {
    scene: entry,
    objectId: repeatedRoot,
    componentIds: explicitMap,
  });
  const appliedSource = JSON.parse(
    registry.readText('prefabs/root.prefab.json').source,
  ) as { objects: SceneDocument['objects'] };
  assert.deepEqual(
    appliedSource.objects[0]!.components.map((component) => component.id),
    sourceIds,
  );
  registry.execute('prefab.revert', {
    scene: entry,
    objectId: instanceRoot,
    componentIds: {
      [metadataSource.id]: legacyInstance.components.find(
        (component) => component.type === 'core:metadata',
      )!.id,
    },
  });
  scene = registry.execute('scene.inspect', { path: entry })
    .data as SceneDocument;
  assert.equal(
    scene.objects
      .find((item) => item.id === instanceRoot)!
      .components.find((component) => component.type === 'render:shape2d')!.data
      .color,
    '#aabbcc',
    'source changes reach another instance through explicit revert',
  );

  const resourcePath = join(project.root, 'assets', 'imported', 'gate.png');
  writeFileSync(resourcePath, Buffer.from('89504e470d0a1a0a', 'hex'));
  writeFileSync(
    join(project.root, 'assets', 'asset-manifest.json'),
    `${JSON.stringify({ schemaVersion: '1.0.0', assets: [{ id: 'asset:gate', path: 'assets/imported/gate.png', status: 'source-changed' }] }, null, 2)}\n`,
  );
  const importSettings = registry.execute('resource.set_import_settings', {
    path: 'assets/imported/gate.png',
    settings: { colorSpace: 'srgb', filtering: 'nearest' },
  }).data as { importSettings: Record<string, unknown>; status: string };
  assert.equal(importSettings.status, 'source-changed');
  assert.equal(importSettings.importSettings.filtering, 'nearest');
  scene = registry.execute('scene.inspect', { path: entry })
    .data as SceneDocument;
  const metadata = scene.objects
    .find((item) => item.id === root.id)
    ?.components.find((item) => item.type === 'core:metadata');
  assert(metadata);
  registry.execute('scene.component.update', {
    scene: entry,
    objectId: root.id,
    componentId: metadata.id,
    data: { tags: 'assets/imported/missing.png' },
  });
  const missing = registry.execute('resource.missing').data as Array<{
    path: string;
  }>;
  assert(missing.some((item) => item.path === 'assets/imported/missing.png'));
  registry.execute('resource.repair_reference', {
    missingPath: 'assets/imported/missing.png',
    replacementPath: 'assets/imported/gate.png',
  });
  assert(
    !(
      registry.execute('resource.missing').data as Array<{ path: string }>
    ).some((item) => item.path === 'assets/imported/missing.png'),
  );
  const reimported = registry.execute('resource.reimport', {
    path: 'assets/imported/gate.png',
  }).data as { sha256: string; status: string };
  assert.equal(reimported.status, 'ready');
  assert.equal(reimported.sha256.length, 64);
  const dependencies = registry.execute('resource.dependencies', {
    path: 'assets/imported/gate.png',
  }).data as { referencedBy: string[] };
  assert(dependencies.referencedBy.includes(entry));

  const reopened = new StudioCommandRegistry({
    projectRoot: project.root,
    kernelCliPath,
  });
  assert(
    (
      reopened.execute('scene.inspect', { path: entry }).data as SceneDocument
    ).objects.some((item) => item.id === instanceRoot),
  );
  const audit = reopened.execute('audit.list').data as { events: unknown[] };
  assert(audit.events.length >= 15);

  const changeSets = new StudioChangeSetService({
    projectRoot: project.root,
    kernelCliPath,
    registry: reopened,
  });
  const proposal = changeSets.propose({
    summary: 'AI adds review object',
    operations: [
      {
        command: 'scene.object.create',
        input: { scene: entry, name: 'AI Review Object' },
      },
    ],
  });
  assert.equal(proposal.status, 'awaitingApproval');
  assert(proposal.files.some((file) => file.path === entry));
  assert(
    !(
      reopened.execute('scene.inspect', { path: entry }).data as SceneDocument
    ).objects.some((item) => item.name === 'AI Review Object'),
  );

  const mcpInput =
    [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'component.types', arguments: {} },
      },
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'scene.object.create',
          arguments: { scene: entry, name: 'MCP Review Object' },
        },
      },
    ]
      .map((value) => JSON.stringify(value))
      .join('\n') + '\n';
  const mcp = spawnSync(
    process.execPath,
    [
      join(repository, 'studio', 'server', 'engine-mcp-server.ts'),
      '--project',
      project.root,
    ],
    {
      cwd: repository,
      encoding: 'utf8',
      input: mcpInput,
      timeout: 30_000,
      env: {
        ...process.env,
        AIGAME_STUDIO_KERNEL_CLI: kernelCliPath,
        AIGAME_STUDIO_ENGINE_VERSION: '0.2.0-alpha.1',
      },
    },
  );
  assert.equal(mcp.status, 0, mcp.stderr || mcp.error?.message);
  const messages = mcp.stdout
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const listMessage = messages.find((message) => message.id === 2);
  assert(listMessage);
  const listed = (
    listMessage.result as { tools: Array<{ name: string }> }
  ).tools.map((tool) => tool.name);
  for (const name of [
    'scene.create',
    'scene.object.create',
    'scene.component.update',
    'prefab.instantiate',
    'resource.reimport',
    'resource.dependencies',
    'resource.missing',
    'resource.set_import_settings',
    'resource.repair_reference',
  ])
    assert(listed.includes(name), name);
  assert.match(
    JSON.stringify(messages.find((message) => message.id === 4)),
    /awaitingApproval/u,
  );

  const workbench = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'Workbench.tsx'),
    'utf8',
  );
  for (const marker of [
    'Scene 与对象',
    'renderObjectOutline',
    'componentTypes',
    '创建 Prefab',
    '重新导入',
  ])
    assert.match(workbench, new RegExp(marker, 'u'));
  const engineViewport = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'EngineViewport.tsx'),
    'utf8',
  );
  const webGl3dRenderer = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'webgl3d-renderer.ts'),
    'utf8',
  );
  assert.match(engineViewport, /drawWebGl3D/u);
  assert.match(engineViewport, /webgl2-depth/u);
  assert.doesNotMatch(workbench, /window\.prompt/u);
  assert.match(workbench, /studio-text-dialog/u);
  assert.match(workbench, /requestText\('添加对象'/u);
  assert.match(webGl3dRenderer, /function perspective/u);
  assert.match(webGl3dRenderer, /gl\.enable\(gl\.DEPTH_TEST\)/u);
  const production = [
    join(repository, 'studio'),
    join(repository, 'templates', 'base'),
    join(repository, 'templates', 'empty'),
    join(repository, 'templates', '2d'),
    join(repository, 'templates', '3d'),
    join(repository, 'templates', 'windows'),
  ]
    .flatMap((rootPath) => {
      const walk = (path: string): string[] =>
        readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? walk(join(path, entry.name))
            : [join(path, entry.name)],
        );
      return walk(rootPath);
    })
    .filter(
      (path) =>
        /\.(?:ts|tsx|json|md)$/u.test(path) &&
        !path.endsWith(join('electron', 'renderer', 'App.tsx')),
    );
  const contamination = production.flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return /\b(?:tank|bullet|brick|pong|collectible)\b/iu.test(source)
      ? [path]
      : [];
  });
  assert.deepEqual(contamination, []);

  console.log(
    JSON.stringify(
      {
        gate: 'P17 general authoring',
        scenes: registry.snapshot().scenes?.length,
        stableHierarchy: true,
        schemaDrivenComponents: true,
        prefabRoundTrip: true,
        resourceReimportAndDependencies: true,
        undoRedoAndPersistence: true,
        aiChangeSetBoundary: proposal.status,
        mcpParity: true,
        productionExampleContamination: contamination.length,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
