import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import electronPath from 'electron';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p15-quality-'));

try {
  mkdirSync(join(temporary, 'projects'), { recursive: true });
  const result = spawnSync(
    electronPath as unknown as string,
    [join(repository, 'dist', 'electron', 'main', 'main.js')],
    {
      cwd: repository,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 90_000,
      env: {
        ...process.env,
        AIGAME_STUDIO_ROOT: repository,
        AIGAME_STUDIO_USER_DATA: join(temporary, 'user-data'),
        AIGAME_STUDIO_P15_QUALITY_GATE_PARENT: join(temporary, 'projects'),
      },
    },
  );
  const processDiagnostic = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n');
  assert.equal(result.status, 0, processDiagnostic || result.error?.message);
  const line = result.stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith('[p15-quality-gate] '));
  assert(line, result.stdout);
  const gate = JSON.parse(line.slice('[p15-quality-gate] '.length)) as {
    ok: boolean;
    highDpi: number;
    minimumViewport: { width: number; height: number };
    noRootOverflow: boolean;
    visibleRegions: boolean;
    landmarkCount: number;
    unnamedControls: number;
    keyboardActivity: string | null;
    sequentialFocus: boolean;
    keyboardResize: boolean;
    pointerResize: boolean;
    pointerResizeDetails: {
      dragStart: { x: number; y: number; leftWidth: number };
      dragMid: { leftWidth: number; active: string | null };
    };
    focusVisible: boolean;
    windowStatePersisted: boolean;
    rendererCrashRecovered: boolean;
    recoveryNotice: boolean;
    projectRestored: boolean;
    darkSourceControl: boolean;
    sourceControlPanelStyled: boolean;
    sourceControlPresentation: {
      visible: boolean;
      panelBackground: string;
      toolbarDisplay: string;
      toolbarColumns: number;
      actionBackground: string;
      actionBorderStyle: string;
      actionFontSize: number;
      inputBackground: string;
      inputBorderStyle: string;
      commitBackground: string;
      sectionHeaderBackground: string;
      fileRowDisplay: string;
      fileRowColumns: number;
      fileButtonBackground: string;
      fileNameFontFamily: string;
      fileNameFontSize: number;
      hasNativeLightSurface: boolean;
    };
    leftAlignedMainMenu: boolean;
    centeredRunControls: boolean;
    changeSetFileTypography: boolean;
    gitFileDecorations: boolean;
    styledScrollbar: boolean;
    copilotLayout: boolean;
    sourceEditorAndInspectorStyled: boolean;
    editorInspectorPresentation: {
      sourceFillsDocument: boolean;
      monacoContentHeight: number;
      codeViewportHeight: number;
      actionGroupDisplay: string;
      actionButtonBackground: string;
      actionButtonBorderStyle: string;
      disabledButtonCursor: string;
      metadataFontSize: number;
      metadataLabelFontSize: number;
      metadataValueFontSize: number;
      typeScriptTokenColors: string[];
    };
    compactControlSurfaces: boolean;
    controlSurfacePresentation: {
      samples: Record<
        string,
        {
          fontSize: number;
          background: string;
          borderStyle: string;
          appearance: string;
        }
      >;
      allCompact: boolean;
      allButtonsStyled: boolean;
      hasNativeLightSurface: boolean;
    };
    providerModelSourceStyled: boolean;
    modelSourcePresentation: {
      assetSource: string;
      settingsSource: string;
      assetSourceText: string;
      settingsSourceText: string;
      assetSourceColor: string;
      settingsSourceColor: string;
      modeButtonAppearance: string;
      modeButtonBorderStyle: string;
    };
    rightPanelDividerContained: boolean;
    rightPanelDividerPresentation: {
      documentBoundary: number;
      dockBoundary: number;
      visibleDividerAxis: number;
      hitTargetWidth: number;
      dockOverflowX: string;
      internalDividerLeftEdges: number[];
    };
    increasedTypography: boolean;
    compactMainMenu: boolean;
    menuPresentation: {
      visible: boolean;
      leftOffset: number;
      topGap: number;
      fontSize: number;
      itemHeight: number;
      background: string;
    };
    documentTabCloseControls: boolean;
    documentTabContextActions: boolean;
    tabCloseControls: {
      tabs: number;
      closeControls: number;
      overviewHasClose: boolean;
    };
    tabActions: {
      labels: string[];
      afterCloseRight: number;
      afterCloseOthers: number;
      afterCloseCurrent: { count: number; overviewOpen: boolean };
    };
  };
  assert.equal(gate.ok, true, JSON.stringify(gate, null, 2));
  assert(gate.highDpi >= 1.25);
  assert.equal(gate.unnamedControls, 0);
  assert.equal(gate.rendererCrashRecovered, true);
  assert.equal(gate.projectRestored, true);
  assert.equal(gate.pointerResize, true);
  assert.equal(gate.pointerResizeDetails.dragMid.active, 'left');
  assert(
    gate.pointerResizeDetails.dragMid.leftWidth >=
      gate.pointerResizeDetails.dragStart.leftWidth + 40,
  );
  assert.equal(gate.darkSourceControl, true);
  assert.equal(gate.sourceControlPanelStyled, true);
  assert.equal(gate.leftAlignedMainMenu, true);
  assert.equal(gate.centeredRunControls, true);
  assert.equal(gate.changeSetFileTypography, true);
  assert.equal(gate.gitFileDecorations, true);
  assert.equal(gate.styledScrollbar, true);
  assert.equal(gate.copilotLayout, true);
  assert.equal(gate.sourceEditorAndInspectorStyled, true);
  assert.equal(gate.providerModelSourceStyled, true);
  assert.equal(gate.rightPanelDividerContained, true);
  assert.equal(gate.increasedTypography, true);
  assert.equal(gate.compactMainMenu, true);
  assert.equal(gate.documentTabCloseControls, true);
  assert.equal(gate.documentTabContextActions, true);
  const feedbackLine = result.stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith('[p31-test-feedback-gate] '));
  assert(
    feedbackLine,
    'Shared test feedback must be checked in real Electron.',
  );
  const feedback = JSON.parse(
    feedbackLine.slice('[p31-test-feedback-gate] '.length),
  );
  assert.equal(feedback.ok, true);
  assert.equal(feedback.reportOnlyFailure, true);
  assert.equal(feedback.reloadRetained, true);
  assert.equal(feedback.corruptRejected, true);
  assert.equal(feedback.packageVerificationUi.busy, true);
  assert.equal(feedback.packageVerificationUi.contained, true);
  assert.equal(feedback.packageVerificationUi.enabled, true);
  const reviewLine = result.stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith('[p32-review-feedback-gate] '));
  assert(reviewLine, 'Reviewer feedback must pass the real desktop IPC flow.');
  const reviewFeedback = JSON.parse(
    reviewLine.slice('[p32-review-feedback-gate] '.length),
  );
  assert.equal(reviewFeedback.ok, true);
  assert.equal(reviewFeedback.cancellationPreservesProposal, true);
  assert.equal(reviewFeedback.historyAfterReload, true);
  assert.equal(reviewFeedback.conflictPreservesDraft, true);
  assert.equal(reviewFeedback.legacySupplement, true);
  assert.equal(reviewFeedback.noProjectSourceApplied, true);
  const planLine = result.stdout
    .split(/\r?\n/u)
    .find((line) => line.startsWith('[p32-plan-status-gate] '));
  assert(planLine, 'Plan status must be verified in the real renderer.');
  const planStatus = JSON.parse(
    planLine.slice('[p32-plan-status-gate] '.length),
  );
  assert.equal(planStatus.ok, true);
  assert.equal(planStatus.scenarios.length, 8);
  assert.equal(planStatus.layout.length, 7);
  assert(
    planStatus.scenarios.every(
      (scenario: { headerVisible: boolean }) => scenario.headerVisible,
    ),
    'Plan headings must stay inside the actual viewport after panel resizing.',
  );

  console.log(
    JSON.stringify(
      {
        gate: 'P15 UI quality',
        ...gate,
        testFeedback: feedback,
        reviewFeedback,
        planStatus,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
