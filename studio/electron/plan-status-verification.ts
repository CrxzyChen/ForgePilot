import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { CodexStudioState } from './codex-process-manager.ts';
import { IPC_CHANNELS } from './contracts.ts';
import { CompletionRunService } from '../workspace/completion-run-service.ts';

// Only invoked by the isolated P15 gate. Never attaches to an owner conversation.
export async function verifyPlanStatus(
  window: BrowserWindow,
  root: string,
  repository: string,
) {
  const parent = existsSync(join(repository, 'scripts/check-p15-ui-quality.ts'))
    ? join(repository, 'artifacts')
    : join(tmpdir(), 'aigame-studio-verification');
  mkdirSync(parent, { recursive: true });
  const evidence = mkdtempSync(join(parent, 'p32-plan-status-ui-'));
  const goal: NonNullable<CodexStudioState['goal']> = {
    threadId: 'thread:plan-status-fixture',
    objective: '验证计划进度不冒充任务完成',
    status: 'blocked',
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1788676000,
    updatedAt: 1788676000,
  };
  const steps: CodexStudioState['goalPlan'] = [
    { step: '已完成的素材导入', status: 'completed' },
    { step: '等待返回音试听', status: 'inProgress' },
    { step: '打包并完成独立试玩', status: 'pending' },
  ];
  const service = new CompletionRunService({ projectRoot: root });
  const run = service.syncGoal({
    ...goal,
    plan: steps,
    authority: {
      providerApprovalMode: 'per-call',
      candidateSelectionMode: 'human-required',
      changeSetApprovalMode: 'human-required',
      budgetCurrency: 'CNY',
      budgetLimit: 1,
    },
  });
  run.status = 'waiting';
  run.activePlanStepId = run.planSteps[1].id;
  run.planSteps[1].status = 'waiting';
  run.planSteps[1].waitReason = 'candidate-review';
  const base: CodexStudioState = {
    status: 'ready',
    projectRoot: root,
    version: 'fixture',
    account: { type: 'apiKey' },
    requiresOpenaiAuth: false,
    threadId: goal.threadId,
    model: null,
    models: [],
    reasoningEffort: 'medium',
    permission: 'on-request',
    conversations: [],
    transcript: [],
    goal,
    goalPlan: steps,
    completionRun: run,
    mcpServers: [],
    pendingApprovals: [],
    lastEvent: null,
    error: null,
    activeTurn: {
      id: 'turn:plan-status-fixture',
      mode: 'goal',
      prompt: '验证状态',
      status: 'completed',
      text: '等待用户选择',
      activities: [],
      plan: steps,
      diff: '',
      usage: null,
      error: null,
    },
  };
  const scenarios: Array<{
    name: string;
    state: CodexStudioState;
    label: string;
  }> = [
    {
      name: 'completed-turn-waiting-review',
      state: base,
      label: '等待候选资源审核',
    },
    {
      name: 'idle-incomplete',
      state: { ...base, goal: null, completionRun: null },
      label: '待继续',
    },
    {
      name: 'running',
      state: {
        ...base,
        goal: { ...goal, status: 'active' },
        completionRun: null,
        activeTurn: { ...base.activeTurn!, status: 'inProgress' },
      },
      label: '执行中',
    },
    {
      name: 'paused',
      state: { ...base, goal: { ...goal, status: 'paused' } },
      label: '已停止',
    },
    {
      name: 'failed',
      state: {
        ...base,
        goal: null,
        completionRun: null,
        activeTurn: { ...base.activeTurn!, status: 'failed' },
      },
      label: '执行失败',
    },
    {
      name: 'approval',
      state: {
        ...base,
        completionRun: null,
        pendingApprovals: [
          {
            id: 'approval:fixture',
            method: 'item/fileChange/requestApproval',
            reason: 'fixture',
            itemId: null,
          },
        ],
      },
      label: '等待审批',
    },
    {
      name: 'all-steps-completed',
      state: {
        ...base,
        goal: { ...goal, status: 'active' },
        completionRun: null,
        activeTurn: {
          ...base.activeTurn!,
          plan: steps.map((s) => ({ ...s, status: 'completed' })),
        },
      },
      label: '步骤已完成',
    },
    {
      name: 'empty-idle',
      state: {
        ...base,
        goal: null,
        completionRun: null,
        goalPlan: [],
        activeTurn: { ...base.activeTurn!, mode: 'plan', plan: [] },
      },
      label: '暂无计划',
    },
  ];
  const observations = [];
  window.setBounds({ x: 80, y: 80, width: 960, height: 640 });
  window.show();
  window.focus();
  await window.webContents.executeJavaScript(
    `document.querySelector('.right-switcher button:last-child')?.click()`,
  );
  let publication = 0;
  const publish = async (state: CodexStudioState) => {
    const marker = `ui-fixture-${++publication}`;
    window.webContents.send(IPC_CHANNELS.codexState, {
      ...state,
      model: marker,
    });
    // Wait for this IPC snapshot to commit, rather than guessing React's render
    // latency while the full suite is compiling/running other native checks.
    let committed = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      committed = await window.webContents.executeJavaScript(
        `document.querySelector('.copilot-content > header')?.textContent.includes(${JSON.stringify(marker)}) ?? false`,
      );
      if (committed) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(committed, `Renderer did not commit ${marker}`);
    await window.webContents.executeJavaScript(
      `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    );
  };
  const scrollState = () =>
    window.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.copilot-transcript');
    return { top: el.scrollTop, height: el.scrollHeight, gap: el.scrollHeight - el.clientHeight - el.scrollTop,
      jump: !!document.querySelector('.copilot-jump-bottom') };
  })()`);
  const streaming = {
    ...base,
    activeTurn: {
      ...base.activeTurn!,
      text: '消息内容\n'.repeat(160),
      feedback: {
        startedAt: Date.now() - 2000,
        updatedAt: Date.now(),
        items: [
          {
            id: 'tool:gpu',
            label: 'engine.runtime.capture',
            status: 'completed',
            detail: 'GPU frame ready',
            startedAt: Date.now() - 2000,
            updatedAt: Date.now(),
          },
        ],
      },
    },
  };
  await publish(streaming);
  const activityUi = await window.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('.copilot-activity');
    row.querySelector('summary').click();
    const composer = document.querySelector('.copilot-composer').getBoundingClientRect();
    const status = document.querySelector('.copilot-execution-status');
    const rect = status.getBoundingClientRect();
    return { open: row.open, detail: row.textContent, contained: rect.left >= composer.left && rect.right <= composer.right, font: parseFloat(getComputedStyle(status).fontSize) };
  })()`);
  assert(activityUi.open && activityUi.detail.includes('GPU frame ready'));
  assert(activityUi.contained && activityUi.font <= 12);
  await publish({
    ...streaming,
    activeTurn: {
      ...streaming.activeTurn,
      status: 'inProgress',
      feedback: {
        ...streaming.activeTurn.feedback,
        items: [
          { ...streaming.activeTurn.feedback.items[0], status: 'inProgress' },
        ],
      },
    },
  });
  const liveFeedback = await window.webContents.executeJavaScript(`(() => {
    const status = document.querySelector('.copilot-execution-status');
    const row = document.querySelector('.copilot-activity');
    if (!row.open) row.querySelector('summary').click();
    return { status: status.textContent, noOverflow: status.scrollWidth <= status.clientWidth + 1 };
  })()`);
  assert(liveFeedback.status.includes('正在执行：engine.runtime.capture'));
  assert(liveFeedback.status.includes('秒前更新') && liveFeedback.noOverflow);
  await new Promise((resolve) => setTimeout(resolve, 100));
  writeFileSync(
    join(evidence, 'activity-running.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  await publish(streaming);
  const collapsed = await window.webContents.executeJavaScript(`(() => {
    const details = document.querySelector('.copilot-progress-disclosure');
    const composer = document.querySelector('.copilot-composer');
    const actions = [...details.querySelectorAll('.copilot-progress-actions button')];
    const bounds = details.getBoundingClientRect();
    return { open: details.dataset.expanded === 'true', height: bounds.height,
      aboveComposer: details.nextElementSibling === composer && bounds.bottom <= composer.getBoundingClientRect().top,
      summary: details.querySelector('.copilot-progress-summary').textContent,
      actionsVisible: actions.length === 2 && actions.every(button => { const rect = button.getBoundingClientRect(); return rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom; }),
      duplicatePlan: !!document.querySelector('.copilot-transcript ol') };
  })()`);
  assert.equal(collapsed.open, false);
  assert(collapsed.height <= 84 && !collapsed.duplicatePlan);
  assert(collapsed.aboveComposer && collapsed.actionsVisible);
  assert(collapsed.summary.includes(goal.objective));
  writeFileSync(
    join(evidence, 'compact-conversation.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  assert(
    (await scrollState()).gap <= 2,
    'Initial conversation must open at bottom',
  );
  streaming.activeTurn.text += '流式更新\n'.repeat(20);
  await publish(streaming);
  assert(
    (await scrollState()).gap <= 2,
    'Pinned conversation must follow streaming updates',
  );
  await window.webContents.executeJavaScript(
    `document.querySelector('.copilot-transcript').scrollTop = 100`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  const reading = await scrollState();
  assert(reading.jump);
  streaming.activeTurn.text += '更多更新\n'.repeat(20);
  await publish(streaming);
  assert(
    Math.abs((await scrollState()).top - reading.top) < 2,
    'Reading older text must not be interrupted',
  );
  await window.webContents.executeJavaScript(
    `document.querySelector('.copilot-jump-bottom').click()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert((await scrollState()).gap <= 2 && !(await scrollState()).jump);
  streaming.activeTurn.text += '继续跟随\n'.repeat(20);
  await publish(streaming);
  assert(
    (await scrollState()).gap <= 2,
    'Jump to bottom must resume following',
  );
  const historyState: CodexStudioState = {
    ...streaming,
    transcript: [
      {
        id: 'recent',
        role: 'assistant',
        text: '已有记录\n'.repeat(40),
        status: null,
      },
    ],
  };
  await publish(historyState);
  await window.webContents.executeJavaScript(
    `document.querySelector('.copilot-transcript').scrollTop = 100`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  const beforeHistory = await scrollState();
  const anchorTop = () =>
    window.webContents.executeJavaScript(
      `document.querySelector('[data-transcript-entry="recent"]').getBoundingClientRect().top`,
    );
  const beforeAnchor = await anchorTop();
  historyState.transcript.unshift({
    id: 'older',
    role: 'user',
    text: '较早记录\n'.repeat(30),
    status: null,
  });
  historyState.activeTurn = {
    ...historyState.activeTurn!,
    text: historyState.activeTurn!.text + '并发流式更新\n'.repeat(20),
  };
  await publish(historyState);
  const afterHistory = await scrollState();
  assert(
    afterHistory.top > beforeHistory.top &&
      Math.abs((await anchorTop()) - beforeAnchor) < 2,
    'Prepending history must preserve reading position',
  );
  await publish({ ...historyState, threadId: 'thread:new-conversation' });
  assert.equal(
    await window.webContents.executeJavaScript(
      `document.querySelectorAll('.copilot-running-plan').length`,
    ),
    1,
    'Conversation switches must not retain stale progress DOM',
  );
  assert.equal(
    await window.webContents.executeJavaScript(
      `document.querySelectorAll('.copilot-transcript').length`,
    ),
    1,
  );
  assert(
    (await scrollState()).gap <= 2,
    'Switching conversation resets bottom following',
  );
  const overflow = await window.webContents.executeJavaScript(`(() => {
    const probe = document.createElement('div');
    probe.className = 'asset-workflow';
    probe.style.width = '180px';
    probe.innerHTML = '<article class="asset-job-card"><header><strong>' + 'long-path'.repeat(40) + '</strong></header><div class="asset-candidates"><div><audio controls></audio><small>' + 'candidate-path'.repeat(50) + '</small><button>选择并提议导入</button></div></div><div class="asset-generation-form"><label>模型<select><option>' + 'long-model'.repeat(30) + '</option></select></label></div></article>';
    document.body.append(probe);
    const bounds = probe.getBoundingClientRect();
    const result = { width: probe.clientWidth, scroll: probe.scrollWidth,
      contained: [...probe.querySelectorAll('*')].every(el => el.getBoundingClientRect().right <= bounds.right + 1) };
    probe.remove();
    return result;
  })()`);
  assert(
    overflow.contained && overflow.scroll <= overflow.width + 1,
    JSON.stringify(overflow),
  );
  writeFileSync(
    join(evidence, 'conversation-interaction.json'),
    JSON.stringify(
      {
        collapsed,
        reading,
        overflow,
        streamingFollow: true,
        readingPreserved: true,
        jumpResumesFollow: true,
      },
      null,
      2,
    ),
  );
  for (const scenario of scenarios) {
    await publish(scenario.state);
    await window.webContents.executeJavaScript(
      `document.querySelector('.right-switcher button:last-child')?.click()`,
    );
    await window.webContents.executeJavaScript(
      `(() => { const details = document.querySelector('.copilot-progress-disclosure'); if (details && details.dataset.expanded !== 'true') details.querySelector('.copilot-progress-toggle').click(); })()`,
    );
    await window.webContents.executeJavaScript(
      `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const actual = await window.webContents.executeJavaScript(`(() => {
      const card = document.querySelector('.copilot-running-plan');
      const header = card?.querySelector('header strong');
      const dock = document.querySelector('.copilot-content');
      const box = card?.getBoundingClientRect(), bounds = dock?.getBoundingClientRect();
      const heading = header?.getBoundingClientRect();
      return { label: header?.textContent?.trim(), text: card?.textContent,
        disclosureOpen: document.querySelector('.copilot-progress-disclosure')?.dataset.expanded === 'true',
        disclosureHeight: document.querySelector('.copilot-progress-disclosure')?.getBoundingClientRect().height,
        turnLabel: document.querySelector('.copilot-transcript [data-role="active"] > span')?.textContent,
        fontSize: header ? Number.parseFloat(getComputedStyle(header).fontSize) : 0,
        background: card ? getComputedStyle(card).backgroundColor : '',
        contained: !!box && !!bounds && box.left >= bounds.left && box.right <= bounds.right,
        viewportWidth: innerWidth, dockRight: bounds?.right, headingRight: heading?.right,
        headerVisible: !!heading && heading.left >= 0 && heading.right <= innerWidth,
        scale: devicePixelRatio };
    })()`);
    observations.push({ name: scenario.name, ...actual });
    assert(
      actual.disclosureOpen && actual.disclosureHeight > 60,
      `Progress disclosure must actually expand: ${JSON.stringify(actual)}`,
    );
    if (scenario.name === 'completed-turn-waiting-review') {
      const screenshot = await window.webContents.capturePage(undefined, {
        stayAwake: true,
      });
      assert(!screenshot.isEmpty());
      writeFileSync(join(evidence, 'waiting-plan.png'), screenshot.toPNG());
    }
    writeFileSync(
      join(evidence, 'observations.json'),
      JSON.stringify(observations, null, 2),
    );
    assert.equal(
      actual.label,
      scenario.label,
      `${scenario.name}: ${JSON.stringify(actual)}`,
    );
    assert(actual.contained && actual.fontSize >= 8 && actual.fontSize <= 12);
    assert(
      actual.headerVisible && actual.dockRight <= actual.viewportWidth,
      `${scenario.name}: Plan dock/header must fit the window: ${JSON.stringify(actual)}`,
    );
    assert(actual.scale >= 1.25);
    if (scenario.state.activeTurn?.status === 'completed')
      assert(actual.turnLabel?.includes('本轮已结束'));
    if (scenario.name === 'empty-idle')
      assert(!actual.text.includes('正在生成'));
  }
  type DockGeometry = {
    viewportWidth: number;
    leftWidth: number;
    rightWidth: number;
    centerWidth: number;
    rightEdge: number;
    splitterAxis: number;
    rightBoundary: number;
    centerBoundary: number;
    hitTarget: number;
  };
  const layout: Array<DockGeometry & { name: string }> = [];
  const measureLayout = async (name: string) => {
    const geometry = (await window.webContents.executeJavaScript(`(() => {
      const bounds = selector => document.querySelector(selector).getBoundingClientRect();
      const left = bounds('.left-dock'), right = bounds('.right-dock');
      const center = bounds('.document-area');
      const splitter = bounds('.right-resizer');
      return { viewportWidth: innerWidth, leftWidth: left.width, rightWidth: right.width,
        centerWidth: center.width, rightEdge: right.right,
        splitterAxis: splitter.left + splitter.width / 2, rightBoundary: right.left,
        centerBoundary: center.right, hitTarget: splitter.width };
    })()`)) as DockGeometry;
    layout.push({ name, ...geometry });
    writeFileSync(
      join(evidence, 'layout.json'),
      JSON.stringify(layout, null, 2),
    );
    assert(
      geometry.rightEdge <= geometry.viewportWidth + 0.5,
      JSON.stringify(geometry),
    );
    assert(
      geometry.centerWidth >= 259.5 &&
        geometry.leftWidth >= 180 &&
        geometry.rightWidth >= 250,
    );
    assert(Math.abs(geometry.splitterAxis - geometry.rightBoundary) < 1);
    assert(Math.abs(geometry.centerBoundary - geometry.rightBoundary) < 1);
    assert.equal(geometry.hitTarget, 8);
    return geometry;
  };
  const resizeWindow = async (width: number) => {
    window.setBounds({ width });
    await new Promise((resolve) => setTimeout(resolve, 180));
  };
  const keyResize = async (side: string, keyCode: string) => {
    window.focus();
    window.webContents.focus();
    await window.webContents.executeJavaScript(
      `document.querySelector('.${side}-resizer').focus()`,
    );
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await new Promise((resolve) => setTimeout(resolve, 100));
  };
  await measureLayout('minimum-default');
  await resizeWindow(1440);
  await keyResize('left', 'End');
  await keyResize('right', 'End');
  const wide = await measureLayout('wide-saved-maximum');
  assert.equal(wide.leftWidth, 440);
  assert.equal(wide.rightWidth, 520);
  await resizeWindow(960);
  await measureLayout('minimum-saved-maximum');
  await resizeWindow(1440);
  const restored = await measureLayout('wide-preferences-restored');
  assert.equal(restored.leftWidth, 440);
  assert.equal(restored.rightWidth, 520);
  await resizeWindow(960);
  const beforeKeys = await measureLayout('minimum-before-keyboard');
  await keyResize('left', 'Left');
  const afterLeftKey = await measureLayout('minimum-left-keyboard');
  assert(afterLeftKey.leftWidth < beforeKeys.leftWidth);
  await keyResize('right', 'Left');
  const afterKeys = await measureLayout('minimum-keyboard-from-visible-width');
  assert(afterKeys.rightWidth < afterLeftKey.rightWidth);
  const summary = {
    ok: true,
    scenarios: observations,
    layout,
    evidence,
    mutatesOwnerState: false,
  };
  writeFileSync(
    join(evidence, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(`[p32-plan-status-gate] ${JSON.stringify(summary)}`);
  return summary;
}
