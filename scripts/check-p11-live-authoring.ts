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

function waitForTerminalTurn(timeoutMs = 300_000): Promise<CodexStudioState> {
  return new Promise((resolveState, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('P11 live Codex authoring turn timed out'));
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
    `Use the author-gameplay-feature skill and the ai-game-engine MCP server. Inspect the project and replace scenes/main.game.json with the complete P11 Tank Arena vertical-slice scene described below. Submit exactly one project.write_file ChangeSet and stop for human review; never edit source directly.

Keep the normal GameProject envelope, a 32x18 world, stable tank-arena: IDs, and these authored entities:
- player at (2,9): core:transform, game:player-controlled, and game:tank with faction tank-arena:player-faction, role player, health/maxHealth 3, damage 1, range 8, scoreValue 0.
- base at (2,12): core:transform and game:base with the player faction, health/maxHealth 2.
- destructible brick at (5,9): core:transform and game:terrain kind brick, blocksMovement true, blocksShots true, destructible true, health 1.
- scout wave spawner at (2,16): core:transform and game:wave-spawner with wave 1, archetype scout, faction tank-arena:enemy-faction, spawnEveryTicks 1, total 1.

This layout is deliberate: a victory replay fires right on Tick 0 to remove the brick and down on Tick 1 to destroy the scout; a no-input run lets the scout destroy the base. Preserve the project name Tank Arena and use entryWorld tank-arena:level-01.`,
  );
  const terminal = await terminalPromise;
  assert.equal(
    terminal.activeTurn?.status,
    'completed',
    terminal.activeTurn?.error ?? terminal.error ?? undefined,
  );
  assert.equal(readFileSync(scenePath, 'utf8'), sourceBefore);
  const proposed = changes.list().find((change) => !knownIds.has(change.id));
  assert(
    proposed,
    terminal.activeTurn?.text ?? 'Codex created no P11 ChangeSet',
  );
  assert.equal(proposed.status, 'awaitingApproval');
  assert(proposed.files.some((file) => file.path === 'scenes/main.game.json'));

  changes.approve(proposed.id);
  changes.apply(proposed.id);
  const sourceAfter = readFileSync(scenePath, 'utf8');
  assert.match(sourceAfter, /"game:tank"/u);
  assert.match(sourceAfter, /"game:wave-spawner"/u);
  assert.match(sourceAfter, /"game:base"/u);
  assert.match(sourceAfter, /"game:terrain"/u);
  assert.equal(changes.test(proposed.id).status, 'tested');
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
