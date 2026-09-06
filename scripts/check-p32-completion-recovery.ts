import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectError } from '../studio/project/project-types.ts';
import { CompletionRunService } from '../studio/workspace/completion-run-service.ts';
import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p32-recovery-'));
const projectRoot = join(temporary, 'project');

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  const authorityPaths = [
    'project.aigame.json',
    'assets/asset-manifest.json',
    'scenes/main.game.json',
  ];
  const authorityBefore = createHash('sha256')
    .update(
      authorityPaths
        .map((path) => readFileSync(join(projectRoot, path)))
        .reduce((all, item) => Buffer.concat([all, item]), Buffer.alloc(0)),
    )
    .digest('hex');

  let runs = new CompletionRunService({ projectRoot });
  const created = runs.syncGoal({
    threadId: 'thread-p32-recovery',
    objective: 'Complete and package Tank Arena through reviewed operations.',
    status: 'active',
    createdAt: 1_788_540_000,
    updatedAt: 1_788_540_001,
    plan: [
      { step: 'Generate and review resources', status: 'inProgress' },
      { step: 'Apply the reviewed ChangeSet', status: 'pending' },
      { step: 'Test and package the game', status: 'pending' },
    ],
    authority: {
      providerApprovalMode: 'known-budget',
      candidateSelectionMode: 'human-required',
      changeSetApprovalMode: 'human-required',
      budgetCurrency: 'CNY',
      budgetLimit: 1,
    },
  });
  assert.match(created.runId, /^completion-run:/u);
  assert.match(created.goalId, /^goal:/u);
  assert.match(created.activePlanStepId ?? '', /^plan-step:/u);
  assert.equal(created.status, 'running');
  assert.deepEqual(created.planSteps[1]?.dependsOn, [created.planSteps[0]?.id]);

  const registry = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
  });
  const broker = new StudioAssetJobBroker({
    projectRoot,
    registry,
    getCompletionContext: () => runs.context(),
    onExternalLink: (runId, kind, id) => runs.link(runId, kind, id),
  });
  const submitted = broker.submit({
    kind: 'image',
    prompt: 'P32 durable recovery fixture',
    outputName: 'p32-fixture.png',
    variants: 1,
  });
  assert.equal(submitted.completionRunId, created.runId);
  assert.equal(submitted.planStepId, created.activePlanStepId);
  assert.match(submitted.toolCallId, /^tool-call:/u);
  assert.equal(submitted.status, 'awaitingApproval');
  assert.deepEqual(runs.read(created.runId).links.assetJobs, [submitted.id]);
  assert.deepEqual(runs.read(created.runId).links.toolCalls, [
    submitted.toolCallId,
  ]);

  runs = new CompletionRunService({ projectRoot });
  const afterRestart = runs.reconcile(created.runId, {
    assetJobs: broker.list(),
  });
  assert.equal(afterRestart.status, 'waiting');
  assert.equal(afterRestart.planSteps[0]?.waitReason, 'provider-approval');
  assert.equal(afterRestart.budget.uniquePaidOperations, 1);

  const runningJob = {
    ...submitted,
    status: 'running',
    approval: {
      approvedBy: 'human' as const,
      policy: 'always' as const,
      approvedAt: new Date().toISOString(),
      estimateCny: 0.4,
      estimateConfigured: true,
      modelId: submitted.modelId,
      parametersSha256: 'a'.repeat(64),
    },
    estimatedCostCny: 0.4,
    costEstimateConfigured: true,
  };
  runs = new CompletionRunService({ projectRoot });
  const providerWait = runs.reconcile(created.runId, {
    assetJobs: [runningJob],
  });
  assert.equal(providerWait.planSteps[0]?.waitReason, 'provider-execution');
  assert.equal(providerWait.budget.committed, 0.4);

  const reviewJob = { ...runningJob, status: 'awaitingReview' };
  runs = new CompletionRunService({ projectRoot });
  const reviewWait = runs.reconcile(created.runId, {
    assetJobs: [reviewJob],
  });
  assert.equal(reviewWait.planSteps[0]?.waitReason, 'candidate-review');

  runs.link(created.runId, 'reviewDecisions', 'review-decision:p32');
  runs.link(created.runId, 'changeSets', 'changeset:p32');
  runs = new CompletionRunService({ projectRoot });
  const changeSetWait = runs.reconcile(created.runId, {
    assetJobs: [{ ...reviewJob, status: 'awaitingImportApproval' }],
    changeSets: [{ id: 'changeset:p32', status: 'awaitingApproval' }],
  });
  assert.equal(changeSetWait.planSteps[0]?.waitReason, 'changeset-approval');

  runs.link(created.runId, 'runtimeSessions', 'session:p32');
  const runtimeWait = runs.reconcile(created.runId, {
    assetJobs: [{ ...reviewJob, status: 'imported', actualCostCny: 0.4 }],
    changeSets: [{ id: 'changeset:p32', status: 'applied' }],
    runtimeSessions: [{ id: 'session:p32', status: 'failed' }],
  });
  assert.equal(runtimeWait.planSteps[0]?.waitReason, 'runtime');
  assert.equal(runtimeWait.budget.actual, 0.4);
  assert.equal(runtimeWait.budget.committed, 0.4);

  runs.link(created.runId, 'tests', 'test-run:p32-failed');
  runs = new CompletionRunService({ projectRoot });
  const testWait = runs.reconcile(created.runId, {
    assetJobs: [{ ...reviewJob, status: 'imported', actualCostCny: 0.4 }],
    changeSets: [{ id: 'changeset:p32', status: 'applied' }],
    tests: [{ id: 'test-run:p32-failed', status: 'failed' }],
  });
  assert.equal(testWait.planSteps[0]?.waitReason, 'test');

  runs.link(created.runId, 'builds', 'build:p32-failed');
  runs = new CompletionRunService({ projectRoot });
  const buildWait = runs.reconcile(created.runId, {
    assetJobs: [{ ...reviewJob, status: 'imported', actualCostCny: 0.4 }],
    changeSets: [{ id: 'changeset:p32', status: 'applied' }],
    builds: [{ id: 'build:p32-failed', status: 'failed' }],
  });
  assert.equal(buildWait.planSteps[0]?.waitReason, 'build');

  for (const status of ['cancelled', 'rejected', 'failed'] as const) {
    runs = new CompletionRunService({ projectRoot });
    const accounting = runs.reconcile(created.runId, {
      assetJobs: [{ ...reviewJob, status }],
    });
    assert.equal(accounting.budget.committed, 0.4);
    assert.equal(accounting.budget.uniquePaidOperations, 1);
  }

  const duplicateOperation = {
    ...reviewJob,
    id: 'asset-job:p32-duplicate',
  };
  assert.throws(
    () =>
      runs.reconcile(created.runId, {
        assetJobs: [reviewJob, duplicateOperation],
      }),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'COMPLETION_RUN_DUPLICATE_SIDE_EFFECT',
  );

  const secondOperation = {
    ...reviewJob,
    id: 'asset-job:p32-second',
    idempotencyKey: 'idem:p32_second',
    toolCallId: 'tool-call:p32/second',
    estimatedCostCny: 0.7,
  };
  const budgetPaused = runs.reconcile(created.runId, {
    assetJobs: [reviewJob, secondOperation],
  });
  assert.equal(budgetPaused.status, 'paused');
  assert.equal(budgetPaused.budget.committed, 1.1);
  assert.equal(budgetPaused.budget.withinLimit, false);
  assert.equal(
    budgetPaused.terminalReason?.code,
    'COMPLETION_RUN_BUDGET_EXCEEDED',
  );

  const stopped = runs.stop(created.runId);
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.links.assetJobs.includes(submitted.id), true);
  assert.equal(stopped.budget.committed, 1.1);
  assert.equal(stopped.presentationRemoved, false);
  const removed = runs.removePresentation(created.runId);
  assert.equal(removed.presentationRemoved, true);
  assert.equal(runs.list().length, 0);
  assert.equal(runs.list({ includeRemoved: true }).length, 1);

  const finalRestart = new CompletionRunService({ projectRoot });
  const persisted = finalRestart.read(created.runId);
  assert.equal(persisted.status, 'stopped');
  assert.equal(persisted.presentationRemoved, true);
  assert.equal(persisted.links.changeSets.includes('changeset:p32'), true);
  assert.equal(persisted.budget.committed, 1.1);
  assert.ok(persisted.checkpoint.sequence >= 10);

  const authorityAfter = createHash('sha256')
    .update(
      authorityPaths
        .map((path) => readFileSync(join(projectRoot, path)))
        .reduce((all, item) => Buffer.concat([all, item]), Buffer.alloc(0)),
    )
    .digest('hex');
  assert.equal(authorityAfter, authorityBefore);
  registry.dispose();

  console.log(
    JSON.stringify(
      {
        gate: 'P32 durable Completion Run recovery',
        restartReconciledBeforeResume: true,
        waits: [
          'provider-approval',
          'provider-execution',
          'candidate-review',
          'changeset-approval',
          'runtime',
          'test',
          'build',
        ],
        stableRelationships: true,
        duplicateSideEffectRejected: true,
        budgetStableAcrossRestart: true,
        stopRetainsEvidence: true,
        removalPresentationOnly: true,
        projectAuthorityMutated: false,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
