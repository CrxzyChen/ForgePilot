import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectScriptRuntime } from '../studio/runtime/project-script-runtime.ts';
import { projectSceneToRenderSnapshot } from '../studio/runtime/runtime-projection.ts';
import { RuntimeSessionService } from '../studio/runtime/runtime-session-service.ts';

const repository = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p23-'));
const projectRoot = join(temporary, 'pong-2d');
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
  const runtime = new ProjectScriptRuntime({
    projectRoot,
    scriptHostPath: hostPath,
  });
  const full = runtime.run({
    ticks: 3,
    seed: 20260903,
    inputs: [{ tick: 2, action: 'left-up', value: 1 }],
    persistTrace: false,
    sessionId: 'session:p23_full',
    generation: 1,
    sequence: 1,
  });

  const session = new RuntimeSessionService(runtime);
  const first = session.start({
    ticks: 2,
    seed: 20260903,
    persistTrace: false,
  });
  const stableSessionId = session.sessionId;
  assert.equal(session.state, 'playing');
  assert.equal(first.tick, 2);
  session.pause();
  assert.equal(session.state, 'paused');
  session.queueInput({ tick: 2, action: 'left-up', value: 1 });
  const stepped = session.step();
  assert.equal(session.state, 'paused');
  assert.equal(stepped.tick, 3);
  assert.equal(
    stepped.snapshots[0]?.tick,
    2,
    'single step must continue at the live Tick instead of replaying from zero',
  );
  assert.equal(
    stepped.stateHash,
    full.stateHash,
    'segmented pause/step must match one authoritative three-Tick run',
  );

  const projected = projectSceneToRenderSnapshot({
    scene: stepped.scene,
    sessionId: stepped.renderSnapshot.sessionId,
    generation: stepped.renderSnapshot.generation,
    sequence: stepped.renderSnapshot.sequence,
    tick: stepped.renderSnapshot.tick,
  });
  assert.deepEqual(
    stepped.renderSnapshot.payload,
    projected.payload,
    'Studio projection and script-host/Player projection must be identical',
  );
  assert.equal(stepped.renderSnapshot.protocolVersion, '3.0.0-preview.1');
  assert(stepped.renderSnapshot.payload.drawables.length >= 5);
  assert.equal(stepped.debugSnapshot.payload.stateHash, stepped.stateHash);

  const previousGeneration = session.generation;
  const restarted = session.restart(1);
  assert.equal(session.sessionId, stableSessionId);
  assert.equal(session.generation, previousGeneration + 1);
  assert.equal(restarted.tick, 1);

  const workbench = readFileSync(
    join(repository, 'studio/electron/renderer/Workbench.tsx'),
    'utf8',
  );
  const player = readFileSync(
    join(repository, 'crates/player/src/main.rs'),
    'utf8',
  );
  assert(workbench.includes('<EngineViewport'));
  assert(
    !/className=\{[\s\S]{0,300}selectedEntityIds[\s\S]{0,500}<Box \/>/u.test(
      workbench,
    ),
  );
  assert(player.includes('snapshot_primitives'));
  assert(player.includes('wgpu-runtime-render-snapshot'));
  assert(player.includes('script_host: Option<ProjectScriptHost>'));

  const mcp = spawnSync(
    process.execPath,
    [
      join(repository, 'studio', 'server', 'engine-mcp-server.ts'),
      '--project',
      projectRoot,
    ],
    {
      cwd: repository,
      encoding: 'utf8',
      timeout: 30_000,
      input:
        `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n` +
        `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`,
      env: {
        ...process.env,
        AIGAME_STUDIO_SCRIPT_HOST: hostPath,
        AIGAME_STUDIO_KERNEL_CLI: join(
          repository,
          'target',
          'debug',
          process.platform === 'win32' ? 'kernelctl.exe' : 'kernelctl',
        ),
      },
    },
  );
  assert.equal(mcp.status, 0, mcp.stderr || mcp.stdout);
  const responses = mcp.stdout
    .trim()
    .split(/\r?\n/u)
    .map(
      (line) =>
        JSON.parse(line) as {
          id?: number;
          result?: { tools?: Array<{ name: string }> };
        },
    );
  const toolNames = new Set(
    responses
      .find((response) => response.id === 2)
      ?.result?.tools?.map((tool) => tool.name),
  );
  for (const name of [
    'runtime.run',
    'runtime.input',
    'runtime.pause',
    'runtime.resume',
    'runtime.step_tick',
    'runtime.restart',
    'runtime.stop',
  ]) {
    assert(toolNames.has(name), `Engine MCP omitted ${name}`);
  }
  const skill = readFileSync(
    join(
      repository,
      'templates/base/files/.agents/skills/build-and-test-game/SKILL.md',
    ),
    'utf8',
  );
  assert(skill.includes('runtime.resume'));
  assert(skill.includes('renderSnapshot'));

  console.log(
    JSON.stringify(
      {
        gate: 'P23 persistent runtime and shared projection',
        protocolVersion: stepped.renderSnapshot.protocolVersion,
        sessionId: stableSessionId,
        generation: session.generation,
        steppedFromTick: stepped.snapshots[0]?.tick,
        finalTick: stepped.tick,
        stateHash: stepped.stateHash,
        drawables: stepped.renderSnapshot.payload.drawables.length,
        studioViewport: 'canvas-engine-viewport',
        playerProjectionConsumer: 'wgpu-runtime-render-snapshot',
        mcpRuntimeTools: toolNames.size,
        projectSkill: 'build-and-test-game',
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
