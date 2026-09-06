import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import type { ProjectRuntimeResult } from '../studio/runtime/project-script-runtime.ts';
import { evaluateUiContent } from '../studio/runtime/runtime-ui-content-assertions.ts';
import type {
  SceneDocument,
  SceneComponentDocument,
} from '../studio/workspace/scene-authoring-service.ts';

const repository = resolve(import.meta.dirname, '..');
// Optional extracted Studio directory: exercise its shipped bridge and runtimes,
// not the workspace build. No owner project/profile or credentials are loaded.
const installedRoot = process.argv[2] ? resolve(process.argv[2]) : null;
const appRoot = installedRoot ? join(installedRoot, 'resources/app') : null;
const kernelCliPath = appRoot
  ? join(appRoot, 'bin/kernelctl.exe')
  : join(repository, 'target/debug/kernelctl.exe');
const scriptHostPath = appRoot
  ? join(appRoot, 'bin/project-script-host.exe')
  : join(repository, 'target/debug/project-script-host.exe');
const bridgePath = appRoot
  ? join(appRoot, 'dist/electron/engine-mcp/server.js')
  : join(repository, 'dist/electron/engine-mcp/server.js');
const bridgeRuntime = installedRoot
  ? join(installedRoot, 'AI Game Studio.exe')
  : process.execPath;
// kernelCliPath is a legacy locator; the structured runtime test path does not
// launch it, and the current Studio package intentionally does not ship it.
const testedFiles = [bridgeRuntime, scriptHostPath, bridgePath].map((path) => ({
  path,
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
}));
const temporary = mkdtempSync(join(tmpdir(), 'aigame-ui-content-assertions-'));
const projectRoot = join(temporary, 'project');
cpSync(join(repository, 'examples/tank-arena'), projectRoot, {
  recursive: true,
  filter: (path) =>
    !['.git', '.aigame', 'out', 'dist'].includes(basename(path)),
});
const registry = new StudioCommandRegistry({
  projectRoot,
  kernelCliPath,
  scriptHostPath,
});
const object = (id: string, components: SceneComponentDocument[]) => ({
  id,
  name: id,
  parentId: null,
  enabled: true,
  visible: true,
  order: 0,
  components,
});
const component = (
  id: string,
  type: string,
  data: Record<string, unknown>,
) => ({
  id,
  type,
  enabled: true,
  data,
});
const scene = {
  schemaVersion: '2.0.0-alpha.1',
  id: 'content:scene/test',
  name: 'UI content fit',
  space: 'ui',
  objects: [
    object('content:panel', [
      component('content:panel/transform', 'core:ui-transform', {
        anchor: { x: 0.5, y: 0.5 },
        size: { x: 400, y: 200 },
      }),
      component('content:panel/image', 'ui:button', {
        label: '',
        fontSize: 24,
        action: 'primary-action',
        backgroundColor: '#ffffff',
        disabled: false,
      }),
    ]),
    object('content:label', [
      component('content:label/transform', 'core:ui-transform', {
        anchor: { x: 0.5, y: 0.44 },
        size: { x: 1, y: 1 },
      }),
      component('content:label/text', 'ui:text', {
        text: 'VOLUME  80%\nM  MUTE\n[ / ]  ADJUST',
        fontSize: 24,
        color: '#ffffff',
        align: 'center',
      }),
    ]),
  ],
};
const fit = (width = 1280, height = 720) => ({
  id: 'assertion:content-safe',
  tick: 0,
  target: { objectId: 'content:label', componentId: 'content:label/text' },
  operator: 'fitsUiContent',
  expected: {
    container: {
      objectId: 'content:panel',
      componentId: 'content:panel/image',
    },
    inset: { left: 0.1, right: 0.1, top: 0.15, bottom: 0.15 },
    viewport: { width, height },
    minimumMargin: 6,
  },
});
type FixtureScene = typeof scene;
type RpcMessage = {
  id?: number;
  result: {
    tools?: Array<{ name: string; description: string }>;
    isError?: boolean;
    structuredContent: {
      passed: boolean;
      testRunId: string;
      result: ProjectRuntimeResult;
    };
  };
};
const vector = (s: FixtureScene, index: number, field: 'anchor' | 'size') =>
  s.objects[index].components[0].data[field] as { x: number; y: number };
const results: Array<{
  name: string;
  status: ProjectRuntimeResult['status'];
  diagnostics: ProjectRuntimeResult['diagnostics'];
}> = [];
function run(
  name: string,
  change: (scene: FixtureScene) => void = () => {},
  assertion: unknown = fit(),
) {
  const current = structuredClone(scene);
  change(current);
  writeFileSync(
    join(projectRoot, 'scenes/content.game.json'),
    JSON.stringify(current),
  );
  writeFileSync(
    join(projectRoot, 'tests/content.test.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      kind: 'runtime-scenario',
      scene: 'scenes/content.game.json',
      seed: 42,
      ticks: 1,
      assertions: [assertion],
    }),
  );
  const result = registry.execute('test.run', {
    test: 'tests/content.test.json',
  }).data as ProjectRuntimeResult;
  results.push({
    name,
    status: result.status,
    diagnostics: result.diagnostics,
  });
  return result;
}
try {
  for (const [w, h] of [
    [1280, 720],
    [960, 540],
  ]) {
    assert.equal(run(`safe-${w}`, () => {}, fit(w, h)).status, 'completed');
    assert.equal(
      run(
        `bottom-overflow-${w}`,
        (s) => (vector(s, 1, 'anchor').y = 0.55),
        fit(w, h),
      ).status,
      'failed',
      'All lines must fit, not only the first line',
    );
    assert.equal(
      run(
        `long-line-${w}`,
        (s) => (s.objects[1].components[1].data.text = 'A'.repeat(40)),
        fit(w, h),
      ).status,
      'failed',
    );
  }
  assert.equal(
    run('hidden-text', (s) => (s.objects[1].visible = false)).status,
    'failed',
  );
  assert.equal(run('missing-text', (s) => s.objects.pop()).status, 'failed');
  assert.equal(
    run('hidden-panel', (s) => (s.objects[0].visible = false)).status,
    'failed',
  );
  assert.equal(run('missing-panel', (s) => s.objects.shift()).status, 'failed');
  assert.equal(
    run('prefix-is-not-component', () => {}, {
      ...fit(),
      target: { objectId: 'content:label', componentId: 'content:label' },
    }).status,
    'failed',
  );
  assert.equal(
    run(
      'transparent-text',
      (s) => (s.objects[1].components[1].data.color = '#ffffff00'),
    ).status,
    'failed',
  );
  assert.equal(
    run('spaces-only', (s) => (s.objects[1].components[1].data.text = '   '))
      .status,
    'failed',
  );
  assert.equal(
    run('panel-offscreen', (s) => (vector(s, 0, 'size').x = 2000)).status,
    'failed',
  );
  assert.equal(
    run('empty-text', (s) => (s.objects[1].components[1].data.text = ''))
      .status,
    'failed',
  );
  const rotated = structuredClone(scene);
  rotated.objects[0].components[0].data.rotation = 30;
  assert.equal(
    evaluateUiContent(rotated as SceneDocument, fit().target, fit().expected)
      .matches,
    false,
  );
  assert.equal(
    run('viewport-clip', (s) => {
      vector(s, 0, 'anchor').x = 0;
      vector(s, 1, 'anchor').x = 0;
    }).status,
    'failed',
  );
  assert.equal(
    run('button-label', (s) => {
      const c = s.objects[1].components[1];
      c.type = 'ui:button';
      c.data = {
        label: 'BACK  [H]',
        fontSize: 24,
        action: 'primary-action',
        disabled: false,
      };
    }).status,
    'completed',
  );
  const ownButtonFit = fit();
  ownButtonFit.expected.container = { ...ownButtonFit.target };
  const transparentButton = (s: FixtureScene) => {
    s.objects[1].components[1].type = 'ui:button';
    s.objects[1].components[1].data = {
      label: 'BACK',
      fontSize: 24,
      action: 'primary-action',
      disabled: false,
      textColor: '#ffffff',
      backgroundColor: '#00000000',
    };
    vector(s, 1, 'size').x = 300;
    vector(s, 1, 'size').y = 80;
  };
  assert.equal(
    run('transparent-button-own-hit-area', transparentButton, ownButtonFit)
      .status,
    'completed',
  );
  assert.equal(
    run(
      'transparent-button-hidden',
      (s) => {
        transparentButton(s);
        s.objects[1].visible = false;
      },
      ownButtonFit,
    ).status,
    'failed',
  );
  assert.equal(
    run(
      'transparent-button-invisible-label',
      (s) => {
        transparentButton(s);
        s.objects[1].components[1].data.textColor = '#ffffff00';
      },
      ownButtonFit,
    ).status,
    'failed',
  );
  assert.equal(
    run(
      'transparent-button-too-small',
      (s) => {
        transparentButton(s);
        vector(s, 1, 'size').x = 20;
      },
      ownButtonFit,
    ).status,
    'failed',
  );
  assert.equal(
    run('transparent-unrelated-container', (s) => {
      s.objects[0].components[1].data.backgroundColor = '#00000000';
    }).status,
    'failed',
  );
  assert.equal(
    run('image-panel', (s) => {
      s.objects[0].components[1].type = 'ui:image';
      s.objects[0].components[1].data = {
        texture: 'tank-arena-example:asset/tank-sprite-v1',
        tint: '#ffffff',
      };
    }).status,
    'completed',
  );
  assert.equal(
    run(
      'trailing-newline',
      (s) =>
        (s.objects[1].components[1].data.text =
          String(s.objects[1].components[1].data.text) + '\n'),
    ).status,
    'completed',
  );
  for (const mutate of [
    (a: ReturnType<typeof fit>) => (a.expected.inset.left = -1),
    (a: ReturnType<typeof fit>) => (a.expected.inset.left = 0.99),
    (a: ReturnType<typeof fit>) => (a.expected.viewport.width = 0),
    (a: ReturnType<typeof fit>) => (a.expected.viewport.width = 1.5),
    (a: ReturnType<typeof fit>) => (a.expected.minimumMargin = -1),
    (a: ReturnType<typeof fit>) =>
      (a.expected.container.componentId = 'not semantic'),
    (a: ReturnType<typeof fit>) => Object.assign(a.expected, { extra: true }),
    (a: ReturnType<typeof fit>) => Object.assign(a.target, { field: 'size' }),
    (a: ReturnType<typeof fit>) => Object.assign(a, { compareTick: 1 }),
  ]) {
    const assertion = fit();
    mutate(assertion);
    assert.throws(
      () => run('invalid', () => {}, assertion),
      /TEST_ASSERTION_INVALID|可执行/u,
    );
  }
  for (const failed of results.filter((r) => r.status === 'failed')) {
    assert(
      failed.diagnostics.some(
        (d) =>
          d.code === 'TEST_ASSERTION_FAILED' &&
          (d.state as { uiContent?: unknown })?.uiContent,
      ),
      failed.name,
    );
  }
  const child = spawn(bridgeRuntime, [bridgePath, '--project', projectRoot], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      NODE_ENV: 'test',
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: process.env.PATH,
      AIGAME_STUDIO_KERNEL_CLI: kernelCliPath,
      AIGAME_STUDIO_SCRIPT_HOST: scriptHostPath,
    },
  });
  let stdout = '';
  const pending = new Map<number, (message: RpcMessage) => void>();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    const lines = stdout.split(/\r?\n/u);
    stdout = lines.pop() ?? '';
    for (const line of lines.filter((s) => s.trim())) {
      const message = JSON.parse(line) as RpcMessage;
      if (typeof message.id === 'number') {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
    }
  });
  child.stderr.resume();
  const rpc = (
    id: number,
    method: string,
    params: unknown,
  ): Promise<RpcMessage> =>
    new Promise((resolveResponse, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`UI assertion MCP timeout: ${method}`));
      }, 20000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolveResponse(message);
      });
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
      );
    });
  try {
    const tools = await rpc(1, 'tools/list', {});
    assert.match(
      tools.result.tools?.find((t) => t.name === 'test.run')?.description ?? '',
      /fitsUiContent/u,
    );
    run('before-mcp-safe');
    const green = await rpc(2, 'tools/call', {
      name: 'test.run',
      arguments: { path: 'tests/content.test.json' },
    });
    assert.equal(
      green.result.structuredContent.passed,
      true,
      JSON.stringify(green),
    );
    run('before-mcp-overflow', (s) => (vector(s, 1, 'anchor').y = 0.55));
    const red = await rpc(3, 'tools/call', {
      name: 'test.run',
      arguments: { path: 'tests/content.test.json' },
    });
    assert.equal(red.result.isError, true);
    assert.equal(red.result.structuredContent.passed, false);
    const id = red.result.structuredContent.testRunId;
    const detail = await rpc(4, 'tools/call', {
      name: 'test.result',
      arguments: { id },
    });
    assert(
      detail.result.structuredContent.result.diagnostics.some(
        (d) =>
          (d.state as { uiContent?: { reason?: string } })?.uiContent
            ?.reason === 'content-inset-overflow',
      ),
    );
    run('before-mcp-own-transparent-button', transparentButton, ownButtonFit);
    const ownButton = await rpc(5, 'tools/call', {
      name: 'test.run',
      arguments: { path: 'tests/content.test.json' },
    });
    assert.equal(
      ownButton.result.structuredContent.passed,
      true,
      JSON.stringify(ownButton),
    );
    run('before-mcp-unrelated-transparent-panel', (s) => {
      s.objects[0].components[1].data.backgroundColor = '#00000000';
    });
    const unrelated = await rpc(6, 'tools/call', {
      name: 'test.run',
      arguments: { path: 'tests/content.test.json' },
    });
    assert.equal(unrelated.result.structuredContent.passed, false);
    const unrelatedDetail = await rpc(7, 'tools/call', {
      name: 'test.result',
      arguments: { id: unrelated.result.structuredContent.testRunId },
    });
    assert(
      unrelatedDetail.result.structuredContent.result.diagnostics.some(
        (d) =>
          (d.state as { uiContent?: { reason?: string } })?.uiContent
            ?.reason === 'hidden-ui-target',
      ),
    );
  } finally {
    child.kill();
  }
  writeFileSync(
    join(temporary, 'results.json'),
    JSON.stringify(
      {
        results,
        invalidCases: 9,
        installedRoot,
        testedFiles,
        compiledMcpPassFailAndDurableResult: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      gate: 'P31 actual UI content-bound assertions',
      evidence: temporary,
      installedRoot,
      testedFiles,
      cases: results.map(({ name, status }) => ({ name, status })),
      invalidCases: 9,
      compiledMcpPassFailAndDurableResult: true,
      result: 'passed',
    }),
  );
} finally {
  registry.dispose();
}
