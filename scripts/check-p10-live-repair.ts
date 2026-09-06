import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  CodexProcessManager,
  type CodexStudioState,
} from '../studio/electron/codex-process-manager.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const projectRoot = resolve(
  process.argv[2] ?? join(repository, 'work', 'projects', 'tank-arena'),
);
const kernelCliPath = join(repository, 'target', 'debug', 'kernelctl.exe');
const replayRelativePath = 'replays/smoke.input.json';
const replayPath = join(projectRoot, 'replays', 'smoke.input.json');
const registry = new StudioCommandRegistry({ projectRoot, kernelCliPath });
const changes = new StudioChangeSetService({
  projectRoot,
  kernelCliPath,
  registry,
});
const manager = new CodexProcessManager({
  applicationRoot: repository,
  runtimeExecutable: process.execPath,
});
let badChangeId: string | null = null;
let repairChangeId: string | null = null;

function waitForTerminalTurn(timeoutMs = 240_000): Promise<CodexStudioState> {
  return new Promise((resolveState, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `live Codex repair turn timed out: ${JSON.stringify(manager.getState())}`,
        ),
      );
    }, timeoutMs);
    const onState = (state: CodexStudioState) => {
      const status = state.activeTurn?.status;
      if (status && status !== 'inProgress') {
        cleanup();
        resolveState(state);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      manager.events.off('state', onState);
    };
    manager.events.on('state', onState);
  });
}

function rollbackIfNeeded(id: string | null): void {
  if (!id) return;
  const change = changes.read(id);
  if (['applied', 'tested', 'failed'].includes(change.status)) {
    changes.rollback(id);
  }
}

const originalReplay = readFileSync(replayPath, 'utf8');
try {
  const current = registry.readText(replayRelativePath);
  const invalidReplay = JSON.parse(current.source) as Record<string, unknown>;
  invalidReplay.ticks = 'broken-on-purpose';
  const bad = changes.propose({
    summary: 'P10 deliberate deterministic replay failure',
    operations: [
      {
        command: 'project.file.write',
        input: {
          path: replayRelativePath,
          content: `${JSON.stringify(invalidReplay, null, 2)}\n`,
          baseHash: current.hash,
        },
        description: 'Set replay ticks to an invalid type',
      },
    ],
  });
  badChangeId = bad.id;
  changes.approve(bad.id);
  changes.apply(bad.id);
  const failed = changes.test(bad.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error ?? '', /内核命令失败/u);

  const knownIds = new Set(changes.list().map((change) => change.id));
  const ready = await manager.start(projectRoot);
  assert.equal(ready.status, 'ready', ready.error ?? undefined);
  assert(
    ready.mcpServers.some(
      (server) => server.name === 'ai-game-engine' && server.toolCount >= 25,
    ),
  );
  const terminalPromise = waitForTerminalTurn();
  await manager.startTurn(
    'agent',
    'The project smoke replay now fails deliberately. Use the repair-game-failure Skill and ai-game-engine MCP tools to reproduce and diagnose it. Propose the smallest project.write_file ChangeSet that restores a valid integer ticks value while preserving the replay commands. Stop after the repair ChangeSet is awaiting Studio approval; do not directly write project source.',
  );
  const terminal = await terminalPromise;
  assert.equal(
    terminal.activeTurn?.status,
    'completed',
    terminal.activeTurn?.error ?? terminal.error ?? undefined,
  );
  const repair = changes.list().find((change) => !knownIds.has(change.id));
  assert(
    repair,
    terminal.activeTurn?.text ?? 'Codex created no repair ChangeSet',
  );
  repairChangeId = repair.id;
  assert.equal(repair.status, 'awaitingApproval');
  changes.approve(repair.id);
  changes.apply(repair.id);
  assert.equal(changes.test(repair.id).status, 'tested');

  changes.rollback(repair.id);
  repairChangeId = null;
  assert.match(readFileSync(replayPath, 'utf8'), /broken-on-purpose/u);
  changes.rollback(bad.id);
  badChangeId = null;
  assert.equal(readFileSync(replayPath, 'utf8'), originalReplay);

  const threadId = terminal.threadId;
  await manager.startTurn(
    'ask',
    'Inspect every project file and write a long architectural report. Do not modify files.',
  );
  const interrupted = await manager.interruptTurn();
  assert.notEqual(interrupted.activeTurn?.status, 'inProgress');
  await manager.stop();
  const recovered = await manager.start(projectRoot);
  assert.equal(recovered.threadId, threadId);
  assert.equal(recovered.status, 'ready');

  console.log(
    JSON.stringify({
      ok: true,
      failure: failed.error,
      repairChangeId: repair.id,
      repairProposalHash: repair.proposalHash,
      repairAnswer: terminal.activeTurn?.text,
      interruptionRecovered: true,
    }),
  );
} finally {
  await manager.stop();
  rollbackIfNeeded(repairChangeId);
  rollbackIfNeeded(badChangeId);
  assert.equal(readFileSync(replayPath, 'utf8'), originalReplay);
}
