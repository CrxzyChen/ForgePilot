import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { CoalescedUpdate } from '../studio/electron/coalesced-update.ts';
import {
  externalProjectChange,
  reviewRecordChange,
} from '../studio/electron/project-watch-filter.ts';

import {
  deriveStudioPlanFromText,
  StudioAgentMessageStream,
  CodexProcessManager,
} from '../studio/electron/codex-process-manager.ts';
import { CodexAppServerClient } from '../studio/server/codex-app-server-client.ts';
import { CompletionRunService } from '../studio/workspace/completion-run-service.ts';
import { copilotPlanPresentation } from '../studio/electron/renderer/copilot-plan-presentation.ts';
import type { CodexStudioState } from '../studio/electron/codex-process-manager.ts';

const planState = {
  status: 'ready',
  threadId: 'plan-fixture',
  goal: null,
  completionRun: null,
  pendingApprovals: [],
  goalPlan: [{ step: 'Complete acceptance', status: 'pending' }],
  activeTurn: {
    id: 'turn-fixture',
    mode: 'agent',
    status: 'completed',
    plan: [],
    prompt: '',
    text: '',
    activities: [],
    diff: '',
    usage: null,
    error: null,
  },
} satisfies Parameters<typeof copilotPlanPresentation>[0];
assert.equal(
  copilotPlanPresentation(planState).status,
  'pending',
  'finished turn does not complete retained plan',
);
assert.equal(
  copilotPlanPresentation({
    ...planState,
    activeTurn: { ...planState.activeTurn, status: 'interrupted' },
  }).status,
  'paused',
);
assert.equal(
  copilotPlanPresentation({
    ...planState,
    activeTurn: { ...planState.activeTurn, status: 'inProgress' },
  }).status,
  'running',
);
assert.equal(
  copilotPlanPresentation({
    ...planState,
    activeTurn: { ...planState.activeTurn, mode: 'ask', status: 'inProgress' },
  }).status,
  'pending',
  'unrelated Ask turn is not plan execution',
);
const finishedPlan = {
  ...planState,
  goalPlan: [{ step: 'Complete acceptance', status: 'completed' as const }],
};
assert.equal(copilotPlanPresentation(finishedPlan).label, '步骤已完成');
const inconsistentGoal = {
  threadId: 'plan-fixture',
  status: 'complete',
  objective: 'Goal',
  tokenBudget: null,
  tokensUsed: 0,
  timeUsedSeconds: 0,
  createdAt: 0,
  updatedAt: 0,
} satisfies NonNullable<CodexStudioState['goal']>;
assert.equal(
  copilotPlanPresentation({ ...planState, goal: inconsistentGoal }).status,
  'incomplete',
);
assert.equal(
  copilotPlanPresentation({
    ...planState,
    goal: { ...inconsistentGoal, threadId: 'other-thread', status: 'blocked' },
  }).status,
  'pending',
);
assert.equal(
  copilotPlanPresentation({ ...planState, goalPlan: [] }).status,
  'empty',
);
assert.equal(
  copilotPlanPresentation({
    ...planState,
    goalPlan: [],
    activeTurn: { ...planState.activeTurn, status: 'inProgress' },
  }).status,
  'planning',
);
assert.equal(
  planState.goalPlan[0].status,
  'pending',
  'presentation must not mutate durable plan',
);

assert.deepEqual(
  deriveStudioPlanFromText(
    'STUDIO_PLAN\n- [pending] 完成验收并生成报告\n- [in_progress] Fix completed-state rendering\n',
  ),
  [
    { step: '完成验收并生成报告', status: 'pending' },
    { step: 'Fix completed-state rendering', status: 'inProgress' },
  ],
  'explicit plan state must take precedence over words in the task title',
);
assert.equal(
  deriveStudioPlanFromText(
    'STUDIO_PLAN\n- [pending] Package release\n\nNotes:\n- [completed] Unrelated example\n',
  ).length,
  1,
  'the plan must end before later prose or unrelated lists',
);

const temporary = mkdtempSync(join(tmpdir(), 'aigame-p32-progress-'));
try {
  const reviewRecord =
    '.aigame/local/changes/changeset_12345678-1234-1234-1234-123456789abc.json';
  assert.equal(reviewRecordChange(reviewRecord), true);
  assert.equal(reviewRecordChange(reviewRecord.replaceAll('/', '\\')), true);
  assert.equal(
    externalProjectChange(reviewRecord),
    null,
    'Review updates must never run authoring/Git refresh.',
  );
  for (const ignored of [
    null,
    '.aigame',
    '.aigame/local/changes',
    reviewRecord + '.tmp',
    '.aigame/audit.jsonl',
    'scripts/game.ts',
  ])
    assert.equal(reviewRecordChange(ignored), false);
  for (const internal of [
    null,
    '',
    '.git',
    '.git/index',
    '.git\\index.lock',
    '.aigame',
    '.aigame/local/jobs.json',
  ]) {
    assert.equal(
      externalProjectChange(internal),
      null,
      `internal directory events must not trigger a refresh loop: ${internal}`,
    );
  }
  for (const authored of [
    '.gitignore',
    '.github/workflows/check.yml',
    'scripts/game.ts',
    'assets/imported/enemy.png',
  ]) {
    assert.equal(
      externalProjectChange(authored),
      authored,
      'authoring and similarly prefixed names must remain visible',
    );
  }
  assert.equal(
    externalProjectChange('scenes\\arena.json'),
    'scenes/arena.json',
  );
  let publications = 0;
  let latestState = 0;
  const observedStates: number[] = [];
  const updates = new CoalescedUpdate(() => {
    publications++;
    observedStates.push(latestState);
  }, 5);
  for (let index = 1; index <= 2_000; index++) {
    latestState = index;
    updates.request();
  }
  assert.equal(
    publications,
    0,
    'stream notifications must not block on disk reconciliation',
  );
  await delay(20);
  assert.deepEqual(
    observedStates,
    [2_000],
    'a burst publishes the latest canonical state once',
  );
  latestState = 2_001;
  updates.request();
  await delay(20);
  assert.deepEqual(
    observedStates,
    [2_000, 2_001],
    'later terminal/approval state is not dropped',
  );
  updates.request();
  updates.dispose();
  await delay(20);
  assert.equal(
    publications,
    2,
    'disposed work must not publish into a closed app',
  );
  let refreshAttempts = 0;
  let refreshFailures = 0;
  const recoveredStates: number[] = [];
  const fallibleUpdates = new CoalescedUpdate(
    () => {
      refreshAttempts++;
      if (refreshAttempts === 1)
        throw Object.assign(new Error('Manifest temporarily unavailable'), {
          code: 'ENOENT',
        });
      recoveredStates.push(refreshAttempts);
    },
    5,
    (error) => {
      assert.equal((error as NodeJS.ErrnoException).code, 'ENOENT');
      refreshFailures++;
    },
  );
  fallibleUpdates.request();
  await delay(20);
  assert.equal(
    refreshFailures,
    1,
    'background errors use the nonmodal handler',
  );
  assert.equal(
    refreshAttempts,
    1,
    'failure does not start an unbounded retry loop',
  );
  fallibleUpdates.request();
  await delay(20);
  assert.deepEqual(recoveredStates, [2], 'next state update recovers normally');
  fallibleUpdates.dispose();
  const stream = new StudioAgentMessageStream();
  stream.append('item-plan', 'STUDIO_PLAN\n- [pending] 完成');
  assert.deepEqual(
    stream.snapshot().plan,
    [],
    'partial titles must not become durable plan steps',
  );
  stream.append('item-plan', '验收');
  stream.complete('item-plan', 'STUDIO_PLAN\n- [pending] 完成验收');
  stream.append('item-commentary', 'Skills 已确认，正在检查。');
  assert.deepEqual(stream.snapshot().plan, [
    { step: '完成验收', status: 'pending' },
  ]);
  assert.match(stream.snapshot().text, /完成验收\n\nSkills/u);
  stream.complete('item-update', 'STUDIO_PLAN\n- [completed] 完成验收');
  assert.equal(stream.snapshot().plan[0]?.status, 'completed');
  mkdirSync(join(temporary, '.aigame'), { recursive: true });
  writeFileSync(
    join(temporary, 'project.aigame.json'),
    JSON.stringify({ id: 'project:progress-fixture' }),
  );
  let service = new CompletionRunService({ projectRoot: temporary });
  const input = {
    threadId: 'thread-progress-fixture',
    objective: 'Complete Tank',
    status: 'active',
    createdAt: 1_788_584_000,
    updatedAt: 1_788_584_001,
    plan: [{ step: 'Review resources', status: 'inProgress' as const }],
    authority: {
      providerApprovalMode: 'per-call' as const,
      candidateSelectionMode: 'human-required' as const,
      changeSetApprovalMode: 'human-required' as const,
      budgetCurrency: 'CNY',
      budgetLimit: 1,
    },
  };
  const run = service.syncGoal(input);
  const first = service.reconcile(run.runId, {});
  const storePath = join(temporary, '.aigame/local/completion-runs/runs.json');
  const auditPath = join(
    temporary,
    '.aigame/local/completion-runs/audit.jsonl',
  );
  const stableStore = readFileSync(storePath, 'utf8');
  const stableAudit = readFileSync(auditPath, 'utf8');
  for (let index = 0; index < 100; index++) {
    service.syncGoal({ ...input, updatedAt: input.updatedAt + index });
    service.reconcile(run.runId, {});
  }
  assert.equal(
    readFileSync(storePath, 'utf8'),
    stableStore,
    'token events must not rewrite durable state',
  );
  assert.equal(
    readFileSync(auditPath, 'utf8'),
    stableAudit,
    'no duplicate audit entries on unchanged progress',
  );
  const job = {
    id: 'assetjob:progress',
    idempotencyKey: 'fixture-operation',
    completionRunId: run.runId,
    status: 'awaitingApproval',
    estimatedCostCny: 0.5,
    actualCostCny: null,
    costEstimateConfigured: true,
  };
  const waiting = service.reconcile(run.runId, { assetJobs: [job] });
  assert.equal(waiting.status, 'waiting');
  assert.ok(waiting.checkpoint.sequence > first.checkpoint.sequence);
  service = new CompletionRunService({ projectRoot: temporary });
  const resumed = service.syncGoal({
    ...input,
    updatedAt: input.updatedAt + 500,
  });
  assert.equal(
    resumed.status,
    'waiting',
    'source replay must preserve a persisted external approval wait',
  );
  assert.equal(resumed.planSteps[0]?.attempt, 1);
  assert.equal(
    service.reconcile(run.runId, { assetJobs: [job] }).checkpoint.sequence,
    waiting.checkpoint.sequence,
  );
  const linked = service.link(run.runId, 'assetJobs', job.id);
  assert.equal(
    linked.checkpoint.sequence,
    waiting.checkpoint.sequence,
    're-linking is idempotent',
  );
  const released = service.reconcile(run.runId, {
    assetJobs: [{ ...job, status: 'cancelled' }],
  });
  assert.equal(released.status, 'running');
  assert.equal(released.planSteps[0]?.attempt, 1);
  const paused = service.syncGoal({ ...input, status: 'paused' });
  assert.equal(paused.status, 'paused');
  const clients: CodexAppServerClient[] = [];
  mock.method(
    CodexAppServerClient.prototype,
    'connect',
    function (this: CodexAppServerClient) {
      clients.push(this);
      return Promise.resolve({ userAgent: 'progress-fixture' });
    },
  );
  const thread = { id: input.threadId, turns: [] };
  const goal = {
    ...input,
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
  };
  let startedConfig: Record<string, unknown> | undefined;
  const historyRequests: Record<string, unknown>[] = [];
  let rejectOlderPage = false;
  const historyTurn = (id: string, startedAt: number, text: string) => ({
    id,
    startedAt,
    status: 'completed',
    itemsView: 'summary',
    error: null,
    items: [{ type: 'agentMessage', id: `${id}-message`, text }],
  });
  mock.method(
    CodexAppServerClient.prototype,
    'request',
    async function (
      this: CodexAppServerClient,
      method: string,
      params?: Record<string, unknown>,
    ) {
      if (method === 'thread/start')
        startedConfig = params?.config as Record<string, unknown>;
      if (method === 'thread/read') {
        assert.notEqual(
          params?.includeTurns,
          true,
          'never hydrate full tool history',
        );
      }
      if (method === 'thread/turns/list') {
        historyRequests.push(params ?? {});
        assert.equal(params?.limit, 20);
        assert.equal(params?.itemsView, 'summary');
        if (params?.cursor && rejectOlderPage)
          throw new Error('page unavailable');
        return params?.cursor
          ? {
              data: [
                historyTurn('turn-recent', 2, 'stale duplicate'),
                historyTurn('turn-older', 1, 'older message'),
              ],
              nextCursor: null,
            }
          : {
              data: [
                historyTurn(
                  'turn-recent',
                  2,
                  'STUDIO_PLAN\n- [pending] Latest plan',
                ),
              ],
              nextCursor: 'opaque-older-page',
            };
      }
      if (method === 'account/read')
        return { account: { type: 'apiKey' }, requiresOpenaiAuth: false };
      if (
        method === 'model/list' ||
        method === 'thread/list' ||
        method === 'skills/list' ||
        method === 'mcpServerStatus/list'
      )
        return { data: [] };
      if (method === 'thread/goal/get' || method === 'thread/goal/set')
        return { goal };
      if (method === 'thread/start' || method === 'thread/read')
        return { thread };
      if (method === 'turn/start') {
        this.events.emit('notification', {
          method: 'turn/started',
          params: { threadId: input.threadId, turn: { id: 'turn-first' } },
        });
        this.events.emit('notification', {
          method: 'item/agentMessage/delta',
          params: {
            threadId: input.threadId,
            turnId: 'turn-first',
            itemId: 'early',
            delta: 'Early message',
          },
        });
        return { turn: { id: 'turn-first' } };
      }
      return {};
    },
  );
  const manager = new CodexProcessManager({
    applicationRoot: temporary,
    resolveLaunch: () => ({
      command: process.execPath,
      prefixArguments: [],
      env: process.env,
      packageRoot: temporary,
      toolchainBin: temporary,
      version: 'fixture',
    }),
  });
  try {
    const ready = await manager.start(temporary);
    assert.equal(ready.status, 'ready', ready.error ?? '');
    assert.equal(
      historyRequests.length,
      1,
      'initial hydration requests one bounded page',
    );
    assert.equal(ready.history?.hasMore, true);
    assert.equal(ready.transcript.length, 1);
    rejectOlderPage = true;
    const failedHistory = await manager.loadOlderHistory();
    assert.equal(failedHistory.history?.loading, false);
    assert.equal(
      failedHistory.history?.hasMore,
      true,
      'failed page remains retryable',
    );
    assert.equal(failedHistory.transcript.length, 1);
    rejectOlderPage = false;
    const olderHistory = await manager.loadOlderHistory();
    assert.equal(historyRequests.at(-1)?.cursor, 'opaque-older-page');
    assert.deepEqual(
      olderHistory.transcript.map((entry) => entry.id),
      ['turn-older-message', 'turn-recent-message'],
    );
    assert.equal(
      olderHistory.transcript[1].text,
      'STUDIO_PLAN\n- [pending] Latest plan',
    );
    assert.equal(olderHistory.history?.hasMore, false);
    assert.equal(olderHistory.goalPlan[0].step, 'Latest plan');
    await manager.loadOlderHistory();
    assert.equal(
      historyRequests.length,
      3,
      'no request once pagination is exhausted',
    );
    const engine = (
      startedConfig?.mcp_servers as Record<string, Record<string, unknown>>
    )?.['ai-game-engine'];
    assert.deepEqual(
      engine?.tools,
      { 'change.apply': { approval_mode: 'approve' } },
      'Only the engine operation that already requires a separately reviewed ChangeSet may omit the duplicate transport prompt',
    );
    assert.equal(engine?.default_tools_approval_mode, undefined);
    const responses: unknown[] = [];
    mock.method(
      CodexAppServerClient.prototype,
      'respond',
      (id: unknown, result: unknown) => responses.push({ id, result }),
    );
    clients[0].events.emit('serverRequest', {
      id: 'elicitation-fixture',
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: input.threadId,
        turnId: null,
        serverName: 'ai-game-engine',
        mode: 'form',
        message: 'Apply reviewed changeset:fixture only',
        requestedSchema: { type: 'object', properties: {} },
        _meta: null,
      },
    });
    assert.match(
      manager.getState().pendingApprovals[0].reason ?? '',
      /Apply reviewed/u,
      'Do not drop MCP request message',
    );
    manager.decideApproval('elicitation-fixture', 'accept');
    assert.deepEqual(responses.at(-1), {
      id: 'elicitation-fixture',
      result: { action: 'accept', content: {}, _meta: null },
    });
    clients[0].events.emit('serverRequest', {
      id: 'required-form',
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: input.threadId,
        turnId: null,
        serverName: 'other-server',
        mode: 'form',
        message: 'Supply a value',
        requestedSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        _meta: null,
      },
    });
    assert.equal(manager.getState().pendingApprovals[0].canAccept, false);
    assert.throws(
      () => manager.decideApproval('required-form', 'accept'),
      /表单/u,
    );
    manager.decideApproval('required-form', 'decline');
    assert.deepEqual(responses.at(-1), {
      id: 'required-form',
      result: { action: 'decline', content: null, _meta: null },
    });
    clients[0].events.emit('serverRequest', {
      id: 'cleared-form',
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: input.threadId,
        serverName: 'ai-game-engine',
        mode: 'url',
        message: 'Manual flow',
        url: 'https://example.com',
        elicitationId: 'one',
      },
    });
    clients[0].events.emit('notification', {
      method: 'serverRequest/resolved',
      params: { threadId: input.threadId, requestId: 'cleared-form' },
    });
    assert.equal(manager.getState().pendingApprovals.length, 0);
    await manager.startTurn('goal', input.objective);
    assert.equal(
      manager.getState().activeTurn?.text,
      'Early message',
      'RPC response must not discard early deltas',
    );
    const notify = (method: string, params: Record<string, unknown>) => {
      assert.ok(clients[0]);
      clients[0].events.emit('notification', {
        method,
        params: { threadId: input.threadId, ...params },
      });
    };
    notify('turn/started', { turn: { id: 'turn-auto-goal' } });
    notify('item/started', {
      turnId: 'turn-auto-goal',
      item: {
        id: 'tool:live',
        type: 'mcpToolCall',
        server: 'engine',
        tool: 'runtime.capture',
        status: 'inProgress',
      },
    });
    notify('item/mcpToolCall/progress', {
      turnId: 'turn-auto-goal',
      itemId: 'tool:live',
      message: 'frame ready',
    });
    assert.match(
      manager.getState().activeTurn!.feedback!.items[0].detail,
      /frame ready/,
    );
    const feedbackBeforeStale = manager.getState().activeTurn!.feedback;
    notify('item/completed', {
      threadId: 'other-thread',
      turnId: 'turn-auto-goal',
      item: { id: 'tool:live', type: 'mcpToolCall', status: 'failed' },
    });
    notify('item/commandExecution/outputDelta', {
      turnId: 'old-turn',
      itemId: 'tool:live',
      delta: 'stale',
    });
    assert.deepEqual(
      manager.getState().activeTurn!.feedback,
      feedbackBeforeStale,
    );
    notify('item/completed', {
      turnId: 'turn-auto-goal',
      item: {
        id: 'tool:live',
        type: 'mcpToolCall',
        server: 'engine',
        tool: 'runtime.capture',
        status: 'completed',
        result: { secret: 'not-for-ui' },
      },
    });
    assert.equal(
      manager.getState().activeTurn!.feedback!.items[0].status,
      'completed',
    );
    assert(
      !JSON.stringify(manager.getState().activeTurn!.feedback).includes(
        'not-for-ui',
      ),
    );
    const snapshots = mock.method(manager, 'getState');
    let invalidations = 0;
    const onInvalidated = () => {
      invalidations++;
    };
    manager.events.on('invalidated', onInvalidated);
    for (let index = 0; index < 2_000; index++) {
      notify('item/mcpToolCall/progress', {
        turnId: 'turn-auto-goal',
        message: `streamed argument ${index}`,
      });
    }
    assert.ok(invalidations >= 2_000, 'all state changes remain observable');
    assert.equal(
      snapshots.mock.callCount(),
      0,
      'invalidation subscribers must not clone the complete transcript per token',
    );
    manager.events.off('invalidated', onInvalidated);
    let legacySnapshot: ReturnType<typeof manager.getState> | undefined;
    manager.events.once('state', (state) => {
      legacySnapshot = state;
    });
    notify('item/mcpToolCall/progress', {
      turnId: 'turn-auto-goal',
      message: 'legacy subscriber',
    });
    assert.equal(legacySnapshot?.activeTurn?.id, 'turn-auto-goal');
    legacySnapshot!.activeTurn!.text = 'consumer mutation';
    assert.notEqual(manager.getState().activeTurn?.text, 'consumer mutation');
    snapshots.mock.restore();
    assert.equal(manager.getState().activeTurn?.id, 'turn-auto-goal');
    assert.equal(manager.getState().activeTurn?.status, 'inProgress');
    assert.equal(manager.getState().activeTurn?.text, '');
    notify('item/agentMessage/delta', {
      turnId: 'turn-first',
      itemId: 'old',
      delta: 'Stale turn',
    });
    notify('item/agentMessage/delta', {
      threadId: 'other-thread',
      turnId: 'turn-auto-goal',
      itemId: 'other',
      delta: 'Wrong thread',
    });
    assert.equal(
      manager.getState().activeTurn?.text,
      '',
      'ignore stale or cross-thread events',
    );
    notify('item/completed', {
      turnId: 'turn-auto-goal',
      item: {
        id: 'new-plan',
        type: 'agentMessage',
        text: 'STUDIO_PLAN\n- [pending] 完成验收',
      },
    });
    notify('item/agentMessage/delta', {
      turnId: 'turn-auto-goal',
      itemId: 'new-commentary',
      delta: 'Still working',
    });
    assert.deepEqual(manager.getState().activeTurn?.plan, [
      { step: '完成验收', status: 'pending' },
    ]);
    notify('turn/completed', {
      turn: { id: 'turn-auto-goal', status: 'completed' },
    });
    await delay(20);
    assert.deepEqual(
      manager.getState().transcript.map((entry) => entry.id),
      ['turn-older-message', 'turn-recent-message'],
      'completion refresh preserves loaded older pages without duplicate items',
    );
    assert.equal(historyRequests.at(-1)?.cursor, undefined);
  } finally {
    await manager.stop();
    mock.restoreAll();
  }
  console.log(
    'P32 progress synchronization passed: explicit state, bounded plan, idempotent streaming/recovery, external waits.',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
