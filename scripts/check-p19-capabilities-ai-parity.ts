import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { capabilitiesFor } from '../studio/capabilities/capability-registry.ts';
import { ProjectManager } from '../studio/project/project-manager.ts';
import type { SceneDocument } from '../studio/workspace/scene-authoring-service.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p19-'));
const projects = join(temporary, 'projects');
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');

type Operation = {
  command: string;
  input: Record<string, unknown>;
};

function normalize(scene: SceneDocument): unknown {
  return {
    ...scene,
    id: '<scene>',
    objects: scene.objects.map((object) => ({
      ...object,
      components: object.components.map((component) => ({
        ...component,
        id: '<component>',
      })),
    })),
  };
}

function createProject(
  manager: ProjectManager,
  directoryName: string,
  preset: 'empty' | 'empty-2d' | 'empty-3d',
) {
  const project = manager.createProject({
    parentDirectory: projects,
    directoryName,
    name: directoryName,
    preset,
    initializeGit: false,
  });
  const registry = new StudioCommandRegistry({
    projectRoot: project.root,
    kernelCliPath,
  });
  manager.closeProject();
  return { project, registry, scene: project.manifest.entry.scene };
}

function humanAuthor(registry: StudioCommandRegistry, operations: Operation[]) {
  for (const operation of operations)
    registry.execute(operation.command, operation.input);
}

function aiAuthor(
  projectRoot: string,
  registry: StudioCommandRegistry,
  operations: Operation[],
) {
  const service = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry,
  });
  const proposal = service.propose({
    summary: 'P19 semantic authoring parity',
    operations,
  });
  assert.equal(proposal.status, 'awaitingApproval');
  const recoveredService = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry,
  });
  assert.equal(recoveredService.list()[0]?.id, proposal.id);
  recoveredService.approve(proposal.id);
  const applied = recoveredService.apply(proposal.id);
  assert.equal(applied.status, 'applied');
  return { service: recoveredService, changeId: proposal.id };
}

try {
  mkdirSync(projects, { recursive: true });
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: join(temporary, 'studio-data'),
    engineVersion: '0.2.0-alpha.1',
  });

  const capabilities = capabilitiesFor(['2d', '3d', 'ui']);
  for (const capability of capabilities) {
    assert(capability.schemaId);
    assert(capability.editors.length > 0);
    assert(capability.runtimeAdapter);
    assert(capability.rendererAdapter);
    assert(capability.mcpNamespace);
    assert(capability.skill);
    assert(capability.tests.length > 0);
    assert(capability.migrationVersion);
    assert(capability.buildMetadata);
    assert(capability.picking.stableId);
    for (const component of capability.components)
      assert(component.inspectorEditor);
  }
  const twoDimensional = capabilities.find((item) => item.id === '2d')!;
  const threeDimensional = capabilities.find((item) => item.id === '3d')!;
  for (const type of [
    'core:transform2d',
    'render:camera2d',
    'render:shape2d',
    'physics:collider2d',
  ])
    assert(
      twoDimensional.components.some((item) => item.type === type),
      type,
    );
  for (const type of [
    'core:transform3d',
    'render:camera3d',
    'render:mesh3d',
    'render:material',
    'render:directional-light',
    'physics:collider3d',
  ])
    assert(
      threeDimensional.components.some((item) => item.type === type),
      type,
    );
  assert.deepEqual(twoDimensional.gizmos, ['move', 'rotate', 'scale']);
  assert.deepEqual(threeDimensional.gizmos, ['move', 'rotate', 'scale']);

  const human2d = createProject(manager, 'human-2d', 'empty-2d');
  const ai2d = createProject(manager, 'ai-2d', 'empty-2d');
  const object2d = 'parity:object/player-2d';
  const operations2d: Operation[] = [
    {
      command: 'scene.object.create',
      input: { scene: human2d.scene, id: object2d, name: 'Player 2D' },
    },
    {
      command: 'scene.component.add',
      input: {
        scene: human2d.scene,
        objectId: object2d,
        type: 'render:shape2d',
        data: { shape: 'circle', color: '#ff3366' },
      },
    },
    {
      command: 'scene.component.add',
      input: {
        scene: human2d.scene,
        objectId: object2d,
        type: 'render:camera2d',
        data: { zoom: 1.25, primary: true },
      },
    },
    {
      command: 'scene.component.add',
      input: {
        scene: human2d.scene,
        objectId: object2d,
        type: 'physics:collider2d',
      },
    },
    {
      command: 'scene.transform.move',
      input: {
        scene: human2d.scene,
        objectId: object2d,
        delta: { x: 4, y: 2 },
      },
    },
    {
      command: 'scene.transform.rotate',
      input: { scene: human2d.scene, objectId: object2d, delta: 30 },
    },
    {
      command: 'scene.transform.scale',
      input: {
        scene: human2d.scene,
        objectId: object2d,
        delta: { x: 0.5, y: 0.5 },
      },
    },
  ];
  const aiOperations2d = operations2d.map((operation) => ({
    ...operation,
    input: { ...operation.input, scene: ai2d.scene },
  }));
  humanAuthor(human2d.registry, operations2d);
  const ai2dChange = aiAuthor(ai2d.project.root, ai2d.registry, aiOperations2d);
  const human2dScene = human2d.registry.execute('scene.inspect', {
    path: human2d.scene,
  }).data as SceneDocument;
  const ai2dScene = ai2d.registry.execute('scene.inspect', {
    path: ai2d.scene,
  }).data as SceneDocument;
  assert.deepEqual(normalize(ai2dScene), normalize(human2dScene));
  assert.equal(
    (
      ai2d.registry.execute('scene.object.pick', {
        scene: ai2d.scene,
        objectId: object2d,
      }).data as { object: { id: string } }
    ).object.id,
    object2d,
  );

  const human3d = createProject(manager, 'human-3d', 'empty-3d');
  const ai3d = createProject(manager, 'ai-3d', 'empty-3d');
  const object3d = 'parity:object/room-3d';
  const operations3d: Operation[] = [
    {
      command: 'scene.object.create',
      input: { scene: human3d.scene, id: object3d, name: 'Room 3D' },
    },
    ...[
      ['render:mesh3d', { primitive: 'cube' }],
      ['render:material', { color: '#33aaff', roughness: 0.4 }],
      ['render:directional-light', { intensity: 1.5 }],
      ['render:camera3d', { fieldOfView: 70, primary: true }],
      ['physics:collider3d', { shape: 'box' }],
    ].map(([type, data]) => ({
      command: 'scene.component.add',
      input: { scene: human3d.scene, objectId: object3d, type, data },
    })),
    {
      command: 'scene.transform.move',
      input: {
        scene: human3d.scene,
        objectId: object3d,
        delta: { x: 2, y: 1, z: -3 },
      },
    },
    {
      command: 'scene.transform.rotate',
      input: {
        scene: human3d.scene,
        objectId: object3d,
        delta: { x: 0, y: 45, z: 0 },
      },
    },
  ];
  const aiOperations3d = operations3d.map((operation) => ({
    ...operation,
    input: { ...operation.input, scene: ai3d.scene },
  }));
  humanAuthor(human3d.registry, operations3d);
  aiAuthor(ai3d.project.root, ai3d.registry, aiOperations3d);
  assert.deepEqual(
    normalize(
      ai3d.registry.execute('scene.inspect', { path: ai3d.scene })
        .data as SceneDocument,
    ),
    normalize(
      human3d.registry.execute('scene.inspect', { path: human3d.scene })
        .data as SceneDocument,
    ),
  );

  const uiProject = createProject(manager, 'ui-skill-availability', 'empty');
  const uiCapability = capabilities.find((item) => item.id === 'ui')!;
  for (const { registry } of [uiProject, ai2d, ai3d]) {
    const guide = registry.readText(uiCapability.skill);
    assert(guide.source.startsWith('---\n'));
    assert(
      guide.source.length > 100,
      'UI capability must supply a readable Skill',
    );
  }
  const uiManifestBefore = uiProject.registry.readText(
    'project.aigame.json',
  ).source;
  const uiSceneBefore = uiProject.registry.readText(uiProject.scene).source;
  const uiChange = aiAuthor(uiProject.project.root, uiProject.registry, [
    { command: 'capability.set', input: { id: 'ui', enabled: true } },
    {
      command: 'scene.object.create',
      input: {
        scene: uiProject.scene,
        id: 'parity:object/ui-button',
        name: 'Start',
      },
    },
    ...[
      [
        'core:ui-transform',
        { anchor: { x: 0.5, y: 0.5 }, size: { x: 220, y: 60 } },
      ],
      [
        'ui:button',
        { label: 'START', action: 'primary-action', disabled: false },
      ],
    ].map(([type, data]) => ({
      command: 'scene.component.add',
      input: {
        scene: uiProject.scene,
        objectId: 'parity:object/ui-button',
        type,
        data,
      },
    })),
  ]);
  const uiScene = uiProject.registry.execute('scene.inspect', {
    path: uiProject.scene,
  }).data as SceneDocument;
  const button = uiScene.objects.find(
    (item) => item.id === 'parity:object/ui-button',
  )!;
  assert.equal(
    button.components.find((item) => item.type === 'ui:button')?.data.action,
    'primary-action',
  );
  assert.deepEqual(
    button.components.find((item) => item.type === 'core:ui-transform')?.data
      .size,
    { x: 220, y: 60 },
  );
  uiChange.service.rollback(uiChange.changeId);
  assert.equal(
    uiProject.registry.readText('project.aigame.json').source,
    uiManifestBefore,
  );
  assert.equal(
    uiProject.registry.readText(uiProject.scene).source,
    uiSceneBefore,
  );
  assert(uiProject.registry.readText(uiCapability.skill).source.length > 100);

  const recovery = createProject(manager, 'interruption-recovery', 'empty-2d');
  const initialSource = readFileSync(
    join(recovery.project.root, recovery.scene),
    'utf8',
  );
  const interruptedSource = initialSource.replace(
    '"objects": []',
    '"objects": [{"id":"partial","name":"Partial write"}]',
  );
  writeFileSync(join(recovery.project.root, recovery.scene), interruptedSource);
  writeFileSync(
    join(
      recovery.project.root,
      '.aigame',
      'local',
      'pending-workspace-transaction.json',
    ),
    `${JSON.stringify(
      {
        schemaVersion: '1.0.0',
        phase: 'prepared',
        entry: {
          id: 'interrupted-agent-write',
          label: 'Interrupted Agent write',
          createdAt: new Date(0).toISOString(),
          before: [{ path: recovery.scene, content: initialSource }],
          after: [{ path: recovery.scene, content: interruptedSource }],
        },
      },
      null,
      2,
    )}\n`,
  );
  new StudioCommandRegistry({
    projectRoot: recovery.project.root,
    kernelCliPath,
  });
  assert.equal(
    readFileSync(join(recovery.project.root, recovery.scene), 'utf8'),
    initialSource,
  );

  const mcpInput =
    [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'capabilities.list', arguments: {} },
      },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'scene.object.pick',
          arguments: { scene: ai2d.scene, objectId: object2d },
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
      ai2d.project.root,
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
  assert.match(mcp.stdout, /CapabilityRegistry/u);
  assert.match(mcp.stdout, /scene\.transform\.move/u);
  assert.match(mcp.stdout, /parity:object\/player-2d/u);

  const codexManager = readFileSync(
    join(repository, 'studio', 'electron', 'codex-process-manager.ts'),
    'utf8',
  );
  for (const marker of [
    "'thread/list'",
    "'thread/turns/list'",
    "itemsView: 'summary'",
    'excludeTurns: true',
    'loadOlderHistory',
    "'thread/goal/set'",
    'retryTurn',
    'interruptTurn',
    'reasoningEffort',
    'pendingApprovals',
  ])
    assert(codexManager.includes(marker), marker);
  assert.doesNotMatch(
    codexManager,
    /includeTurns:\s*true/u,
    'conversation recovery must not hydrate unbounded tool history',
  );
  const workbench = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'Workbench.tsx'),
    'utf8',
  );
  for (const marker of [
    'copilot-threadbar',
    'CopilotTranscript',
    'copilot-history-more',
    'loadOlderHistory',
    'copilot-goal',
    'setReasoningEffort',
    'decideApproval',
    'applySceneGizmo',
  ])
    assert(workbench.includes(marker), marker);
  const transcriptComponent = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'CopilotTranscript.tsx'),
    'utf8',
  );
  assert(workbench.includes('<CopilotTranscript'));
  for (const marker of [
    'copilot-transcript',
    'copilot-jump-bottom',
    'ResizeObserver',
    'onScroll',
  ])
    assert(
      transcriptComponent.includes(marker),
      `Transcript component: ${marker}`,
    );

  ai2dChange.service.rollback(ai2dChange.changeId);
  assert.equal(
    (
      ai2d.registry.execute('scene.inspect', { path: ai2d.scene })
        .data as SceneDocument
    ).objects.length,
    0,
  );

  console.log(
    JSON.stringify(
      {
        gate: 'P19 capabilities and AI parity',
        capabilityContract: [
          'schema',
          'inspector',
          'runtime',
          'renderer',
          'mcp',
          'skill',
          'test',
          'migration',
          'build',
        ],
        twoDimensionalParity: true,
        threeDimensionalParity: true,
        uiSkillAvailableInEveryPreset: true,
        uiEnableAuthoringAndRollback: true,
        pickingAndGizmos: true,
        durableConversationGoalPlan: true,
        approvalInterruptRecovery: true,
        exactRollback: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
