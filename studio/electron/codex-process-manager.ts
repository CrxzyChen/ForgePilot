import { EventEmitter } from 'node:events';
import {
  projectActivity,
  reduceFeedback,
  type CopilotFeedback,
  type CopilotActivity,
} from './copilot-activity.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { ServerRequest } from '../../generated/codex-app-server/ServerRequest.ts';
import type { Account } from '../../generated/codex-app-server/v2/Account.ts';
import type { GetAccountResponse } from '../../generated/codex-app-server/v2/GetAccountResponse.ts';
import type { LoginAccountResponse } from '../../generated/codex-app-server/v2/LoginAccountResponse.ts';
import type { Model } from '../../generated/codex-app-server/v2/Model.ts';
import type { Thread } from '../../generated/codex-app-server/v2/Thread.ts';
import type { ThreadGoal } from '../../generated/codex-app-server/v2/ThreadGoal.ts';
import type { ThreadGoalStatus } from '../../generated/codex-app-server/v2/ThreadGoalStatus.ts';
import type { ThreadListResponse } from '../../generated/codex-app-server/v2/ThreadListResponse.ts';
import type { ThreadTurnsListResponse } from '../../generated/codex-app-server/v2/ThreadTurnsListResponse.ts';
import type { Turn } from '../../generated/codex-app-server/v2/Turn.ts';
import type { ThreadGoalGetResponse } from '../../generated/codex-app-server/v2/ThreadGoalGetResponse.ts';
import type { ThreadGoalSetResponse } from '../../generated/codex-app-server/v2/ThreadGoalSetResponse.ts';
import type { ThreadGoalClearResponse } from '../../generated/codex-app-server/v2/ThreadGoalClearResponse.ts';
import type { JsonValue } from '../../generated/codex-app-server/serde_json/JsonValue.ts';
import type { McpServerElicitationRequestParams } from '../../generated/codex-app-server/v2/McpServerElicitationRequestParams.ts';
import { CodexAppServerClient } from '../server/codex-app-server-client.ts';
import {
  resolveBundledCodexSidecar,
  type CodexSidecarLaunch,
} from '../server/codex-sidecar-resolver.ts';
import type { CompletionRun } from '../workspace/completion-run-service.ts';

export type CodexProcessStatus =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'authenticating'
  | 'recovering'
  | 'error';

export type CodexApproval = {
  id: string | number;
  method: ServerRequest['method'];
  reason: string | null;
  itemId: string | null;
  canAccept?: boolean;
  elicitation?: McpServerElicitationRequestParams;
};

export type CodexTurnMode = 'ask' | 'plan' | 'agent' | 'goal';

export type CodexPlanStep = {
  step: string;
  status: 'pending' | 'inProgress' | 'completed';
};

export type CodexTurnState = {
  id: string;
  mode: CodexTurnMode;
  prompt: string;
  status: 'inProgress' | 'completed' | 'interrupted' | 'failed';
  text: string;
  activities: string[];
  feedback?: CopilotFeedback;
  plan: CodexPlanStep[];
  diff: string;
  usage: null | {
    totalTokens: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    modelContextWindow: number | null;
  };
  error: string | null;
};

export type CodexConversationSummary = {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  status: string;
};

export type CodexTranscriptEntry = {
  activity?: CopilotActivity;
  id: string;
  role: 'user' | 'assistant' | 'plan' | 'activity';
  text: string;
  status: string | null;
};

export type CodexStudioState = {
  status: CodexProcessStatus;
  projectRoot: string | null;
  version: string | null;
  account: Account | null;
  requiresOpenaiAuth: boolean;
  threadId: string | null;
  model: string | null;
  models: Array<
    Pick<
      Model,
      | 'id'
      | 'model'
      | 'displayName'
      | 'isDefault'
      | 'supportedReasoningEfforts'
      | 'defaultReasoningEffort'
    >
  >;
  reasoningEffort: string;
  permission: 'read-only' | 'on-request';
  conversations: CodexConversationSummary[];
  transcript: CodexTranscriptEntry[];
  history?: { hasMore: boolean; loading: boolean };
  goal: ThreadGoal | null;
  goalPlan: CodexPlanStep[];
  completionRun: CompletionRun | null;
  mcpServers: Array<{
    name: string;
    status: string | null;
    toolCount: number;
  }>;
  pendingApprovals: CodexApproval[];
  lastEvent: string | null;
  activeTurn: CodexTurnState | null;
  error: string | null;
};

export type CodexProcessManagerOptions = {
  applicationRoot: string;
  runtimeExecutable?: string;
  resolveLaunch?: () => CodexSidecarLaunch;
};

type AssetBrokerConnection = { url: string; token: string };

function initialState(): CodexStudioState {
  return {
    status: 'stopped',
    projectRoot: null,
    version: null,
    account: null,
    requiresOpenaiAuth: false,
    threadId: null,
    model: null,
    models: [],
    reasoningEffort: 'medium',
    permission: 'on-request',
    conversations: [],
    transcript: [],
    goal: null,
    goalPlan: [],
    completionRun: null,
    mcpServers: [],
    pendingApprovals: [],
    lastEvent: null,
    activeTurn: null,
    error: null,
  };
}

function normalizePlanStatus(
  value: string,
  step: string,
): CodexPlanStep['status'] {
  const status = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, '');
  if (
    ['completed', 'complete', 'done', 'finished', '已完成', '完成'].includes(
      status,
    )
  )
    return 'completed';
  if (['inprogress', 'active', 'current', '执行中', '进行中'].includes(status))
    return 'inProgress';
  // Explicit protocol states always win; a task named "完成验收" is not done.
  if (status) return 'pending';
  if (
    /(?:[（(](?:已完成|completed|done)[）)]|[✓✅])\s*(?:→|->)?\s*$/iu.test(step)
  )
    return 'completed';
  if (
    /(?:[（(](?:执行中|进行中|in[\s_-]*progress)[）)]|🚧)\s*(?:→|->)?\s*$/iu.test(
      step,
    )
  )
    return 'inProgress';
  return 'pending';
}

function cleanPlanStep(step: string): string {
  return step
    .replace(/\s*(?:→|->)\s*$/u, '')
    .replace(
      /\s*(?:\((?:已完成|执行中|进行中|待执行)\)|（(?:已完成|执行中|进行中|待执行)）)\s*$/u,
      '',
    )
    .trim()
    .slice(0, 400);
}

function deduplicatePlanSteps(entries: CodexPlanStep[]): CodexPlanStep[] {
  const result: CodexPlanStep[] = [];
  const indexByStep = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.step) continue;
    const existingIndex = indexByStep.get(entry.step);
    if (existingIndex === undefined) {
      indexByStep.set(entry.step, result.length);
      result.push(entry);
    } else {
      // A later repeated plan block is newer and may carry updated statuses.
      result[existingIndex] = entry;
    }
  }
  return result.slice(0, 12);
}

export function deriveStudioPlanFromText(text: string): CodexPlanStep[] {
  const markerMatches = [
    ...text.matchAll(/(?:^|\n)\s*STUDIO_PLAN\s*:?\s*(?:\n|$)/giu),
  ];
  const cueIndex = Math.max(
    text.lastIndexOf('当前持续计划'),
    text.lastIndexOf('当前执行计划'),
    text.lastIndexOf('当前计划'),
  );
  const marker = markerMatches.at(-1);
  if (!marker && cueIndex < 0) return [];
  const remainder = marker
    ? text.slice((marker.index ?? 0) + marker[0].length)
    : text.slice(cueIndex);
  // A marked plan is one contiguous list, not every checkbox later in prose.
  const planLines: string[] = [];
  if (marker) {
    for (const line of remainder.split(/\r?\n/u)) {
      if (!/^\s*(?:[-*]|\d+[.)、])\s+/u.test(line)) break;
      planLines.push(line);
    }
  }
  const segment = marker ? planLines.join('\n') : remainder;
  const checked = [
    ...segment.matchAll(/^\s*(?:[-*]|\d+[.)、])\s*\[([^\]]+)\]\s+(.+?)\s*$/gmu),
  ].map((match) => ({
    step: cleanPlanStep(match[2] ?? ''),
    status: normalizePlanStatus(match[1] ?? '', match[2] ?? ''),
  }));
  if (checked.length > 0) return deduplicatePlanSteps(checked);

  const circled = [
    ...segment.matchAll(/[①②③④⑤⑥⑦⑧⑨⑩]\s*([\s\S]*?)(?=[①②③④⑤⑥⑦⑧⑨⑩]|$)/gu),
  ].map((match) => {
    const raw = (match[1] ?? '').replace(/^\s*(?:→|->)\s*/u, '').trim();
    return {
      step: cleanPlanStep(raw),
      status: normalizePlanStatus('', raw),
    };
  });
  if (circled.length > 0) return deduplicatePlanSteps(circled);

  return deduplicatePlanSteps(
    [...segment.matchAll(/^\s*\d+[.)、]\s+(.+?)\s*$/gmu)]
      .map((match) => {
        const raw = match[1] ?? '';
        return {
          step: cleanPlanStep(raw),
          status: normalizePlanStatus('', raw),
        };
      })
      .filter((entry) => entry.step),
  );
}

export class StudioAgentMessageStream {
  readonly #messages = new Map<string, { text: string; completed: boolean }>();

  append(itemId: string, delta: string): void {
    const previous = this.#messages.get(itemId);
    this.#messages.set(itemId, {
      text: `${previous?.text ?? ''}${delta}`,
      completed: false,
    });
  }

  complete(itemId: string, text: string): void {
    this.#messages.set(itemId, { text, completed: true });
  }

  snapshot(): { text: string; plan: CodexPlanStep[] } {
    const messages = [...this.#messages.values()];
    let plan: CodexPlanStep[] = [];
    for (const message of messages) {
      // Do not checkpoint partially streamed titles on every token.
      const text = message.completed
        ? message.text
        : message.text.slice(0, message.text.lastIndexOf('\n') + 1);
      const candidate = deriveStudioPlanFromText(text);
      if (candidate.length) plan = candidate;
    }
    return { text: messages.map((message) => message.text).join('\n\n'), plan };
  }
}

function initialGoalPlan(): CodexPlanStep[] {
  return [
    { step: '检查项目基线并建立任务计划', status: 'inProgress' },
    { step: '通过 ChangeSet 实现计划内容', status: 'pending' },
    { step: '运行测试、调试并修复问题', status: 'pending' },
    { step: '构建发布包并完成验收', status: 'pending' },
  ];
}

export class CodexProcessManager {
  readonly events = new EventEmitter();
  readonly #options: CodexProcessManagerOptions;
  #client: CodexAppServerClient | null = null;
  #state = initialState();
  #generation = 0;
  #stopping = false;
  #restartAttempted = false;
  #mcpEnabled = true;
  #projectSkillsEnabled = true;
  #assetBrokerConnection: AssetBrokerConnection | null = null;
  #messageStream = new StudioAgentMessageStream();
  #requestedTurn: { mode: CodexTurnMode; prompt: string } | null = null;
  #historyThreadId: string | null = null;
  #historyTurns: Turn[] = [];
  #historyCursor: string | null = null;
  #historyLoaded = false;
  #historyLoadingOlder = false;
  #historyRefresh = 0;

  constructor(options: CodexProcessManagerOptions) {
    this.#options = options;
  }

  getState(): CodexStudioState {
    return structuredClone(this.#state);
  }

  setCompletionRunSnapshot(run: CompletionRun | null): void {
    this.#state = {
      ...this.#state,
      completionRun: run ? structuredClone(run) : null,
    };
  }

  setAssetBrokerConnection(connection: AssetBrokerConnection | null): void {
    this.#assetBrokerConnection = connection ? { ...connection } : null;
  }

  async start(projectRoot: string): Promise<CodexStudioState> {
    await this.stop();
    const generation = ++this.#generation;
    this.#stopping = false;
    this.#restartAttempted = false;
    return this.#startGeneration(projectRoot, generation);
  }

  async loginChatGpt(): Promise<{ loginId: string; authUrl: string }> {
    const client = this.#requireClient();
    this.#patch({ status: 'authenticating', error: null });
    const login = await client.request<LoginAccountResponse>(
      'account/login/start',
      { type: 'chatgpt' },
    );
    if (login.type !== 'chatgpt') {
      throw new Error('Codex App Server 未返回 ChatGPT 登录流程。');
    }
    return { loginId: login.loginId, authUrl: login.authUrl };
  }

  async logout(): Promise<CodexStudioState> {
    const client = this.#requireClient();
    await client.request('account/logout', undefined);
    this.#patch({
      account: null,
      threadId: null,
      status: 'ready',
      conversations: [],
      transcript: [],
      goal: null,
      goalPlan: [],
    });
    return this.getState();
  }

  async startTurn(
    mode: CodexTurnMode,
    prompt: string,
  ): Promise<CodexStudioState> {
    const client = this.#requireClient();
    const threadId = this.#state.threadId;
    if (!threadId || !this.#state.account) {
      throw new Error('请先登录并等待项目 Codex 线程就绪。');
    }
    if (this.#state.activeTurn?.status === 'inProgress') {
      throw new Error('当前已有 Codex turn 正在执行。');
    }
    const trimmed = prompt.trim();
    if (!trimmed || trimmed.length > 20_000) {
      throw new Error('Codex 请求必须为 1–20000 个字符。');
    }
    const modeInstruction =
      mode === 'ask'
        ? 'Ask mode: inspect and explain only. Do not modify files or run mutating tools.'
        : mode === 'plan'
          ? 'Plan mode: inspect the project and produce a concrete plan or ChangeSet proposal. Do not apply project changes.'
          : mode === 'goal'
            ? 'Goal mode: establish and pursue a durable project goal. Maintain a visible plan, use the ai-game-engine MCP tools and project skills, and route every mutation through a human-approved ChangeSet. If a structured plan tool is unavailable, include and keep updated a STUDIO_PLAN block in your response with one line per step formatted exactly as `- [completed|in_progress|pending] step` so Studio can display execution state.'
            : 'Agent mode: use the ai-game-engine MCP tools and project skills. Every mutation must be proposed as a ChangeSet and wait for human approval; do not write project files directly.';
    if (mode === 'goal') {
      if (!this.#state.goal) {
        const response = await client.request<ThreadGoalSetResponse>(
          'thread/goal/set',
          { threadId, objective: trimmed, status: 'active' },
        );
        this.#patch({ goal: response.goal, goalPlan: initialGoalPlan() });
      } else if (
        this.#state.goal.status !== 'active' &&
        this.#state.goal.status !== 'complete'
      ) {
        const response = await client.request<ThreadGoalSetResponse>(
          'thread/goal/set',
          { threadId, status: 'active' },
        );
        this.#patch({ goal: response.goal });
      }
    }
    this.#messageStream = new StudioAgentMessageStream();
    this.#requestedTurn = { mode, prompt: trimmed };
    let response;
    try {
      response = await client.startTurn(
        threadId,
        `${modeInstruction}\n\nDeveloper request:\n${trimmed}`,
        {
          approvalPolicy:
            (mode === 'agent' || mode === 'goal') &&
            this.#state.permission === 'on-request'
              ? 'on-request'
              : 'never',
          sandboxPolicy:
            mode === 'agent' || mode === 'goal'
              ? {
                  type: 'workspaceWrite',
                  writableRoots: [this.#state.projectRoot ?? ''],
                  networkAccess: false,
                  excludeTmpdirEnvVar: false,
                  excludeSlashTmp: false,
                }
              : { type: 'readOnly', networkAccess: false },
          model: this.#state.model,
          effort: this.#state.reasoningEffort,
        },
      );
    } finally {
      this.#requestedTurn = null;
    }
    // turn/started and early deltas can precede the RPC response.
    if (this.#state.activeTurn?.id !== response.turn.id)
      this.#patch({
        activeTurn: {
          id: response.turn.id,
          mode,
          prompt: trimmed,
          status: 'inProgress',
          text: '',
          activities: ['turn/start'],
          feedback: { startedAt: Date.now(), updatedAt: Date.now(), items: [] },
          plan: mode === 'goal' ? this.#state.goalPlan : [],
          diff: '',
          usage: null,
          error: null,
        },
      });
    return this.getState();
  }

  setModel(model: string): CodexStudioState {
    if (!this.#state.models.some((candidate) => candidate.model === model)) {
      throw new Error(`Codex 模型不可用：${model}`);
    }
    this.#patch({ model });
    return this.getState();
  }

  setReasoningEffort(reasoningEffort: string): CodexStudioState {
    const model = this.#state.models.find(
      (candidate) => candidate.model === this.#state.model,
    );
    if (
      model &&
      !model.supportedReasoningEfforts.some(
        (option) => option.reasoningEffort === reasoningEffort,
      )
    )
      throw new Error(`当前模型不支持推理强度：${reasoningEffort}`);
    this.#patch({ reasoningEffort });
    return this.getState();
  }

  setPermission(permission: 'read-only' | 'on-request'): CodexStudioState {
    this.#patch({ permission });
    return this.getState();
  }

  setIntegrationPreferences(input: {
    mcpEnabled?: boolean;
    projectSkillsEnabled?: boolean;
  }): void {
    if (typeof input.mcpEnabled === 'boolean')
      this.#mcpEnabled = input.mcpEnabled;
    if (typeof input.projectSkillsEnabled === 'boolean')
      this.#projectSkillsEnabled = input.projectSkillsEnabled;
  }

  async applyIntegrationPreferences(input: {
    mcpEnabled?: boolean;
    projectSkillsEnabled?: boolean;
  }): Promise<CodexStudioState> {
    const mcpChanged =
      typeof input.mcpEnabled === 'boolean' &&
      input.mcpEnabled !== this.#mcpEnabled;
    this.setIntegrationPreferences(input);
    await this.#applyProjectSkillPreference();
    if (mcpChanged && this.#client && this.#state.account) {
      // Thread configuration is fixed at creation time. Preserve the old
      // conversation and create a new visible one with the effective MCP set.
      return this.createConversation();
    }
    return this.getState();
  }

  async retryTurn(): Promise<CodexStudioState> {
    const previous = this.#state.activeTurn;
    if (!previous || previous.status === 'inProgress')
      throw new Error('没有可以重试的已结束 Codex turn。');
    return this.startTurn(previous.mode, previous.prompt);
  }

  async createConversation(): Promise<CodexStudioState> {
    const client = this.#requireClient();
    if (!this.#state.account) throw new Error('请先登录 Codex。');
    const created = await client.startThread({
      model: this.#state.model,
      config: this.#projectConfig(),
    });
    this.#historyThreadId = created.thread.id;
    this.#historyTurns = [];
    this.#historyCursor = null;
    this.#historyLoaded = false;
    this.#historyLoadingOlder = false;
    this.#patch({
      threadId: created.thread.id,
      activeTurn: null,
      transcript: [],
      history: { hasMore: false, loading: false },
      goal: null,
      goalPlan: [],
    });
    this.#persistThread(created.thread.id);
    await this.#refreshConversations(this.#generation);
    return this.getState();
  }

  async selectConversation(threadId: string): Promise<CodexStudioState> {
    if (!this.#state.conversations.some((thread) => thread.id === threadId))
      throw new Error('该 Codex 对话不属于当前项目。');
    await this.#requireClient().resumeThread(threadId, {
      model: this.#state.model,
      config: this.#projectConfig(),
      excludeTurns: true,
    });
    this.#patch({ threadId, activeTurn: null, goalPlan: [] });
    this.#persistThread(threadId);
    await this.#hydrateConversation(threadId, this.#generation);
    return this.getState();
  }

  async loadOlderHistory(): Promise<CodexStudioState> {
    const threadId = this.#state.threadId;
    const cursor = this.#historyCursor;
    const generation = this.#generation;
    if (
      !threadId ||
      !cursor ||
      this.#historyLoadingOlder ||
      this.#state.history?.loading
    )
      return this.getState();
    this.#historyLoadingOlder = true;
    this.#patch({ history: { hasMore: true, loading: true } });
    try {
      const page = await this.#requireClient().request<ThreadTurnsListResponse>(
        'thread/turns/list',
        {
          threadId,
          cursor,
          limit: 20,
          sortDirection: 'desc',
          itemsView: 'summary',
        },
      );
      if (generation !== this.#generation || threadId !== this.#state.threadId)
        return this.getState();
      // An overlapping older page must not overwrite a newer turn refresh.
      this.#mergeHistory(page.data, true);
      this.#historyCursor = page.nextCursor;
      this.#historyLoadingOlder = false;
      this.#patch({
        transcript: this.#transcriptFromThread({ turns: this.#historyTurns }),
        history: { hasMore: !!page.nextCursor, loading: false },
        ...(this.#state.error?.startsWith('较早对话加载失败')
          ? { error: null }
          : {}),
      });
    } catch (error) {
      if (
        generation === this.#generation &&
        threadId === this.#state.threadId
      ) {
        this.#historyLoadingOlder = false;
        this.#patch({
          history: { hasMore: true, loading: false },
          error: `较早对话加载失败，可重试：${String(error)}`,
        });
      }
    }
    return this.getState();
  }

  async setGoal(
    objective: string,
    tokenBudget?: number | null,
  ): Promise<CodexStudioState> {
    const threadId = this.#state.threadId;
    if (!threadId) throw new Error('当前项目没有 Codex 对话。');
    const trimmed = objective.trim();
    if (!trimmed) throw new Error('Goal objective 不能为空。');
    const response = await this.#requireClient().request<ThreadGoalSetResponse>(
      'thread/goal/set',
      {
        threadId,
        objective: trimmed,
        status: 'active',
        tokenBudget: tokenBudget ?? null,
      },
    );
    this.#patch({ goal: response.goal, goalPlan: initialGoalPlan() });
    return this.getState();
  }

  async setGoalStatus(status: ThreadGoalStatus): Promise<CodexStudioState> {
    const threadId = this.#state.threadId;
    if (!threadId || !this.#state.goal)
      throw new Error('当前对话没有可更新的 Goal。');
    const response = await this.#requireClient().request<ThreadGoalSetResponse>(
      'thread/goal/set',
      { threadId, status },
    );
    this.#patch({ goal: response.goal });
    return this.getState();
  }

  async stopGoal(): Promise<CodexStudioState> {
    if (!this.#state.goal) throw new Error('当前对话没有可停止的 Goal。');
    if (this.#state.activeTurn?.status === 'inProgress') {
      await this.interruptTurn();
    }
    return this.setGoalStatus('paused');
  }

  async clearGoal(): Promise<CodexStudioState> {
    const threadId = this.#state.threadId;
    if (!threadId || !this.#state.goal)
      throw new Error('当前对话没有可移除的 Goal。');
    if (this.#state.activeTurn?.status === 'inProgress') {
      await this.interruptTurn();
    }
    const response =
      await this.#requireClient().request<ThreadGoalClearResponse>(
        'thread/goal/clear',
        { threadId },
      );
    if (!response.cleared) throw new Error('Codex 未能移除当前 Goal。');
    this.#patch({ goal: null, goalPlan: [] });
    return this.getState();
  }

  async interruptTurn(): Promise<CodexStudioState> {
    const turn = this.#state.activeTurn;
    if (!turn || turn.status !== 'inProgress' || !this.#state.threadId) {
      throw new Error('当前没有可中断的 Codex turn。');
    }
    try {
      await this.#requireClient().interruptTurn(this.#state.threadId, turn.id);
      this.#patch({ activeTurn: { ...turn, status: 'interrupted' } });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('no active turn to interrupt')
      ) {
        this.#patch({
          activeTurn: {
            ...turn,
            status: 'completed',
            activities: [...turn.activities, 'turn/already-terminal'],
          },
        });
      } else {
        throw error;
      }
    }
    return this.getState();
  }

  decideApproval(
    id: string | number,
    decision: 'accept' | 'decline',
  ): CodexStudioState {
    const client = this.#requireClient();
    const approval = this.#state.pendingApprovals.find(
      (candidate) => candidate.id === id,
    );
    if (!approval) throw new Error('审批请求已失效或不存在。');
    if (decision === 'accept' && approval.canAccept === false)
      throw new Error('此请求需要完整表单或手动流程，不能用通用批准按钮代替。');
    const modern =
      approval.method === 'item/commandExecution/requestApproval' ||
      approval.method === 'item/fileChange/requestApproval';
    const responseDecision = modern
      ? decision
      : decision === 'accept'
        ? 'approved'
        : 'denied';
    client.respond(
      id,
      approval.method === 'mcpServer/elicitation/request'
        ? {
            action: decision,
            content: decision === 'accept' ? {} : null,
            _meta: null,
          }
        : approval.method === 'item/commandExecution/requestApproval'
          ? { decision: responseDecision, acceptSettings: null }
          : { decision: responseDecision },
    );
    this.#patch({
      pendingApprovals: this.#state.pendingApprovals.filter(
        (candidate) => candidate.id !== id,
      ),
    });
    return this.getState();
  }

  async stop(): Promise<void> {
    this.#generation += 1;
    this.#stopping = true;
    const client = this.#client;
    this.#client = null;
    await client?.close();
    this.#state = initialState();
    this.#historyThreadId = null;
    this.#historyTurns = [];
    this.#historyCursor = null;
    this.#historyLoaded = false;
    this.#historyLoadingOlder = false;
    this.#emit();
  }

  async #startGeneration(
    projectRoot: string,
    generation: number,
  ): Promise<CodexStudioState> {
    try {
      const launch = this.#options.resolveLaunch
        ? this.#options.resolveLaunch()
        : resolveBundledCodexSidecar({
            applicationRoot: this.#options.applicationRoot,
            runtimeExecutable: this.#options.runtimeExecutable,
          });
      this.#state = {
        ...initialState(),
        status: this.#state.status === 'recovering' ? 'recovering' : 'starting',
        projectRoot,
        version: launch.version,
        model: this.#state.model,
        reasoningEffort: this.#state.reasoningEffort,
        permission: this.#state.permission,
      };
      this.#emit();
      const client = new CodexAppServerClient({
        cwd: projectRoot,
        binary: launch.command,
        prefixArguments: launch.prefixArguments,
        env: launch.env,
      });
      this.#client = client;
      this.#bindClient(client, projectRoot, generation);
      await client.connect();
      if (generation !== this.#generation) return this.getState();
      await this.#applyProjectSkillPreference();
      const account = await client.request<GetAccountResponse>('account/read', {
        refreshToken: false,
      });
      this.#patch({
        status: 'ready',
        account: account.account,
        requiresOpenaiAuth: account.requiresOpenaiAuth,
        error: null,
      });
      if (account.account) {
        await this.#refreshModels(generation);
        await this.#ensureProjectThread(generation);
      }
    } catch (error) {
      if (generation === this.#generation) {
        this.#patch({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return this.getState();
  }

  #bindClient(
    client: CodexAppServerClient,
    projectRoot: string,
    generation: number,
  ): void {
    client.events.on(
      'notification',
      (message: { method?: string; params?: unknown }) => {
        if (generation !== this.#generation || !message.method) return;
        this.#patch({ lastEvent: message.method });
        if (message.method === 'serverRequest/resolved') {
          const resolved = message.params as { requestId?: string | number };
          this.#patch({
            pendingApprovals: this.#state.pendingApprovals.filter(
              (approval) => approval.id !== resolved.requestId,
            ),
          });
        }
        this.#updateTurnFromNotification(message.method, message.params);
        if (
          message.method === 'account/updated' ||
          message.method === 'account/login/completed'
        ) {
          void this.#refreshAccount(generation);
        }
        if (message.method === 'thread/goal/updated') {
          const params = message.params as
            | { threadId?: unknown; goal?: unknown }
            | undefined;
          if (
            params?.threadId === this.#state.threadId &&
            params.goal &&
            typeof params.goal === 'object'
          ) {
            this.#patch({ goal: params.goal as ThreadGoal });
          }
        }
        if (message.method === 'thread/goal/cleared') {
          const params = message.params as { threadId?: unknown } | undefined;
          if (params?.threadId === this.#state.threadId)
            this.#patch({ goal: null, goalPlan: [] });
        }
        if (message.method === 'turn/completed') {
          void this.#hydrateConversation(
            this.#state.threadId ?? '',
            generation,
          );
        }
      },
    );
    client.events.on('serverRequest', (request: ServerRequest) => {
      if (generation !== this.#generation) return;
      const params = request.params as {
        reason?: string | null;
        itemId?: string;
        callId?: string;
      };
      const elicitation =
        request.method === 'mcpServer/elicitation/request'
          ? (request.params as McpServerElicitationRequestParams)
          : undefined;
      const schema =
        elicitation && elicitation.mode !== 'url'
          ? (elicitation.requestedSchema as Record<string, unknown>)
          : null;
      const emptyForm = Boolean(
        schema &&
        schema.type === 'object' &&
        schema.properties &&
        typeof schema.properties === 'object' &&
        !Array.isArray(schema.properties) &&
        Object.keys(schema.properties).length === 0 &&
        (!schema.required ||
          (Array.isArray(schema.required) && schema.required.length === 0)),
      );
      this.#patch({
        pendingApprovals: [
          ...this.#state.pendingApprovals,
          {
            id: request.id,
            method: request.method,
            reason: elicitation
              ? `${elicitation.serverName}: ${elicitation.message}${emptyForm ? '' : `\n需要完整表单或手动流程；当前通用按钮不能代填。\n请求结构：${JSON.stringify(schema)}`}`
              : (params.reason ?? null),
            itemId: params.itemId ?? params.callId ?? null,
            ...(elicitation ? { elicitation, canAccept: emptyForm } : {}),
          },
        ],
        lastEvent: request.method,
      });
    });
    client.events.on('exit', () => {
      if (
        generation !== this.#generation ||
        this.#stopping ||
        this.#restartAttempted
      )
        return;
      this.#restartAttempted = true;
      this.#patch({
        status: 'recovering',
        error: 'Codex App Server 意外退出，Studio 正在恢复项目会话。',
      });
      setTimeout(() => {
        if (generation === this.#generation && !this.#stopping) {
          void this.#startGeneration(projectRoot, generation);
        }
      }, 500);
    });
    client.events.on('protocolError', (error: unknown) => {
      if (generation === this.#generation) {
        this.#patch({ lastEvent: 'protocol/error', error: String(error) });
      }
    });
  }

  async #refreshAccount(generation: number): Promise<void> {
    const client = this.#client;
    if (!client || generation !== this.#generation) return;
    try {
      const account = await client.request<GetAccountResponse>('account/read', {
        refreshToken: false,
      });
      if (generation !== this.#generation) return;
      this.#patch({
        status: 'ready',
        account: account.account,
        requiresOpenaiAuth: account.requiresOpenaiAuth,
        error: null,
      });
      if (account.account) {
        await this.#refreshModels(generation);
        await this.#ensureProjectThread(generation);
      }
    } catch (error) {
      if (generation === this.#generation) {
        this.#patch({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async #ensureProjectThread(generation: number): Promise<void> {
    if (
      !this.#client ||
      this.#state.threadId ||
      generation !== this.#generation
    )
      return;
    const sessionPath = join(
      this.#state.projectRoot ?? '',
      '.aigame',
      'local',
      'codex-session.json',
    );
    let storedThreadId: string | null = null;
    if (existsSync(sessionPath)) {
      try {
        const stored = JSON.parse(readFileSync(sessionPath, 'utf8')) as {
          threadId?: unknown;
        };
        if (typeof stored.threadId === 'string')
          storedThreadId = stored.threadId;
      } catch {
        // A malformed local session is replaceable state, not project authority.
      }
    }
    let threadId: string;
    const projectConfig = this.#projectConfig();
    if (storedThreadId) {
      try {
        const resumed = await this.#client.resumeThread(storedThreadId, {
          model: this.#state.model,
          config: projectConfig,
          excludeTurns: true,
        });
        threadId = resumed.thread.id;
      } catch {
        const created = await this.#client.startThread({
          model: this.#state.model,
          config: projectConfig,
        });
        threadId = created.thread.id;
      }
    } else {
      const created = await this.#client.startThread({
        model: this.#state.model,
        config: projectConfig,
      });
      threadId = created.thread.id;
    }
    if (generation === this.#generation) {
      this.#persistThread(threadId);
      this.#patch({ threadId });
      const mcp = await this.#client.request<{
        data: Array<{
          name: string;
          runtimeStatus: string | null;
          tools: Record<string, unknown>;
        }>;
      }>('mcpServerStatus/list', { threadId, detail: 'full' });
      if (generation === this.#generation) {
        this.#patch({
          mcpServers: mcp.data.map((server) => ({
            name: server.name,
            status: server.runtimeStatus,
            toolCount: Object.keys(server.tools).length,
          })),
        });
      }
      await this.#refreshConversations(generation);
      await this.#hydrateConversation(threadId, generation);
    }
  }

  #projectConfig(): { [key: string]: JsonValue | undefined } {
    const toolchainBin = existsSync(join(this.#options.applicationRoot, 'bin'))
      ? join(this.#options.applicationRoot, 'bin')
      : join(this.#options.applicationRoot, 'target', 'debug');
    const runtime = this.#options.runtimeExecutable ?? process.execPath;
    return this.#mcpEnabled
      ? {
          mcp_servers: {
            'ai-game-engine': {
              // This tool cannot approve anything. The shared ChangeSet service
              // requires a separately reviewed, hash-bound approval at apply time.
              // Do not ask a second, context-free transport question afterwards.
              tools: { 'change.apply': { approval_mode: 'approve' } },
              command: join(
                toolchainBin,
                process.platform === 'win32' ? 'aigame-mcp.exe' : 'aigame-mcp',
              ),
              args: ['--project', '.'],
              env: {
                AIGAME_STUDIO_NODE_RUNTIME: runtime,
                AIGAME_STUDIO_ENGINE_MCP_SERVER: join(
                  this.#options.applicationRoot,
                  'dist',
                  'electron',
                  'engine-mcp',
                  'server.js',
                ),
                AIGAME_STUDIO_KERNEL_CLI: join(
                  toolchainBin,
                  process.platform === 'win32' ? 'kernelctl.exe' : 'kernelctl',
                ),
                AIGAME_STUDIO_GAME_RUNTIME: join(
                  toolchainBin,
                  process.platform === 'win32'
                    ? 'ai-game-player.exe'
                    : 'ai-game-player',
                ),
                AIGAME_STUDIO_SCRIPT_HOST: join(
                  toolchainBin,
                  process.platform === 'win32'
                    ? 'project-script-host.exe'
                    : 'project-script-host',
                ),
                ...(this.#assetBrokerConnection
                  ? {
                      AIGAME_STUDIO_ASSET_BROKER_URL:
                        this.#assetBrokerConnection.url,
                      AIGAME_STUDIO_ASSET_BROKER_TOKEN:
                        this.#assetBrokerConnection.token,
                    }
                  : {}),
              },
            },
          },
        }
      : {};
  }

  async #applyProjectSkillPreference(): Promise<void> {
    const client = this.#client;
    const projectRoot = this.#state.projectRoot;
    if (!client || !projectRoot) return;
    const skillRoot = join(projectRoot, '.agents', 'skills');
    await client.request('skills/extraRoots/set', {
      extraRoots:
        this.#projectSkillsEnabled && existsSync(skillRoot) ? [skillRoot] : [],
    });
    const response = await client.request<{
      data: Array<{ skills: Array<{ path: string; enabled: boolean }> }>;
    }>('skills/list', { cwds: [projectRoot], forceReload: true });
    for (const entry of response.data) {
      for (const skill of entry.skills) {
        if (!resolve(skill.path).startsWith(resolve(skillRoot))) continue;
        if (skill.enabled === this.#projectSkillsEnabled) continue;
        await client.request('skills/config/write', {
          path: skill.path,
          enabled: this.#projectSkillsEnabled,
        });
      }
    }
  }

  #persistThread(threadId: string): void {
    const sessionPath = join(
      this.#state.projectRoot ?? '',
      '.aigame',
      'local',
      'codex-session.json',
    );
    mkdirSync(dirname(sessionPath), { recursive: true });
    writeFileSync(
      sessionPath,
      `${JSON.stringify(
        {
          schemaVersion: '1.0.0',
          threadId,
          codexVersion: this.#state.version,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }

  async #refreshConversations(generation: number): Promise<void> {
    const client = this.#client;
    const projectRoot = this.#state.projectRoot;
    if (!client || !projectRoot || generation !== this.#generation) return;
    const response = await client.request<ThreadListResponse>('thread/list', {
      cwd: projectRoot,
      limit: 50,
      sortKey: 'updated_at',
      sortDirection: 'desc',
      archived: false,
    });
    if (generation !== this.#generation) return;
    this.#patch({
      conversations: response.data.map((thread) => ({
        id: thread.id,
        title:
          thread.name?.trim() ||
          thread.preview.trim().split(/\r?\n/u)[0]?.slice(0, 60) ||
          '新对话',
        preview: thread.preview,
        updatedAt: thread.updatedAt,
        status:
          typeof thread.status === 'string'
            ? thread.status
            : JSON.stringify(thread.status),
      })),
    });
  }

  async #hydrateConversation(
    threadId: string,
    generation: number,
  ): Promise<void> {
    const client = this.#client;
    if (!client || !threadId || generation !== this.#generation) return;
    if (this.#historyThreadId !== threadId) {
      this.#historyThreadId = threadId;
      this.#historyTurns = [];
      this.#historyCursor = null;
      this.#historyLoaded = false;
      this.#historyLoadingOlder = false;
      this.#patch({
        transcript: [],
        history: { hasMore: false, loading: true },
      });
    }
    const refresh = ++this.#historyRefresh;
    try {
      const [page, goal] = await Promise.all([
        client.request<ThreadTurnsListResponse>('thread/turns/list', {
          threadId,
          limit: 20,
          sortDirection: 'desc',
          itemsView: 'summary',
        }),
        client.request<ThreadGoalGetResponse>('thread/goal/get', { threadId }),
      ]);
      if (
        generation !== this.#generation ||
        threadId !== this.#state.threadId ||
        refresh !== this.#historyRefresh
      )
        return;
      this.#mergeHistory(page.data);
      if (!this.#historyLoaded) this.#historyCursor = page.nextCursor;
      this.#historyLoaded = true;
      this.#patch({
        transcript: this.#transcriptFromThread({ turns: this.#historyTurns }),
        history: {
          hasMore: !!this.#historyCursor,
          loading: this.#historyLoadingOlder,
        },
        goal: goal.goal,
        goalPlan: goal.goal
          ? this.#planFromThread({ turns: this.#historyTurns }) ||
            (this.#state.goalPlan.length > 0
              ? this.#state.goalPlan
              : initialGoalPlan())
          : [],
      });
      await this.#refreshConversations(generation);
    } catch (error) {
      if (
        generation === this.#generation &&
        threadId === this.#state.threadId &&
        refresh === this.#historyRefresh
      ) {
        this.#patch({
          history: { hasMore: !!this.#historyCursor, loading: false },
          error: `Codex 对话恢复失败：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  #mergeHistory(turns: Turn[], preserveExisting = false): void {
    const merged = new Map(this.#historyTurns.map((turn) => [turn.id, turn]));
    for (const turn of turns) {
      if (!preserveExisting || !merged.has(turn.id)) merged.set(turn.id, turn);
    }
    this.#historyTurns = [...merged.values()].sort(
      (a, b) =>
        (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.id.localeCompare(b.id),
    );
  }

  #transcriptFromThread(thread: Pick<Thread, 'turns'>): CodexTranscriptEntry[] {
    return thread.turns.flatMap((turn) =>
      turn.items.flatMap((item): CodexTranscriptEntry[] => {
        if (item.type === 'userMessage') {
          const raw = item.content
            .flatMap((content) =>
              content.type === 'text' ? [content.text] : [],
            )
            .join('\n');
          const text = raw.includes('Developer request:')
            ? (raw.split('Developer request:').at(-1)?.trimStart() ?? '')
            : raw;
          return text
            ? [{ id: item.id, role: 'user', text, status: turn.status }]
            : [];
        }
        if (item.type === 'agentMessage')
          return [
            {
              id: item.id,
              role: 'assistant',
              text: item.text,
              status: turn.status,
            },
          ];
        if (item.type === 'plan')
          return [
            {
              id: item.id,
              role: 'plan',
              text: item.text,
              status: turn.status,
            },
          ];
        const activity = projectActivity(
          item as unknown as Record<string, unknown>,
          0,
        );
        if (activity)
          return [
            {
              id: item.id,
              role: 'activity',
              text: activity.label,
              status: activity.status,
              activity: {
                ...activity,
                status:
                  activity.status === 'inProgress' &&
                  turn.status !== 'inProgress'
                    ? 'ended'
                    : activity.status,
              },
            },
          ];
        return [];
      }),
    );
  }

  #planFromThread(thread: Pick<Thread, 'turns'>): CodexPlanStep[] | null {
    for (const turn of [...thread.turns].reverse()) {
      for (const item of [...turn.items].reverse()) {
        if (item.type !== 'agentMessage' && item.type !== 'plan') continue;
        const plan = deriveStudioPlanFromText(item.text);
        if (plan.length > 0) return plan;
      }
    }
    return null;
  }

  #requireClient(): CodexAppServerClient {
    if (!this.#client) throw new Error('当前项目没有运行 Codex App Server。');
    return this.#client;
  }

  async #refreshModels(generation: number): Promise<void> {
    const client = this.#client;
    if (!client || generation !== this.#generation) return;
    const response = await client.listModels({ includeHidden: false });
    if (generation !== this.#generation) return;
    const visible = response.data.filter((model) => !model.hidden);
    const preferred = visible.find((model) => model.isDefault) ?? visible[0];
    const selected =
      visible.find((model) => model.model === this.#state.model) ?? preferred;
    const supported = selected?.supportedReasoningEfforts ?? [];
    const reasoningEffort = supported.some(
      (option) => option.reasoningEffort === this.#state.reasoningEffort,
    )
      ? this.#state.reasoningEffort
      : (selected?.defaultReasoningEffort ?? 'medium');
    this.#patch({
      model: selected?.model ?? selected?.id ?? null,
      reasoningEffort,
      models: visible.map(
        ({
          id,
          model,
          displayName,
          isDefault,
          supportedReasoningEfforts,
          defaultReasoningEffort,
        }) => ({
          id,
          model,
          displayName,
          isDefault,
          supportedReasoningEfforts,
          defaultReasoningEffort,
        }),
      ),
    });
  }

  #updateTurnFromNotification(method: string, params: unknown): void {
    const value =
      params && typeof params === 'object'
        ? (params as Record<string, unknown>)
        : {};
    if (
      typeof value.threadId === 'string' &&
      value.threadId !== this.#state.threadId
    )
      return;
    if (method === 'turn/started') {
      const started = value.turn as { id?: string } | undefined;
      if (
        typeof started?.id !== 'string' ||
        started.id === this.#state.activeTurn?.id
      )
        return;
      const mode =
        this.#requestedTurn?.mode ?? (this.#state.goal ? 'goal' : 'agent');
      this.#messageStream = new StudioAgentMessageStream();
      this.#patch({
        activeTurn: {
          id: started.id,
          mode,
          prompt:
            this.#requestedTurn?.prompt ?? this.#state.goal?.objective ?? '',
          status: 'inProgress',
          text: '',
          activities: ['turn/started'],
          feedback: { startedAt: Date.now(), updatedAt: Date.now(), items: [] },
          plan: mode === 'goal' ? this.#state.goalPlan : [],
          diff: '',
          usage: null,
          error: null,
        },
      });
      return;
    }
    let turn = this.#state.activeTurn;
    if (!turn) return;
    if (typeof value.turnId === 'string' && value.turnId !== turn.id) return;
    if (
      typeof value.threadId === 'string' &&
      value.threadId !== this.#state.threadId
    )
      return;
    const eventTurn = value.turn as { id?: string } | undefined;
    if (eventTurn?.id && eventTurn.id !== turn.id) return;
    if (
      turn.status === 'inProgress' &&
      (method.startsWith('item/') ||
        method.startsWith('turn/') ||
        method === 'error')
    ) {
      turn = {
        ...turn,
        feedback: reduceFeedback(turn.feedback, method, value, Date.now()),
      };
      this.#patch({ activeTurn: turn });
    }
    const completedItem = value.item as
      | { type?: string; id?: string; text?: string }
      | undefined;
    if (
      (method === 'item/agentMessage/delta' &&
        typeof value.delta === 'string' &&
        typeof value.itemId === 'string') ||
      (method === 'item/completed' &&
        completedItem?.type === 'agentMessage' &&
        typeof completedItem.id === 'string' &&
        typeof completedItem.text === 'string')
    ) {
      if (method === 'item/agentMessage/delta')
        this.#messageStream.append(
          value.itemId as string,
          value.delta as string,
        );
      else
        this.#messageStream.complete(completedItem!.id!, completedItem!.text!);
      const { text, plan: derivedPlan } = this.#messageStream.snapshot();
      this.#patch({
        activeTurn: {
          ...turn,
          text,
          plan: derivedPlan.length > 0 ? derivedPlan : turn.plan,
        },
        ...(turn.mode === 'goal' && derivedPlan.length > 0
          ? { goalPlan: derivedPlan }
          : {}),
      });
      return;
    }
    if (method === 'turn/completed') {
      const completed = value.turn as
        | { id?: string; status?: CodexTurnState['status']; error?: unknown }
        | undefined;
      if (completed?.id === turn.id) {
        this.#patch({
          activeTurn: {
            ...turn,
            status: completed.status ?? 'completed',
            error:
              completed.status === 'failed'
                ? JSON.stringify(completed.error ?? 'Codex turn failed')
                : null,
          },
        });
      }
      return;
    }
    if (method === 'turn/plan/updated') {
      const plan: CodexPlanStep[] = Array.isArray(value.plan)
        ? value.plan.flatMap((item) => {
            if (!item || typeof item !== 'object') return [];
            const entry = item as Record<string, unknown>;
            return typeof entry.step === 'string' &&
              typeof entry.status === 'string'
              ? [
                  {
                    step: entry.step,
                    status: normalizePlanStatus(entry.status, entry.step),
                  },
                ]
              : [];
          })
        : [];
      this.#patch({
        activeTurn: { ...turn, plan },
        ...(turn.mode === 'goal' ? { goalPlan: plan } : {}),
      });
      return;
    }
    if (method === 'turn/diff/updated' && typeof value.diff === 'string') {
      this.#patch({ activeTurn: { ...turn, diff: value.diff } });
      return;
    }
    if (method === 'thread/tokenUsage/updated') {
      const tokenUsage = value.tokenUsage as
        | {
            total?: Record<string, unknown>;
            modelContextWindow?: unknown;
          }
        | undefined;
      const total = tokenUsage?.total;
      if (total) {
        this.#patch({
          activeTurn: {
            ...turn,
            usage: {
              totalTokens: Number(total.totalTokens ?? 0),
              inputTokens: Number(total.inputTokens ?? 0),
              cachedInputTokens: Number(total.cachedInputTokens ?? 0),
              outputTokens: Number(total.outputTokens ?? 0),
              reasoningOutputTokens: Number(total.reasoningOutputTokens ?? 0),
              modelContextWindow:
                typeof tokenUsage?.modelContextWindow === 'number'
                  ? tokenUsage.modelContextWindow
                  : null,
            },
          },
        });
      }
      return;
    }
    if (
      method === 'item/started' ||
      method === 'item/completed' ||
      method === 'item/mcpToolCall/progress' ||
      method === 'error'
    ) {
      const item = value.item as
        | { type?: unknown; server?: unknown; tool?: unknown; status?: unknown }
        | undefined;
      const activity =
        item?.type === 'mcpToolCall'
          ? `${method}: ${String(item.server)}/${String(item.tool)} (${String(item.status)})`
          : method === 'item/mcpToolCall/progress' &&
              typeof value.message === 'string'
            ? `${method}: ${value.message}`
            : method;
      this.#patch({
        activeTurn: {
          ...turn,
          activities: [...turn.activities, activity].slice(-100),
          error:
            method === 'error'
              ? JSON.stringify(value.error ?? value)
              : turn.error,
        },
      });
    }
  }

  #patch(patch: Partial<CodexStudioState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#emit();
  }

  #emit(): void {
    // The desktop coalescer needs only a notification, not a deep copy of the
    // entire conversation for every streamed token. Keep the snapshot event
    // for explicit consumers (including the live harness gates).
    this.events.emit('invalidated');
    if (this.events.listenerCount('state') > 0)
      this.events.emit('state', this.getState());
  }
}
