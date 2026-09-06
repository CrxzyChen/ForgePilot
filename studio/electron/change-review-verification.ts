import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { StudioChangeSetService } from '../workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../workspace/studio-command-registry.ts';

// Real renderer + preload + IPC + durable review service, isolated gate only.
export async function verifyChangeReview(
  window: BrowserWindow,
  root: string,
  repository: string,
  kernelCliPath: string,
) {
  const author = new StudioCommandRegistry({
    projectRoot: root,
    kernelCliPath,
  });
  const reviewer = new StudioChangeSetService({
    projectRoot: root,
    kernelCliPath,
    registry: author,
  });
  const parent = existsSync(join(repository, 'scripts/check-p15-ui-quality.ts'))
    ? join(repository, 'artifacts')
    : join(tmpdir(), 'aigame-studio-verification');
  mkdirSync(parent, { recursive: true });
  const evidence = mkdtempSync(join(parent, 'p32-review-feedback-ui-'));
  const js = (source: string) => window.webContents.executeJavaScript(source);
  const wait = async (expression: string) => {
    for (let i = 0; i < 100; i++) {
      if (await js(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Change review condition did not appear: ' + expression);
  };
  const screenshot = async (name: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        window.restore();
        window.show();
        window.focus();
        window.webContents.invalidate();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const frame = await window.webContents.capturePage(undefined, {
          stayAwake: true,
        });
        assert(!frame.isEmpty());
        writeFileSync(join(evidence, name), frame.toPNG());
        return;
      } catch (error) {
        if (
          attempt === 2 ||
          !(error instanceof Error) ||
          !/display surface|UnknownVizError/u.test(error.message)
        )
          throw error;
      }
    }
  };
  const make = (name: string) =>
    reviewer.propose({
      summary: '审核反馈测试 · ' + name,
      operations: [
        {
          command: 'project.file.create',
          input: { path: `notes/${name}.txt`, content: 'never applied\n' },
        },
      ],
    });
  const open = async (id: string, action = 'reject') => {
    const selector = `.changeset-card[data-change-id="${id}"] [data-change-action="${action}"]`;
    await js(
      `document.querySelector('.activity-bar button[aria-label="源代码管理"]').click()`,
    );
    await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await js(
      `{ const button = document.querySelector(${JSON.stringify(selector)}); button.focus(); button.click(); }`,
    );
    await wait(
      `Boolean(document.querySelector('.studio-change-review-dialog[open]'))`,
    );
  };
  const fill = (text: string) =>
    js(
      `(() => { const input=document.querySelector('#change-review-reason'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
  const submit = () =>
    js(
      `document.querySelector('.studio-change-review-dialog button[type="submit"]').click()`,
    );
  try {
    window.setBounds({ x: 80, y: 80, width: 960, height: 640 });
    const change = make('review-normal');
    await open(change.id);
    const presentation = await js(`(() => {
      const dialog=document.querySelector('.studio-change-review-dialog'), input=dialog.querySelector('textarea'), button=dialog.querySelector('button[type="submit"]');
      const d=dialog.getBoundingClientRect(), i=input.getBoundingClientRect(), b=button.getBoundingClientRect();
      return { scale:devicePixelRatio, focus:document.activeElement?.id, emptyDisabled:button.disabled, maxLength:input.maxLength, dialogBackground:getComputedStyle(dialog).backgroundColor, inputBackground:getComputedStyle(input).backgroundColor, inputFont:parseFloat(getComputedStyle(input).fontSize), buttonFont:parseFloat(getComputedStyle(button).fontSize), nativeButton:getComputedStyle(button).borderTopStyle==='outset', contained:d.left>=0 && d.top>=0 && d.right<=innerWidth && d.bottom<=innerHeight && i.right<=d.right && b.bottom<=d.bottom, height:b.height, rootOverflow:document.documentElement.scrollWidth>innerWidth };
    })()`);
    assert.equal(presentation.focus, 'change-review-reason');
    assert.equal(presentation.emptyDisabled, true);
    assert.equal(presentation.maxLength, 4096);
    assert.equal(presentation.dialogBackground, 'rgb(17, 23, 33)');
    assert.equal(presentation.inputBackground, 'rgb(9, 11, 16)');
    assert.equal(presentation.inputFont, 10);
    assert.equal(presentation.buttonFont, 10);
    assert.equal(presentation.nativeButton, false);
    assert.equal(presentation.contained, true);
    assert.equal(presentation.rootOverflow, false);
    assert(presentation.height >= 28 && presentation.scale >= 1.25);
    await fill('Tick 0 缺少 UI 对象；请修正夹具依赖，保留真实碰撞断言。');
    await wait(
      `!document.querySelector('.studio-change-review-dialog button[type="submit"]').disabled`,
    );
    await screenshot('review-960-150.png');
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await wait(`!document.querySelector('.studio-change-review-dialog')`);
    assert.equal(reviewer.read(change.id).status, 'awaitingApproval');
    assert.equal(
      await js(`document.activeElement?.getAttribute('data-change-action')`),
      'reject',
    );
    await open(change.id);
    const reason = 'Tick 0 缺少 UI 对象；请修正夹具依赖，保留真实碰撞断言。';
    await fill(reason);
    await submit();
    await wait(
      `Boolean(document.querySelector('.changeset-card[data-change-id="${change.id}"][data-status="rejected"] [data-review-feedback-id]'))`,
    );
    const saved = reviewer.read(change.id);
    assert.equal(saved.rejectionFeedback?.reason, reason);
    assert.equal(saved.rejectionFeedback?.proposalHash, change.proposalHash);
    assert.equal(saved.approval, null);
    await wait(`!document.querySelector('.studio-change-review-dialog')`);
    window.webContents.reload();
    await new Promise<void>((resolve) =>
      window.webContents.once('did-finish-load', () => resolve()),
    );
    await wait(
      `Boolean(document.querySelector('.activity-bar button[aria-label="源代码管理"]'))`,
    );
    await js(
      `document.querySelector('.activity-bar button[aria-label="源代码管理"]').click()`,
    );
    await wait(
      `Boolean(document.querySelector('[data-review-feedback-id="${saved.rejectionFeedback!.id}"]'))`,
    );
    await js(
      `document.querySelector('[data-review-feedback-id="${saved.rejectionFeedback!.id}"] summary').click()`,
    );
    assert.equal(
      await js(
        `document.querySelector('[data-review-feedback-id="${saved.rejectionFeedback!.id}"] p').textContent`,
      ),
      reason,
    );
    await screenshot('history-960-150.png');

    const stale = make('review-stale');
    await open(stale.id);
    await fill('意见在审批冲突后仍应保留。');
    reviewer.approve(stale.id); // Another reviewer acts while this dialog is open.
    await submit();
    await wait(`Boolean(document.querySelector('#change-review-error'))`);
    assert.match(
      await js(`document.querySelector('#change-review-error').textContent`),
      /CHANGESET_NOT_REVIEWABLE/u,
    );
    assert.equal(
      await js(`document.querySelector('#change-review-reason').value`),
      '意见在审批冲突后仍应保留。',
    );
    assert.equal(
      await js(
        `document.querySelector('.studio-change-review-dialog button[type="submit"]').disabled`,
      ),
      false,
    );
    assert.equal(reviewer.read(stale.id).status, 'approved');
    assert.equal(reviewer.read(stale.id).rejectionFeedback, undefined);
    await screenshot('error-960-150.png');
    await js(`document.querySelector('[aria-label="取消审核反馈"]').click()`);
    await wait(`!document.querySelector('.studio-change-review-dialog')`);

    const legacy = make('review-legacy');
    reviewer.reject(legacy.id);
    await open(legacy.id, 'feedback');
    await fill('为旧拒绝记录补充具体修正意见。');
    await submit();
    await wait(
      `Boolean(document.querySelector('.changeset-card[data-change-id="${legacy.id}"] [data-review-feedback-id]'))`,
    );
    assert.equal(reviewer.read(legacy.id).status, 'rejected');
    assert.equal(
      reviewer.read(legacy.id).rejectionFeedback?.reason,
      '为旧拒绝记录补充具体修正意见。',
    );
    for (const name of ['review-normal', 'review-stale', 'review-legacy'])
      assert.equal(existsSync(join(root, 'notes', name + '.txt')), false);
    const result = {
      ok: true,
      presentation,
      cancellationPreservesProposal: true,
      focusRestored: true,
      realIpcRejection: true,
      historyAfterReload: true,
      conflictPreservesDraft: true,
      legacySupplement: true,
      noProjectSourceApplied: true,
      evidence,
    };
    writeFileSync(
      join(evidence, 'summary.json'),
      JSON.stringify(result, null, 2),
    );
    console.log('[p32-review-feedback-gate] ' + JSON.stringify(result));
    return result;
  } finally {
    author.dispose();
  }
}
