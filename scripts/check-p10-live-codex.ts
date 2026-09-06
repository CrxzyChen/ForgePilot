import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  CodexProcessManager,
  type CodexStudioState,
} from '../studio/electron/codex-process-manager.ts';

const repository = resolve(process.cwd());
const projectRoot = resolve(
  process.argv[2] ?? resolve(repository, 'work', 'projects', 'tank-arena'),
);
const manager = new CodexProcessManager({
  applicationRoot: repository,
  runtimeExecutable: process.execPath,
});

function gitStatus(): string {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}

function waitForTerminalTurn(timeoutMs = 180_000): Promise<CodexStudioState> {
  return new Promise((resolveState, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('live Codex Ask turn timed out'));
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
  const before = gitStatus();
  const ready = await manager.start(projectRoot);
  assert.equal(ready.status, 'ready', ready.error ?? undefined);
  assert(ready.account, 'live gate requires an authenticated ChatGPT account');
  assert(ready.threadId, 'project thread was not created or resumed');
  assert(ready.model, 'no supported model was selected');
  assert(ready.models.some((model) => model.model === ready.model));

  const terminalPromise = waitForTerminalTurn();
  await manager.startTurn(
    'ask',
    'Read the project guidance and manifest. In two short lines, state the project name and entry scene. Do not modify files.',
  );
  const terminal = await terminalPromise;
  assert.equal(
    terminal.activeTurn?.status,
    'completed',
    terminal.activeTurn?.error ?? terminal.error ?? undefined,
  );
  assert((terminal.activeTurn?.text.length ?? 0) > 0, 'Ask returned no text');
  assert.equal(gitStatus(), before, 'Ask mode modified the project worktree');
  console.log(
    JSON.stringify({
      ok: true,
      codexVersion: terminal.version,
      model: terminal.model,
      accountType: terminal.account?.type,
      threadId: terminal.threadId,
      answer: terminal.activeTurn?.text,
    }),
  );
} finally {
  await manager.stop();
}
