import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { StudioCommandRegistry } from '../workspace/studio-command-registry.ts';
import type { SceneDocument } from '../workspace/scene-authoring-service.ts';
import type { ProjectRuntimeResult } from '../runtime/project-script-runtime.ts';

// Instrumented development gate only; never touches the owner project/profile.
export async function verifyTestFeedback(
  window: BrowserWindow,
  root: string,
  repository: string,
  toolchain: { kernelCliPath: string; scriptHostPath: string },
) {
  window.setBounds({ x: 80, y: 80, width: 960, height: 640 });
  const evidenceParent = existsSync(
    join(repository, 'scripts/check-p15-ui-quality.ts'),
  )
    ? join(repository, 'artifacts')
    : join(tmpdir(), 'aigame-studio-verification');
  mkdirSync(evidenceParent, { recursive: true });
  const evidence = mkdtempSync(join(evidenceParent, 'p31-test-feedback-ui-'));
  let captureRecoveryAttempts = 0;
  let frameWaitTimeouts = 0;
  const capture = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // DOM state can precede the compositor's first post-reload surface.
        // An occluded post-crash renderer can stop delivering animation frames.
        // Bound this readiness hint; a real, nonempty capture is still required.
        let frameTimer: ReturnType<typeof setTimeout> | undefined;
        let painted: boolean;
        try {
          painted = await Promise.race([
            window.webContents.executeJavaScript(
              `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`,
            ) as Promise<boolean>,
            new Promise<boolean>((resolve) => {
              frameTimer = setTimeout(() => resolve(false), 2_000);
            }),
          ]);
        } finally {
          clearTimeout(frameTimer);
        }
        if (!painted) {
          frameWaitTimeouts++;
          window.restore();
          window.show();
          window.focus();
          window.webContents.setBackgroundThrottling(false);
          window.webContents.invalidate();
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        const frame = await window.webContents.capturePage(undefined, {
          stayAwake: true,
        });
        assert(!frame.isEmpty(), 'Electron returned an empty frame');
        return frame.toPNG();
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !/display surface|UnknownVizError/u.test(error.message) ||
          attempt === 2
        )
          throw error;
        captureRecoveryAttempts++;
        window.restore();
        window.showInactive();
        window.webContents.invalidate();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error('No real Electron frame was captured');
  };
  const author = new StudioCommandRegistry({
    projectRoot: root,
    kernelCliPath: toolchain.kernelCliPath,
    scriptHostPath: toolchain.scriptHostPath,
  });
  try {
    author.execute('scene.object.create', {
      scene: author.snapshot().entryScene,
      name: 'Test Feedback Probe',
    });
    const scene = JSON.parse(
      author.readText(author.snapshot().entryScene).source,
    ) as SceneDocument;
    const object = scene.objects.find((o) =>
      o.components.some((c) => c.type === 'core:transform2d'),
    )!;
    assert(
      object,
      'The isolated UI gate requires a created 2D transform target.',
    );
    const component = object.components.find(
      (c) => c.type === 'core:transform2d',
    )!;
    const field = Object.keys(component.data)[0]!;
    const path = 'tests/external-feedback.test.json';
    mkdirSync(join(root, 'tests', 'fixtures'), { recursive: true });
    writeFileSync(
      join(root, 'tests', 'fixtures', 'feedback.game.json'),
      JSON.stringify(scene),
    );
    writeFileSync(
      join(root, path),
      JSON.stringify({
        ticks: 2,
        assertions: [
          {
            id: 'assertion:feedback',
            tick: 1,
            target: { objectId: object.id, componentId: component.id, field },
            operator: 'equals',
            expected: component.data[field],
          },
        ],
      }),
    );
    const passed = author.execute('test.run', { test: path })
      .data as ProjectRuntimeResult;
    assert.equal(passed.status, 'completed');
    const select = () =>
      window.webContents.executeJavaScript(
        `document.querySelector('.activity-bar button[aria-label="测试"]')?.click()`,
      );
    const wait = async (status: string) => {
      for (let i = 0; i < 100; i++) {
        const found = await window.webContents.executeJavaScript(
          `document.querySelector('.test-case[data-test-path="${path}"]')?.getAttribute('data-status') === '${status}'`,
        );
        if (found) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Test feedback did not reach ${status}`);
    };
    await select();
    await wait('passed');
    // Only a report changes: prove the internal-record watcher reaches the renderer.
    const failed = author.execute('test.run', { test: path, ticks: 1 })
      .data as ProjectRuntimeResult;
    assert.equal(failed.status, 'failed');
    await wait('failed');
    const failedFrame = join(evidence, 'failed-960-150.png');
    writeFileSync(failedFrame, await capture());
    window.webContents.reload();
    await new Promise<void>((resolve) =>
      window.webContents.once('did-finish-load', () => resolve()),
    );
    await select();
    await wait('failed');
    const reportId = author.snapshot().testRuns![path]!.testRunId;
    const reportPath = join(
      root,
      '.aigame/local/test-results',
      `${reportId.replace(':', '_')}.json`,
    );
    const corrupt = JSON.parse(readFileSync(reportPath, 'utf8'));
    corrupt.result.status = 'completed';
    writeFileSync(reportPath, JSON.stringify(corrupt));
    await wait('unavailable');
    const presentation = await window.webContents.executeJavaScript(`(() => {
      const row=document.querySelector('.test-case[data-test-path="${path}"]');
      const dock=document.querySelector('.left-dock');
      const r=row.getBoundingClientRect(), d=dock.getBoundingClientRect();
      const label=row.querySelector('small'), style=getComputedStyle(label);
      return {text:label.textContent,fontSize:parseFloat(style.fontSize),color:style.color,withinDock:r.left>=d.left && r.right<=d.right+1,fixtureListed:[...document.querySelectorAll('.test-case')].some(n=>n.textContent.includes('feedback.game.json')),scale:devicePixelRatio};
    })()`);
    assert.equal(presentation.text, '历史不可用');
    assert.equal(presentation.fixtureListed, false);
    assert.equal(presentation.withinDock, true);
    assert(presentation.scale >= 1.25);
    assert(presentation.fontSize >= 9 && presentation.fontSize <= 10);
    assert.equal(presentation.color, 'rgb(231, 184, 93)');
    writeFileSync(join(evidence, 'unavailable-960-150.png'), await capture());
    await window.webContents.executeJavaScript(
      `document.querySelector('.activity-bar button[aria-label="构建"]')?.click()`,
    );
    const waitPackage = async (status: string) => {
      for (let i = 0; i < 600; i++) {
        const found = await window.webContents.executeJavaScript(
          `document.querySelector('.package-verification-feedback')?.getAttribute('data-status') === '${status}'`,
        );
        if (found) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Package UI did not reach ${status}`);
    };
    await window.webContents.executeJavaScript(
      `document.querySelector('[data-verify-package="release"]').click()`,
    );
    await waitPackage('failed');
    // Build through the real desktop API, then verify using the visible button.
    const build = await window.webContents.executeJavaScript(
      `window.aiGameStudio.workspace.builds.run('release')`,
    );
    assert.equal(build.ok, true, JSON.stringify(build));
    await window.webContents.executeJavaScript(
      `document.querySelector('[data-verify-package="release"]').click()`,
    );
    await waitPackage('running');
    const busy = await window.webContents.executeJavaScript(
      `document.querySelector('[data-verify-package="release"]').disabled`,
    );
    assert.equal(busy, true);
    await waitPackage('passed');
    const packageUi = await window.webContents.executeJavaScript(`(() => {
      const button=document.querySelector('[data-verify-package="release"]'), style=getComputedStyle(button);
      const b=button.getBoundingClientRect(), d=document.querySelector('.left-dock').getBoundingClientRect();
      const text=document.querySelector('.package-verification-feedback').textContent;
      const report=document.querySelector('.build-report-editor pre'), rs=getComputedStyle(report), heading=getComputedStyle(document.querySelector('.build-report-editor h2'));
      return {fontSize:parseFloat(style.fontSize),background:style.backgroundColor,borderStyle:style.borderTopStyle,contained:b.left>=d.left && b.right<=d.right+1,enabled:!button.disabled,text,hasReceipt:report.textContent.includes('package-verification:'),reportFontSize:parseFloat(rs.fontSize),reportFontFamily:rs.fontFamily,reportBackground:rs.backgroundColor,headingFontSize:parseFloat(heading.fontSize)};
    })()`);
    assert(packageUi.fontSize >= 9 && packageUi.fontSize <= 10);
    assert.equal(packageUi.contained, true);
    assert.equal(packageUi.enabled, true);
    assert.notEqual(packageUi.borderStyle, 'outset');
    assert(packageUi.text.includes('5 帧原生渲染'));
    assert.equal(packageUi.hasReceipt, true);
    assert.equal(packageUi.reportFontSize, 10);
    assert.equal(packageUi.headingFontSize, 11);
    assert(packageUi.reportFontFamily.includes('Consolas'));
    assert.equal(packageUi.reportBackground, 'rgb(9, 11, 16)');
    writeFileSync(
      join(evidence, 'package-verification-960-150.png'),
      await capture(),
    );
    const result = {
      ok: true,
      externalPass: true,
      reportOnlyFailure: true,
      reloadRetained: true,
      corruptRejected: true,
      presentation,
      captureRecoveryAttempts,
      frameWaitTimeouts,
      packageVerificationUi: { busy, ...packageUi },
      evidence,
    };
    writeFileSync(
      join(evidence, 'summary.json'),
      JSON.stringify(result, null, 2),
    );
    console.log(`[p31-test-feedback-gate] ${JSON.stringify(result)}`);
    return result;
  } finally {
    author.dispose();
  }
}
