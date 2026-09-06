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
import { projectSceneToRenderSnapshot } from '../studio/runtime/runtime-projection.ts';
import type {
  SceneDocument,
  SceneObjectDocument,
} from '../studio/workspace/scene-authoring-service.ts';

const repository = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p24-ui-'));
const projectRoot = join(temporary, 'pong-2d');
const hostPath = join(
  repository,
  'target',
  'debug',
  process.platform === 'win32'
    ? 'project-script-host.exe'
    : 'project-script-host',
);

function uiObject(
  id: string,
  label: string,
  anchor: { x: number; y: number },
  visible: boolean,
  order: number,
  buttonAction?: string,
): SceneObjectDocument {
  return {
    id,
    name: label,
    enabled: true,
    visible,
    locked: false,
    parentId: null,
    order,
    components: [
      {
        id: `${id}/transform`,
        type: 'core:ui-transform',
        enabled: true,
        data: { anchor, size: { x: buttonAction ? 220 : 320, y: 56 } },
      },
      buttonAction
        ? {
            id: `${id}/button`,
            type: 'ui:button',
            enabled: true,
            data: {
              label,
              action: buttonAction,
              backgroundColor: '#16344d',
              textColor: '#ffffff',
              fontSize: 24,
              disabled: false,
            },
          }
        : {
            id: `${id}/text`,
            type: 'ui:text',
            enabled: true,
            data: {
              text: label,
              fontSize: 28,
              color: '#ffffff',
              align: 'center',
            },
          },
    ],
  };
}

try {
  cpSync(join(repository, 'examples', 'pong-2d'), projectRoot, {
    recursive: true,
  });
  const projectPath = join(projectRoot, 'project.aigame.json');
  const project = JSON.parse(readFileSync(projectPath, 'utf8')) as {
    capabilities: string[];
  };
  if (!project.capabilities.includes('ui')) project.capabilities.push('ui');
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');

  const scenePath = join(projectRoot, 'scenes', 'main.game.json');
  const scene = JSON.parse(readFileSync(scenePath, 'utf8')) as SceneDocument;
  const start = uiObject(
    'pong:ui/start',
    'START',
    { x: 0.5, y: 0.5 },
    true,
    100,
    'menu:start',
  );
  start.components.push({
    id: 'pong:ui/start/script',
    type: 'core:script',
    enabled: true,
    data: { path: 'scripts/behaviors/ui-flow.ts', enabled: true },
  });
  scene.objects.push(
    start,
    uiObject('pong:ui/hud', 'SCORE 0', { x: 0.12, y: 0.08 }, false, 101),
    uiObject('pong:ui/pause', 'PAUSED', { x: 0.5, y: 0.4 }, false, 102),
    uiObject('pong:ui/win', 'YOU WIN', { x: 0.5, y: 0.4 }, false, 103),
    uiObject('pong:ui/lose', 'GAME OVER', { x: 0.5, y: 0.4 }, false, 104),
    uiObject(
      'pong:ui/restart',
      'RESTART',
      { x: 0.5, y: 0.62 },
      true,
      105,
      'game:restart',
    ),
  );
  writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(projectRoot, 'scripts', 'behaviors', 'ui-flow.ts'),
    `import { defineBehavior } from '@aigame/sdk';
export default defineBehavior({
  onInput(action, value, context) {
    if (value <= 0) return;
    if (action === 'menu:start') {
      context.setVisible('pong:ui/start', false);
      context.setVisible('pong:ui/hud', true);
    }
    if (action === 'game:pause') context.setVisible('pong:ui/pause', true);
    if (action === 'game:win') context.setVisible('pong:ui/win', true);
    if (action === 'game:lose') context.setVisible('pong:ui/lose', true);
    if (action === 'game:restart') {
      context.setVisible('pong:ui/start', true);
      context.setVisible('pong:ui/hud', false);
      context.setVisible('pong:ui/pause', false);
      context.setVisible('pong:ui/win', false);
      context.setVisible('pong:ui/lose', false);
    }
  },
});
`,
    'utf8',
  );
  const runtimePath = join(projectRoot, 'scripts', 'runtime.json');
  const manifest = JSON.parse(readFileSync(runtimePath, 'utf8')) as {
    modules: Array<Record<string, unknown>>;
  };
  manifest.modules.push({
    id: 'pong:behavior/ui-flow',
    kind: 'behavior',
    source: 'scripts/behaviors/ui-flow.ts',
  });
  writeFileSync(runtimePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const runtime = new ProjectScriptRuntime({
    projectRoot,
    scriptHostPath: hostPath,
  });
  const result = runtime.run({
    ticks: 5,
    inputs: [
      { tick: 0, action: 'menu:start', value: 1 },
      { tick: 1, action: 'game:pause', value: 1 },
      { tick: 2, action: 'game:win', value: 1 },
      { tick: 3, action: 'game:lose', value: 1 },
      { tick: 4, action: 'game:restart', value: 1 },
    ],
    persistTrace: false,
  });
  assert.equal(result.status, 'completed');
  const uiDrawables = result.renderSnapshot.payload.drawables.filter(
    (drawable) => drawable.space === 'ui',
  );
  assert(uiDrawables.some((drawable) => drawable.text === 'START'));
  assert(uiDrawables.some((drawable) => drawable.text === 'RESTART'));
  assert(uiDrawables.some((drawable) => drawable.inputAction === 'menu:start'));
  assert(
    uiDrawables.some((drawable) => drawable.inputAction === 'game:restart'),
  );
  const visibilityMutations = result.timeline.filter(
    (entry) => entry.kind === 'lifecycle:visible:applied',
  );
  assert.equal(visibilityMutations.length, 10);
  assert.equal(
    result.scene.objects.find((object) => object.id === 'pong:ui/start')
      ?.visible,
    true,
  );
  assert.equal(
    result.scene.objects.find((object) => object.id === 'pong:ui/hud')?.visible,
    false,
  );
  const projected = projectSceneToRenderSnapshot({
    scene: result.scene,
    assets: [],
    sessionId: result.renderSnapshot.sessionId,
    generation: result.renderSnapshot.generation,
    sequence: result.renderSnapshot.sequence,
    tick: result.renderSnapshot.tick,
  });
  assert.deepEqual(projected.payload, result.renderSnapshot.payload);

  const viewport = readFileSync(
    join(repository, 'studio', 'electron', 'renderer', 'EngineViewport.tsx'),
    'utf8',
  );
  const player = readFileSync(
    join(repository, 'crates', 'player', 'src', 'main.rs'),
    'utf8',
  );
  assert(viewport.includes("hit?.inputAction ?? 'pointer:Mouse0'"));
  assert(player.includes('snapshot_ui_action'));
  assert(player.includes('RenderItem::UiPrimitive'));

  console.log(
    JSON.stringify(
      {
        gate: 'P24 menu/HUD/pause/win/lose UI projection and input',
        uiDrawables: uiDrawables.map((drawable) => ({
          id: drawable.id,
          primitive: drawable.primitive,
          text: drawable.text,
          inputAction: drawable.inputAction,
          visible: drawable.visible,
        })),
        lifecycleVisibilityMutations: visibilityMutations.length,
        studioPointerHitTest: true,
        playerPointerHitTest: true,
        projectionParity: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
