import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  KernelControlService,
  type ChangeSet,
  type JsonValue,
} from '../examples/tank-legacy-regression/studio-server/kernel-control-service.ts';
import { resolveBuildEnvironment } from './msvc-environment.mjs';

const repository = process.cwd();
const environment = resolveBuildEnvironment();
assert(environment, 'Visual Studio C++ Build Tools are required on Windows');

function kernelctl(...args: string[]) {
  const process = spawnSync(
    'cargo',
    ['run', '--quiet', '-p', 'ai-game-kernel-cli', '--', ...args],
    {
      cwd: repository,
      encoding: 'utf8',
      env: environment as NodeJS.ProcessEnv,
      timeout: 120_000,
    },
  );
  assert.equal(process.status, 0, process.stderr || process.error?.message);
  return JSON.parse(process.stdout) as Record<string, JsonValue>;
}

const project = 'examples/tank-legacy-regression/examples/frontier.game.json';
const input =
  'examples/tank-legacy-regression/fixtures/replay/frontier.input.json';
assert.equal(kernelctl('validate', project).ok, true);

const run = kernelctl('run', project, input).result as Record<
  string,
  JsonValue
>;
const snapshot = run.snapshot as Record<string, JsonValue>;
const outcome = snapshot.outcome as Record<string, JsonValue>;
assert.equal(outcome.status, 'won');
assert.equal(outcome.faction, 'demo:player');
assert.equal(outcome.tick, 14);
assert.equal(
  snapshot.stateHash,
  readFileSync(
    'examples/tank-legacy-regression/fixtures/replay/frontier.golden.sha256',
    'utf8',
  ).trim(),
);

const eventTypes = new Set(
  (run.events as Array<Record<string, JsonValue>>).map(
    (entry) => (entry.event as Record<string, JsonValue>).type,
  ),
);
for (const eventType of [
  'unit-merged',
  'unit-defeated',
  'site-captured',
  'resource-produced',
  'unit-upgraded',
  'victory-achieved',
]) {
  assert(eventTypes.has(eventType), `vertical slice did not emit ${eventType}`);
}

const batch = kernelctl('batch', project, input, '100').batch as Record<
  string,
  JsonValue
>;
assert.equal(batch.runs, 100);
assert.equal(batch.wins, 100);
assert.equal(batch.losses, 0);
assert.equal(batch.incomplete, 0);
assert.equal(batch.victoryTickMin, 14);
assert.equal(batch.victoryTickMax, 14);

const temporary = mkdtempSync(join(tmpdir(), 'ai-game-kernel-p6-'));
try {
  cpSync(join(repository, project), join(temporary, 'frontier.game.json'));
  cpSync(join(repository, input), join(temporary, 'frontier.input.json'));
  const original = readFileSync(join(temporary, 'frontier.game.json'), 'utf8');
  const control = new KernelControlService({
    workspaceRoot: temporary,
    kernelRoot: repository,
  });
  const change = (await control.dispatch('change.plan', {
    projectPath: 'frontier.game.json',
    summary: '新增资源中转站并调整工厂产出',
    operations: [
      {
        op: 'replace',
        path: '/worlds/0/entities/6/components/3/amountPerCycle',
        value: 3,
      },
      {
        op: 'add',
        path: '/worlds/0/entities/-',
        value: {
          id: 'demo:frontier-campaign/supply-depot',
          name: 'Supply Depot',
          components: [
            { type: 'core:transform', position: { x: 14, y: 2 } },
            { type: 'game:capture-site', requiredStrength: 22 },
            { type: 'game:strategic-site', kind: 'granary' },
            {
              type: 'game:producer',
              resource: 'grain',
              amountPerCycle: 1,
              cycleTicks: 3,
            },
          ],
        },
      },
    ],
  })) as ChangeSet;
  assert.equal(change.status, 'planned');
  assert.equal(
    (
      (await control.dispatch('change.validate', {
        changeId: change.id,
      })) as Record<string, JsonValue>
    ).ok,
    true,
  );
  const grant = (await control.dispatch('change.approve', {
    changeId: change.id,
  })) as { token: string };
  const applied = (await control.dispatch('change.apply', {
    changeId: change.id,
    approvalToken: grant.token,
  })) as ChangeSet;
  assert.equal(applied.status, 'applied');
  assert.equal(
    await control.dispatch('project.query', {
      projectPath: 'frontier.game.json',
      pointer: '/worlds/0/entities/6/components/3/amountPerCycle',
    }),
    3,
  );
  assert.equal(
    await control.dispatch('project.query', {
      projectPath: 'frontier.game.json',
      pointer: '/worlds/0/entities/8/id',
    }),
    'demo:frontier-campaign/supply-depot',
  );
  const changedRun = (await control.dispatch('simulation.run', {
    projectPath: 'frontier.game.json',
    inputPath: 'frontier.input.json',
  })) as Record<string, JsonValue>;
  assert.equal(
    (
      (
        (changedRun.result as Record<string, JsonValue>).snapshot as Record<
          string,
          JsonValue
        >
      ).outcome as Record<string, JsonValue>
    ).status,
    'won',
  );
  await control.dispatch('change.rollback', { changeId: change.id });
  assert.equal(
    readFileSync(join(temporary, 'frontier.game.json'), 'utf8'),
    original,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(
  `[P6] finishable campaign, approved resource-site edit, generated replay test, and ${batch.runs}-seed balance gate passed`,
);
