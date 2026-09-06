import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { ProjectManager } from '../studio/project/project-manager.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p10-mcp-'));
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');
let child: ChildProcessWithoutNullStreams | null = null;

function startMcp(projectRoot: string) {
  const process_ = spawn(
    join(repository, 'target', 'debug', 'aigame-mcp.exe'),
    ['--project', projectRoot],
    {
      cwd: projectRoot,
      windowsHide: true,
      env: {
        ...process.env,
        AIGAME_STUDIO_NODE_RUNTIME: process.execPath,
        AIGAME_STUDIO_ENGINE_MCP_SERVER: join(
          repository,
          'dist',
          'electron',
          'engine-mcp',
          'server.js',
        ),
        AIGAME_STUDIO_KERNEL_CLI: kernelCliPath,
      },
    },
  );
  child = process_;
  const pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  let nextId = 0;
  createInterface({ input: process_.stdout }).on('line', (line) => {
    const message = JSON.parse(line) as {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };
    if (message.id === undefined) return;
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
  });
  const request = (method: string, params: unknown = {}) => {
    const id = ++nextId;
    return new Promise<unknown>((resolveRequest, reject) => {
      pending.set(id, { resolve: resolveRequest, reject });
      process_.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
      );
    });
  };
  return { process: process_, request };
}

try {
  const manager = new ProjectManager({
    templateRoot: join(repository, 'templates'),
    storageDirectory: join(temporary, 'studio'),
    engineVersion: '0.2.0-dev',
  });
  const project = manager.createProject({
    parentDirectory: temporary,
    name: 'P10 MCP Shared Commands',
  });
  const scenePath = join(project.root, project.manifest.entry.scene);
  const inputPath = join(project.root, 'input', 'actions.json');
  const sceneBefore = readFileSync(scenePath, 'utf8');
  const inputBefore = readFileSync(inputPath, 'utf8');
  const playerId = (
    JSON.parse(sceneBefore) as {
      worlds: Array<{ entities: Array<{ id: string }> }>;
    }
  ).worlds[0].entities[0].id;
  const mcp = startMcp(project.root);

  const initialized = (await mcp.request('initialize')) as {
    serverInfo: { name: string };
  };
  assert.equal(initialized.serverInfo.name, 'ai-game-engine');
  const listed = (await mcp.request('tools/list')) as {
    tools: Array<{ name: string }>;
  };
  assert(listed.tools.length >= 25);
  assert(listed.tools.some((tool) => tool.name === 'change.propose'));
  const capabilities = (await mcp.request('tools/call', {
    name: 'capabilities.list',
    arguments: {},
  })) as { structuredContent: { sourceOfTruth: string } };
  assert.equal(
    capabilities.structuredContent.sourceOfTruth,
    'StudioCommandRegistry',
  );

  const manifest = (await mcp.request('tools/call', {
    name: 'project.get_info',
    arguments: {},
  })) as { structuredContent: { name: string } };
  assert.equal(manifest.structuredContent.name, 'P10 MCP Shared Commands');

  const proposalResult = (await mcp.request('tools/call', {
    name: 'change.propose',
    arguments: {
      summary: 'Move the player and add an optional dash action',
      operations: [
        {
          command: 'scene.entity.set_transform',
          input: {
            entityId: playerId,
            x: 7,
            y: 8,
          },
          description: 'Move player',
        },
        {
          command: 'input.define_action',
          input: { id: 'dash', bindings: ['ShiftLeft'] },
          description: 'Add dash action',
        },
      ],
    },
  })) as {
    isError: boolean;
    structuredContent: { id: string; status: string; files: unknown[] };
  };
  assert.equal(
    proposalResult.isError,
    false,
    JSON.stringify(proposalResult.structuredContent),
  );
  assert.equal(proposalResult.structuredContent.status, 'awaitingApproval');
  assert.equal(readFileSync(scenePath, 'utf8'), sceneBefore);
  assert.equal(readFileSync(inputPath, 'utf8'), inputBefore);
  mcp.process.stdin.end();
  await new Promise<void>((resolveExit) =>
    mcp.process.once('exit', () => resolveExit()),
  );
  child = null;

  const registry = new StudioCommandRegistry({
    projectRoot: project.root,
    kernelCliPath,
  });
  const changes = new StudioChangeSetService({
    projectRoot: project.root,
    kernelCliPath,
    registry,
  });
  const changeId = proposalResult.structuredContent.id;
  const approved = changes.approve(changeId, ['operation:1']);
  assert.equal(approved.status, 'approved');
  assert.match(approved.approval?.contentHash ?? '', /^[0-9a-f]{64}$/u);
  const applied = changes.apply(changeId);
  assert.equal(applied.status, 'applied');
  assert.match(readFileSync(scenePath, 'utf8'), /"x": 7/u);
  assert.equal(readFileSync(inputPath, 'utf8'), inputBefore);
  assert.equal(changes.test(changeId).status, 'tested');
  assert.equal(changes.rollback(changeId).status, 'rolledBack');
  assert.equal(readFileSync(scenePath, 'utf8'), sceneBefore);
  assert.equal(readFileSync(inputPath, 'utf8'), inputBefore);

  manager.closeProject();
  console.log(
    '[P10 Engine MCP] shared registry, durable proposal, per-operation review, hash approval, apply, test, and exact rollback passed',
  );
} finally {
  const runningChild = child as ChildProcessWithoutNullStreams | null;
  if (runningChild && runningChild.exitCode === null) {
    const exiting = new Promise<void>((resolveExit) =>
      runningChild.once('exit', () => resolveExit()),
    );
    runningChild.kill();
    await exiting;
  }
  rmSync(temporary, { recursive: true, force: true });
}
