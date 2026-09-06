import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { ProjectError } from '../project/project-types.ts';

export type CompletionRunStatus =
  | 'planned'
  | 'running'
  | 'waiting'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'succeeded'
  | 'failed';

export type CompletionPlanStepStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type CompletionWaitReason =
  | 'provider-approval'
  | 'provider-execution'
  | 'candidate-review'
  | 'changeset-approval'
  | 'runtime'
  | 'test'
  | 'build'
  | 'clarification';

export type CompletionExternalLinkKind =
  | 'toolCalls'
  | 'assetJobs'
  | 'reviewDecisions'
  | 'changeSets'
  | 'runtimeSessions'
  | 'observations'
  | 'tests'
  | 'builds'
  | 'packages';

export type CompletionRunAuthority = {
  capturedAt: string;
  providerApprovalMode: 'per-call' | 'known-budget' | 'pre-authorized';
  candidateSelectionMode: 'human-required' | 'configured-policy';
  changeSetApprovalMode: 'human-required';
  budgetCurrency: string;
  budgetLimit: number;
  policyHash: string;
};

export type CompletionRunBudget = {
  currency: string;
  limit: number;
  estimated: number;
  actual: number;
  committed: number;
  unknownCostJobs: number;
  uniquePaidOperations: number;
  withinLimit: boolean;
};

export type CompletionRunPlanStep = {
  id: string;
  title: string;
  status: CompletionPlanStepStatus;
  attempt: number;
  dependsOn: string[];
  waitReason?: CompletionWaitReason;
  startedAt?: string;
  finishedAt?: string;
  evidenceIds?: string[];
};

export type CompletionRunDiagnostic = {
  code: string;
  category:
    | 'authority'
    | 'configuration'
    | 'provider'
    | 'project-conflict'
    | 'runtime'
    | 'test'
    | 'build'
    | 'internal';
  message: string;
  retryable: boolean;
  relatedId?: string;
};

export type CompletionRun = {
  schemaVersion: '1.0.0';
  runId: string;
  goalId: string;
  projectId: string;
  threadId: string;
  objective: string;
  status: CompletionRunStatus;
  createdAt: string;
  updatedAt: string;
  activePlanStepId: string | null;
  authority: CompletionRunAuthority;
  budget: CompletionRunBudget;
  planSteps: CompletionRunPlanStep[];
  links: Record<CompletionExternalLinkKind, string[]>;
  checkpoint: {
    sequence: number;
    stateHash: string;
    recordedAt: string;
    lastReconciledExternalId?: string;
  };
  terminalReason: CompletionRunDiagnostic | null;
  presentationRemoved: boolean;
};

export type CompletionRunAssetJob = {
  id: string;
  idempotencyKey: string;
  completionRunId?: string | null;
  toolCallId?: string | null;
  status: string;
  estimatedCostCny: number;
  actualCostCny: number | null;
  costEstimateConfigured: boolean;
  approval?: unknown;
  selectedCandidateId?: string | null;
  reviewDecisionId?: string | null;
  importChangeSetId?: string | null;
};

export type CompletionRunExternalState = {
  assetJobs?: CompletionRunAssetJob[];
  changeSets?: Array<{ id: string; status: string }>;
  runtimeSessions?: Array<{ id: string; status: string }>;
  tests?: Array<{ id: string; status: string }>;
  builds?: Array<{ id: string; status: string }>;
  packages?: Array<{ id: string; status: string }>;
};

type CompletionRunStore = {
  schemaVersion: '1.0.0';
  runs: CompletionRun[];
  goalSnapshots?: Record<string, string>;
};

type CompletionRunServiceOptions = {
  projectRoot: string;
};

const terminalStatuses = new Set<CompletionRunStatus>([
  'stopped',
  'succeeded',
  'failed',
]);
const stableIdPattern = /^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_./-]*$/u;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function timestamp(value: number): string {
  const milliseconds = value > 10_000_000_000 ? value : value * 1_000;
  return new Date(milliseconds).toISOString();
}

function links(): CompletionRun['links'] {
  return {
    toolCalls: [],
    assetJobs: [],
    reviewDecisions: [],
    changeSets: [],
    runtimeSessions: [],
    observations: [],
    tests: [],
    builds: [],
    packages: [],
  };
}

function planStatus(
  status: 'pending' | 'inProgress' | 'completed',
): CompletionPlanStepStatus {
  if (status === 'inProgress') return 'running';
  if (status === 'completed') return 'succeeded';
  return 'pending';
}

function runStatus(status: string): CompletionRunStatus {
  if (status === 'complete') return 'succeeded';
  if (status === 'paused' || status === 'usageLimited') return 'paused';
  if (status === 'budgetLimited') return 'paused';
  if (status === 'blocked') return 'waiting';
  return 'running';
}

export class CompletionRunService {
  readonly #root: string;
  readonly #storePath: string;
  readonly #auditPath: string;
  readonly #projectId: string;
  #store: CompletionRunStore;

  constructor(options: CompletionRunServiceOptions) {
    this.#root = resolve(options.projectRoot);
    const localRoot = join(this.#root, '.aigame', 'local', 'completion-runs');
    mkdirSync(localRoot, { recursive: true });
    this.#storePath = join(localRoot, 'runs.json');
    this.#auditPath = join(localRoot, 'audit.jsonl');
    const project = JSON.parse(
      readFileSync(join(this.#root, 'project.aigame.json'), 'utf8'),
    ) as { id?: unknown };
    if (typeof project.id !== 'string' || !project.id.includes(':')) {
      throw new ProjectError(
        'COMPLETION_RUN_PROJECT_INVALID',
        '项目缺少稳定 Project ID，无法建立 Completion Run。',
      );
    }
    this.#projectId = project.id.startsWith('project:')
      ? project.id
      : `project:${project.id.replace(':', '/')}`;
    try {
      this.#store = existsSync(this.#storePath)
        ? (JSON.parse(
            readFileSync(this.#storePath, 'utf8'),
          ) as CompletionRunStore)
        : { schemaVersion: '1.0.0', runs: [] };
    } catch (error) {
      throw new ProjectError(
        'COMPLETION_RUN_STORE_INVALID',
        `Completion Run 存储无法读取：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (
      this.#store.schemaVersion !== '1.0.0' ||
      !Array.isArray(this.#store.runs)
    ) {
      throw new ProjectError(
        'COMPLETION_RUN_STORE_INVALID',
        'Completion Run 存储版本或结构无效。',
      );
    }
  }

  list(options: { includeRemoved?: boolean } = {}): CompletionRun[] {
    this.#reload();
    return structuredClone(
      this.#store.runs
        .filter((run) => options.includeRemoved || !run.presentationRemoved)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
  }

  current(): CompletionRun | null {
    this.#reload();
    const current = this.#store.runs
      .filter((run) => !run.presentationRemoved)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .find((run) => !terminalStatuses.has(run.status));
    return current ? structuredClone(current) : null;
  }

  latestForThread(threadId: string): CompletionRun | null {
    this.#reload();
    const latest = this.#store.runs
      .filter((run) => run.threadId === threadId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return latest ? structuredClone(latest) : null;
  }

  read(runId: string): CompletionRun {
    this.#reload();
    return structuredClone(this.#run(runId));
  }

  syncGoal(input: {
    threadId: string;
    objective: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    plan: Array<{
      step: string;
      status: 'pending' | 'inProgress' | 'completed';
    }>;
    authority: Omit<CompletionRunAuthority, 'capturedAt' | 'policyHash'>;
  }): CompletionRun {
    this.#reload();
    if (!input.threadId || !input.objective.trim()) {
      throw new ProjectError(
        'COMPLETION_RUN_GOAL_INVALID',
        'Completion Run 需要 Codex thread 和 Goal objective。',
      );
    }
    const createdAt = timestamp(input.createdAt);
    const goalKey = hash(`${input.threadId}:${createdAt}`).slice(0, 24);
    const runId = `completion-run:${goalKey}`;
    const now = timestamp(input.updatedAt);
    const policyMaterial = {
      ...input.authority,
      budgetLimit: Math.max(0, Number(input.authority.budgetLimit) || 0),
    };
    const authority: CompletionRunAuthority = {
      ...policyMaterial,
      capturedAt: now,
      changeSetApprovalMode: 'human-required',
      policyHash: hash(JSON.stringify(canonical(policyMaterial))),
    };
    let run = this.#store.runs.find((candidate) => candidate.runId === runId);
    // Token usage changes updatedAt on every stream update. Persist only the
    // source goal's semantic state, separately from derived external waits.
    const sourceSignature = hash(
      JSON.stringify(
        canonical({
          objective: input.objective.trim(),
          status: input.status,
          plan: input.plan,
          policy: policyMaterial,
        }),
      ),
    );
    if (run && this.#store.goalSnapshots?.[runId] === sourceSignature) {
      return structuredClone(run);
    }
    if (!run) {
      run = {
        schemaVersion: '1.0.0',
        runId,
        goalId: `goal:${goalKey}`,
        projectId: this.#projectId,
        threadId: input.threadId,
        objective: input.objective.trim(),
        status: runStatus(input.status),
        createdAt,
        updatedAt: now,
        activePlanStepId: null,
        authority,
        budget: {
          currency: authority.budgetCurrency,
          limit: authority.budgetLimit,
          estimated: 0,
          actual: 0,
          committed: 0,
          unknownCostJobs: 0,
          uniquePaidOperations: 0,
          withinLimit: true,
        },
        planSteps: [],
        links: links(),
        checkpoint: {
          sequence: 0,
          stateHash: '0'.repeat(64),
          recordedAt: now,
        },
        terminalReason: null,
        presentationRemoved: false,
      };
      this.#store.runs.push(run);
      this.#audit('completion-run.created', run, {});
    }
    run.objective = input.objective.trim();
    run.status = runStatus(input.status);
    run.updatedAt = now;
    if (run.authority.policyHash !== authority.policyHash)
      run.authority = authority;
    run.presentationRemoved = false;
    const previousPlanSteps = run.planSteps;
    const nextPlanSteps: CompletionRunPlanStep[] = [];
    for (const [index, step] of input.plan.entries()) {
      const previous = previousPlanSteps[index];
      const status = planStatus(step.status);
      const startedAt =
        status !== 'pending'
          ? (previous?.startedAt ?? now)
          : previous?.startedAt;
      const next: CompletionRunPlanStep = {
        id:
          previous?.id ??
          `plan-step:${hash(`${runId}:${index}:${step.step}`).slice(0, 24)}`,
        title: step.step.trim().slice(0, 240),
        status,
        attempt:
          previous &&
          ['failed', 'cancelled'].includes(previous.status) &&
          status === 'running'
            ? previous.attempt + 1
            : Math.max(previous?.attempt ?? 0, status === 'running' ? 1 : 0),
        dependsOn: index > 0 ? [nextPlanSteps[index - 1]!.id] : [],
        ...(startedAt ? { startedAt } : {}),
        ...(status === 'succeeded'
          ? { finishedAt: previous?.finishedAt ?? now }
          : {}),
        ...(previous?.evidenceIds?.length
          ? { evidenceIds: previous.evidenceIds }
          : {}),
      };
      nextPlanSteps.push(next);
    }
    run.planSteps = nextPlanSteps;
    run.activePlanStepId =
      run.planSteps.find((step) => step.status === 'running')?.id ??
      run.planSteps.find((step) => step.status === 'pending')?.id ??
      null;
    if (input.status === 'blocked' && run.activePlanStepId) {
      const active = run.planSteps.find(
        (step) => step.id === run!.activePlanStepId,
      );
      if (active) {
        active.status = 'waiting';
        active.waitReason = 'clarification';
      }
    }
    if (input.status === 'budgetLimited') {
      run.terminalReason = {
        code: 'COMPLETION_RUN_BUDGET_LIMITED',
        category: 'authority',
        message: 'Codex Goal 已因预算限制暂停。',
        retryable: true,
      };
    }
    this.#store.goalSnapshots ??= {};
    this.#store.goalSnapshots[runId] = sourceSignature;
    this.#checkpoint(run);
    this.#audit('completion-run.goal-synchronized', run, {
      sourceStatus: input.status,
      planSteps: run.planSteps.length,
    });
    this.#save();
    return structuredClone(run);
  }

  context(): { completionRunId: string; planStepId: string | null } | null {
    const run = this.current();
    return run
      ? { completionRunId: run.runId, planStepId: run.activePlanStepId }
      : null;
  }

  linkCurrent(kind: CompletionExternalLinkKind, id: string): CompletionRun {
    const current = this.current();
    if (!current) {
      throw new ProjectError(
        'COMPLETION_RUN_NOT_ACTIVE',
        '当前没有可关联外部工作的 Completion Run。',
      );
    }
    return this.link(current.runId, kind, id);
  }

  link(
    runId: string,
    kind: CompletionExternalLinkKind,
    id: string,
  ): CompletionRun {
    if (!stableIdPattern.test(id)) {
      throw new ProjectError(
        'COMPLETION_RUN_LINK_INVALID',
        `外部关联缺少稳定语义 ID：${id}`,
      );
    }
    this.#reload();
    const run = this.#run(runId);
    if (run.links[kind].includes(id)) return structuredClone(run);
    run.links[kind].push(id);
    run.updatedAt = new Date().toISOString();
    this.#checkpoint(run, id);
    this.#audit('completion-run.linked', run, { kind, externalId: id });
    this.#save();
    return structuredClone(run);
  }

  reconcile(
    runId: string,
    external: CompletionRunExternalState,
  ): CompletionRun {
    this.#reload();
    const run = this.#run(runId);
    const before = JSON.stringify(canonical(run));
    const jobs = (external.assetJobs ?? []).filter(
      (job) =>
        job.completionRunId === runId || run.links.assetJobs.includes(job.id),
    );
    const operationOwners = new Map<string, string>();
    for (const job of jobs) {
      const owner = operationOwners.get(job.idempotencyKey);
      if (owner && owner !== job.id) {
        throw new ProjectError(
          'COMPLETION_RUN_DUPLICATE_SIDE_EFFECT',
          `同一供应商幂等键关联到多个 Job：${job.idempotencyKey}`,
        );
      }
      operationOwners.set(job.idempotencyKey, job.id);
      if (!run.links.assetJobs.includes(job.id))
        run.links.assetJobs.push(job.id);
      if (job.toolCallId && !run.links.toolCalls.includes(job.toolCallId)) {
        run.links.toolCalls.push(job.toolCallId);
      }
      if (
        job.reviewDecisionId &&
        !run.links.reviewDecisions.includes(job.reviewDecisionId)
      ) {
        run.links.reviewDecisions.push(job.reviewDecisionId);
      }
      if (
        job.importChangeSetId &&
        !run.links.changeSets.includes(job.importChangeSetId)
      ) {
        run.links.changeSets.push(job.importChangeSetId);
      }
    }
    const estimated = jobs.reduce(
      (total, job) => total + Math.max(0, job.estimatedCostCny || 0),
      0,
    );
    const actual = jobs.reduce(
      (total, job) => total + Math.max(0, job.actualCostCny ?? 0),
      0,
    );
    const committed = jobs.reduce((total, job) => {
      if (job.actualCostCny !== null)
        return total + Math.max(0, job.actualCostCny);
      return job.approval
        ? total + Math.max(0, job.estimatedCostCny || 0)
        : total;
    }, 0);
    run.budget = {
      currency: run.authority.budgetCurrency,
      limit: run.authority.budgetLimit,
      estimated: Number(estimated.toFixed(4)),
      actual: Number(actual.toFixed(4)),
      committed: Number(committed.toFixed(4)),
      unknownCostJobs: jobs.filter((job) => !job.costEstimateConfigured).length,
      uniquePaidOperations: operationOwners.size,
      withinLimit:
        run.authority.budgetLimit === 0 ||
        committed <= run.authority.budgetLimit,
    };

    const changeSets = (external.changeSets ?? []).filter((changeSet) =>
      run.links.changeSets.includes(changeSet.id),
    );
    const waiting = this.#waitingState(jobs, changeSets, external);
    if (!terminalStatuses.has(run.status)) {
      if (!run.budget.withinLimit) {
        run.status = 'paused';
        run.terminalReason = {
          code: 'COMPLETION_RUN_BUDGET_EXCEEDED',
          category: 'authority',
          message: `已承诺成本 ${run.budget.committed} ${run.budget.currency} 超过运行预算 ${run.budget.limit}。`,
          retryable: true,
        };
      } else if (waiting) {
        run.status = 'waiting';
        const active = run.planSteps.find(
          (step) => step.id === run.activePlanStepId,
        );
        if (active) {
          active.status = 'waiting';
          active.waitReason = waiting.reason;
          active.evidenceIds = Array.from(
            new Set([...(active.evidenceIds ?? []), waiting.id]),
          );
        }
      } else if (run.status === 'waiting') {
        run.status = 'running';
        const active = run.planSteps.find(
          (step) => step.id === run.activePlanStepId,
        );
        if (active?.status === 'waiting') {
          active.status = 'running';
          delete active.waitReason;
        }
      }
    }
    const lastId = waiting?.id ?? jobs.at(-1)?.id;
    if (
      JSON.stringify(canonical(run)) === before &&
      (!lastId || lastId === run.checkpoint.lastReconciledExternalId)
    ) {
      return structuredClone(run);
    }
    run.updatedAt = new Date().toISOString();
    this.#checkpoint(run, lastId);
    this.#audit('completion-run.reconciled', run, {
      assetJobs: jobs.length,
      uniquePaidOperations: operationOwners.size,
      waiting: waiting?.reason ?? null,
    });
    this.#save();
    return structuredClone(run);
  }

  stop(runId: string): CompletionRun {
    this.#reload();
    const run = this.#run(runId);
    if (!terminalStatuses.has(run.status)) {
      run.status = 'stopped';
      for (const step of run.planSteps) {
        if (step.status === 'running' || step.status === 'waiting') {
          step.status = 'cancelled';
          step.finishedAt = new Date().toISOString();
        }
      }
      run.activePlanStepId = null;
      run.updatedAt = new Date().toISOString();
      run.terminalReason = {
        code: 'COMPLETION_RUN_STOPPED_BY_HUMAN',
        category: 'authority',
        message:
          '人类停止了 Goal；外部作业、成本、审计和已应用项目修改均保留。',
        retryable: false,
      };
      this.#checkpoint(run);
      this.#audit('completion-run.stopped', run, {});
      this.#save();
    }
    return structuredClone(run);
  }

  removePresentation(runId: string): CompletionRun {
    this.#reload();
    const run = this.#run(runId);
    if (!terminalStatuses.has(run.status)) {
      throw new ProjectError(
        'COMPLETION_RUN_NOT_TERMINAL',
        '只能从界面移除已停止、成功或失败的 Goal。',
      );
    }
    run.presentationRemoved = true;
    run.updatedAt = new Date().toISOString();
    this.#checkpoint(run);
    this.#audit('completion-run.presentation-removed', run, {});
    this.#save();
    return structuredClone(run);
  }

  #waitingState(
    jobs: CompletionRunAssetJob[],
    changeSets: Array<{ id: string; status: string }>,
    external: CompletionRunExternalState,
  ): { reason: CompletionWaitReason; id: string } | null {
    const approval = jobs.find((job) => job.status === 'awaitingApproval');
    if (approval) return { reason: 'provider-approval', id: approval.id };
    const provider = jobs.find((job) =>
      ['queued', 'running'].includes(job.status),
    );
    if (provider) return { reason: 'provider-execution', id: provider.id };
    const review = jobs.find((job) => job.status === 'awaitingReview');
    if (review) return { reason: 'candidate-review', id: review.id };
    const change = changeSets.find(
      (item) => item.status === 'awaitingApproval',
    );
    if (change) return { reason: 'changeset-approval', id: change.id };
    const runtime = external.runtimeSessions?.find((item) =>
      ['starting', 'playing', 'paused', 'failed'].includes(item.status),
    );
    if (runtime) return { reason: 'runtime', id: runtime.id };
    const test = external.tests?.find((item) =>
      ['queued', 'running', 'failed'].includes(item.status),
    );
    if (test) return { reason: 'test', id: test.id };
    const build = external.builds?.find((item) =>
      ['queued', 'running', 'failed'].includes(item.status),
    );
    if (build) return { reason: 'build', id: build.id };
    return null;
  }

  #run(runId: string): CompletionRun {
    const run = this.#store.runs.find((candidate) => candidate.runId === runId);
    if (!run) {
      throw new ProjectError(
        'COMPLETION_RUN_NOT_FOUND',
        `Completion Run 不存在：${runId}`,
      );
    }
    return run;
  }

  #reload(): void {
    if (!existsSync(this.#storePath)) return;
    try {
      const store = JSON.parse(
        readFileSync(this.#storePath, 'utf8'),
      ) as CompletionRunStore;
      if (store.schemaVersion !== '1.0.0' || !Array.isArray(store.runs)) {
        throw new Error('unsupported store shape');
      }
      this.#store = store;
    } catch (error) {
      throw new ProjectError(
        'COMPLETION_RUN_STORE_INVALID',
        `Completion Run 存储无法重新读取：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  #checkpoint(run: CompletionRun, lastExternalId?: string): void {
    const sequence = run.checkpoint.sequence + 1;
    const payload = structuredClone(run) as CompletionRun;
    payload.checkpoint = {
      sequence,
      stateHash: '0'.repeat(64),
      recordedAt: run.updatedAt,
      ...(lastExternalId ? { lastReconciledExternalId: lastExternalId } : {}),
    };
    run.checkpoint = {
      sequence,
      stateHash: hash(JSON.stringify(canonical(payload))),
      recordedAt: run.updatedAt,
      ...(lastExternalId ? { lastReconciledExternalId: lastExternalId } : {}),
    };
  }

  #audit(
    event: string,
    run: CompletionRun,
    details: Record<string, unknown>,
  ): void {
    appendFileSync(
      this.#auditPath,
      `${JSON.stringify({
        event,
        runId: run.runId,
        goalId: run.goalId,
        projectId: run.projectId,
        at: new Date().toISOString(),
        checkpointSequence: run.checkpoint.sequence,
        details,
      })}\n`,
      'utf8',
    );
  }

  #save(): void {
    const temporary = `${this.#storePath}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify(this.#store, null, 2)}\n`,
      'utf8',
    );
    renameSync(temporary, this.#storePath);
  }
}
