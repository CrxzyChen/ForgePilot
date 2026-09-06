import type { CodexStudioState } from '../codex-process-manager.ts';

export const copilotTurnStatusLabels: Record<
  NonNullable<CodexStudioState['activeTurn']>['status'],
  string
> = {
  inProgress: '本轮执行中',
  completed: '本轮已结束',
  interrupted: '本轮已中断',
  failed: '本轮失败',
};

export const completionWaitLabels: Record<string, string> = {
  'provider-approval': '等待供应商调用审批',
  'provider-execution': '等待供应商返回',
  'candidate-review': '等待候选资源审核',
  'changeset-approval': '等待 ChangeSet 审批',
  runtime: '等待运行时检查',
  test: '等待测试',
  build: '等待构建',
  clarification: '等待补充方向',
};

type PlanState = Pick<
  CodexStudioState,
  | 'status'
  | 'threadId'
  | 'activeTurn'
  | 'goal'
  | 'goalPlan'
  | 'completionRun'
  | 'pendingApprovals'
>;

/** Presentation only: never promote a finished turn into completed plan/Goal authority. */
export function copilotPlanPresentation(state: PlanState | null | undefined) {
  const turn = state?.activeTurn?.mode !== 'ask' ? state?.activeTurn : null;
  const steps = turn?.plan.length ? turn.plan : (state?.goalPlan ?? []);
  const completed = steps.filter((step) => step.status === 'completed').length;
  const goal = state?.goal?.threadId === state?.threadId ? state?.goal : null;
  const run =
    state?.completionRun?.threadId === state?.threadId
      ? state?.completionRun
      : null;
  const result = (status: string, label: string) => ({
    steps,
    status,
    label,
    description: `${completed} / ${steps.length} 个计划步骤已完成；计划步骤不代表整个 Goal 已验收。`,
    emptyMessage:
      status === 'planning'
        ? 'Codex 正在生成并同步执行计划…'
        : '尚无执行计划。',
  });
  if (steps.length && completed === steps.length)
    return result('completed', '步骤已完成');
  if (
    goal?.status === 'paused' ||
    run?.status === 'paused' ||
    run?.status === 'stopped'
  )
    return result('paused', '已停止');
  if (goal?.status === 'usageLimited') return result('limited', '用量受限');
  if (goal?.status === 'budgetLimited') return result('limited', '预算用尽');
  if (run?.status === 'stopping') return result('paused', '正在停止');
  if (
    state?.status === 'error' ||
    turn?.status === 'failed' ||
    run?.status === 'failed'
  )
    return result('failed', '执行失败');
  if (state?.pendingApprovals.length) return result('waiting', '等待审批');
  if (run?.status === 'waiting') {
    const waitReason = run.planSteps.find(
      (step) => step.id === run.activePlanStepId,
    )?.waitReason;
    return result(
      'waiting',
      completionWaitLabels[waitReason ?? ''] ?? '等待外部结果',
    );
  }
  if (goal?.status === 'blocked') return result('blocked', '受阻');
  if (goal?.status === 'complete' && steps.length)
    return result('incomplete', '计划未完成');
  if (state?.status === 'starting' || state?.status === 'recovering')
    return result('waiting', '正在恢复');
  if (
    turn?.status === 'interrupted' ||
    (state?.status === 'stopped' && steps.length)
  )
    return result('paused', '已停止');
  if (turn?.status === 'inProgress')
    return steps.length
      ? result('running', '执行中')
      : result('planning', '正在规划');
  return steps.length
    ? result('pending', '待继续')
    : result('empty', '暂无计划');
}
