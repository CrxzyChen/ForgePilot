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
const scenePath = join(projectRoot, 'scenes', 'main.game.json');
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

function waitForTerminalTurn(timeoutMs = 240_000): Promise<CodexStudioState> {
  return new Promise((resolveState, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('live Codex Agent turn timed out'));
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

try {
  const sourceBefore = readFileSync(scenePath, 'utf8');
  const knownIds = new Set(changes.list().map((change) => change.id));
  const ready = await manager.start(projectRoot);
  assert.equal(ready.status, 'ready', ready.error ?? undefined);
  assert(ready.account && ready.threadId && ready.model);

  const terminalPromise = waitForTerminalTurn();
  await manager.startTurn(
    'agent',
    'Use the ai-game-engine MCP server to inspect the entry scene and propose moving the player entity to x=4, y=9. Use entity.set_transform or change.propose. Stop after creating the ChangeSet so I can review it in Studio. Do not edit project source files directly.',
  );
  const terminal = await terminalPromise;
  assert.equal(
    terminal.activeTurn?.status,
    'completed',
    terminal.activeTurn?.error ?? terminal.error ?? undefined,
  );
  assert.equal(readFileSync(scenePath, 'utf8'), sourceBefore);
  const proposed = changes.list().find((change) => !knownIds.has(change.id));
  assert(proposed, terminal.activeTurn?.text ?? 'Codex created no ChangeSet');
  assert.equal(proposed.status, 'awaitingApproval');
  assert(proposed.files.some((file) => file.path === 'scenes/main.game.json'));

  changes.approve(proposed.id);
  changes.apply(proposed.id);
  assert.match(readFileSync(scenePath, 'utf8'), /"x": 4/u);
  assert.equal(changes.test(proposed.id).status, 'tested');
  assert.equal(changes.rollback(proposed.id).status, 'rolledBack');
  assert.equal(readFileSync(scenePath, 'utf8'), sourceBefore);
  console.log(
    JSON.stringify({
      ok: true,
      codexVersion: terminal.version,
      model: terminal.model,
      changeId: proposed.id,
      proposalHash: proposed.proposalHash,
      answer: terminal.activeTurn?.text,
      activities: terminal.activeTurn?.activities,
    }),
  );
} finally {
  await manager.stop();
}
