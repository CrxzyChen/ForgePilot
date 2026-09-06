import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AiChangeCoordinator,
  type ChangePlanner,
} from '../examples/tank-legacy-regression/studio-server/ai-change-coordinator.ts';
import { CodexAppServerClient } from '../studio/server/codex-app-server-client.ts';
import { handleControlRequest } from '../examples/tank-legacy-regression/studio-server/json-rpc-control-server.ts';
import {
  ControlError,
  KernelControlService,
  type ChangeSet,
  type JsonValue,
} from '../examples/tank-legacy-regression/studio-server/kernel-control-service.ts';

const repository = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-kernel-p4-'));

const planner: ChangePlanner = {
  async plan(context) {
    assert.equal(context.request, '将粮仓每周期粮食产量从 2 调整为 3');
    assert.equal(context.projectPath, 'frontier.game.json');
    assert.equal(typeof context.projectSchema, 'object');
    return {
      summary: '将粮仓每周期粮食产量调整为 3',
      operations: [
        {
          op: 'replace',
          path: '/worlds/0/entities/1/components/2/amountPerCycle',
          value: 3,
        },
      ],
      expectedEffects: ['粮仓每次生产周期增加 3 单位粮食'],
    };
  },
};

async function expectControlError(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert(error instanceof ControlError);
    assert.equal(error.code, code);
    return true;
  });
}

try {
  cpSync(
    join(
      repository,
      'examples/tank-legacy-regression/examples/minimal.game.json',
    ),
    join(temporary, 'frontier.game.json'),
  );
  cpSync(
    join(
      repository,
      'examples/tank-legacy-regression/fixtures/replay/movement.input.json',
    ),
    join(temporary, 'movement.input.json'),
  );
  const original = readFileSync(join(temporary, 'frontier.game.json'), 'utf8');

  const appServer = new CodexAppServerClient({
    cwd: repository,
    requestTimeoutMs: 20_000,
  });
  const handshake = await appServer.connect();
  assert.ok(handshake.userAgent.length > 0);
  await appServer.close();

  const control = new KernelControlService({
    workspaceRoot: temporary,
    kernelRoot: repository,
  });
  const coordinator = new AiChangeCoordinator(control, planner);
  const change = await coordinator.requestChange(
    '将粮仓每周期粮食产量从 2 调整为 3',
    'frontier.game.json',
  );
  assert.equal(change.status, 'planned');
  assert.equal(change.approvalRequired, true);
  assert.equal(change.preview[0]?.before, 2);
  assert.equal(change.preview[0]?.after, 3);
  assert.equal(
    readFileSync(join(temporary, 'frontier.game.json'), 'utf8'),
    original,
    'planning must not mutate files',
  );

  const validation = (await control.dispatch('change.validate', {
    changeId: change.id,
  })) as Record<string, JsonValue>;
  assert.equal(validation.ok, true);
  await expectControlError(
    () =>
      control.dispatch('change.apply', {
        changeId: change.id,
        approvalToken: 'not-a-human-grant',
      }),
    'CONTROL_APPROVAL_REQUIRED',
  );

  const grant = (await control.dispatch('change.approve', {
    changeId: change.id,
  })) as { changeId: string; token: string };
  const applied = (await control.dispatch('change.apply', {
    changeId: change.id,
    approvalToken: grant.token,
  })) as ChangeSet;
  assert.equal(applied.status, 'applied');
  assert.equal(
    await control.dispatch('project.query', {
      projectPath: 'frontier.game.json',
      pointer: '/worlds/0/entities/1/components/2/amountPerCycle',
    }),
    3,
  );

  const simulation = (await control.dispatch('simulation.run', {
    projectPath: 'frontier.game.json',
    inputPath: 'movement.input.json',
  })) as Record<string, JsonValue>;
  const snapshot = (simulation.result as Record<string, JsonValue>)
    .snapshot as Record<string, JsonValue>;
  const comparison = (await control.dispatch('simulation.compare', {
    projectPath: 'frontier.game.json',
    inputPath: 'movement.input.json',
    expectedHash: snapshot.stateHash,
  })) as Record<string, JsonValue>;
  assert.equal(comparison.equal, true);

  const rolledBack = (await control.dispatch('change.rollback', {
    changeId: change.id,
  })) as ChangeSet;
  assert.equal(rolledBack.status, 'rolledBack');
  assert.equal(
    readFileSync(join(temporary, 'frontier.game.json'), 'utf8'),
    original,
  );

  const invalid = (await control.dispatch('change.plan', {
    projectPath: 'frontier.game.json',
    summary: '制造无效产量以验证自动拒绝',
    operations: [
      {
        op: 'replace',
        path: '/worlds/0/entities/1/components/2/amountPerCycle',
        value: 0,
      },
    ],
  })) as ChangeSet;
  assert.equal(invalid.status, 'invalid');
  assert.equal(
    readFileSync(join(temporary, 'frontier.game.json'), 'utf8'),
    original,
  );

  await expectControlError(
    () =>
      control.dispatch('project.query', {
        projectPath: '../outside.game.json',
      }),
    'CONTROL_SANDBOX_ESCAPE',
  );
  const unknown = await handleControlRequest(control, {
    id: 99,
    method: 'unknown.method',
  });
  assert('error' in unknown);
  assert.equal(unknown.error.code, 'CONTROL_METHOD_NOT_FOUND');

  const audit = (await control.dispatch('audit.list')) as {
    events: Array<Record<string, JsonValue>>;
  };
  assert.ok(audit.events.some((event) => event.action === 'change.apply'));
  assert.ok(audit.events.some((event) => event.action === 'change.rollback'));

  console.log(
    `[P4] Codex ${handshake.userAgent} handshake and approved ChangeSet loop passed`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
