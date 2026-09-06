import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import electronPath from 'electron';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'ai-game-studio-p23-viewport-'));
const project = join(temporary, 'pong-2d');

try {
  cpSync(join(repository, 'examples', 'pong-2d'), project, { recursive: true });
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
        AIGAME_STUDIO_P23_GATE_PROJECT: project,
      },
    },
  );
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || result.error?.message,
  );
  const line = result.stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith('[p23-runtime-gate] '));
  assert(line, result.stdout);
  const gate = JSON.parse(line.slice('[p23-runtime-gate] '.length)) as {
    ok: boolean;
    scene: {
      canvas: boolean;
      width: number;
      height: number;
      domGameObjects: number;
      projection: string;
    };
    sceneInteraction: {
      selected: boolean;
      cleared: boolean;
      shortcut: string;
      zoomed: boolean;
      panned: boolean;
      reset: boolean;
    };
    objectCreation: {
      before: number;
      after: number;
      named: boolean;
      dialogClosed: boolean;
    };
    transformInteraction: {
      previewingBeforePointerUp: boolean;
      previewLatencyMs: number;
      releaseLatencyMs: number;
      commitLatencyMs: number;
      fileUnchangedDuringPreview: boolean;
      fileChangedAfterPointerUp: boolean;
      historyTransactions: number;
    };
    sessionId: string;
    generation: number;
    liveAdvance: { started: number; advanced: number };
    liveInput: {
      observedTick: number;
      allocatedTick: number;
      queueLatencyMs: number;
    };
    pauseRetained: { paused: number; retained: number };
    stepped: { before: number; after: number };
    inputSequence: { before: number; after: number };
    sharedProjection: string;
    failureIsolated: boolean;
    stopped: string;
  };
  assert.equal(gate.ok, true, JSON.stringify(gate, null, 2));
  assert.match(gate.sessionId, /^session:[a-z0-9]+$/u);
  assert.equal(gate.scene.domGameObjects, 0);
  assert.equal(gate.scene.projection, 'render.snapshot');
  assert.equal(gate.sceneInteraction.selected, true);
  assert.equal(gate.sceneInteraction.cleared, true);
  assert.equal(gate.sceneInteraction.shortcut, '移动');
  assert.equal(gate.sceneInteraction.zoomed, true);
  assert.equal(gate.sceneInteraction.panned, true);
  assert.equal(gate.sceneInteraction.reset, true);
  assert.equal(gate.objectCreation.after, gate.objectCreation.before + 1);
  assert.equal(gate.objectCreation.named, true);
  assert.equal(gate.objectCreation.dialogClosed, true);
  assert.equal(gate.transformInteraction.previewingBeforePointerUp, true);
  assert(gate.transformInteraction.previewLatencyMs < 200);
  assert(gate.transformInteraction.releaseLatencyMs < 200);
  assert(gate.transformInteraction.commitLatencyMs < 1_500);
  assert.equal(gate.transformInteraction.fileUnchangedDuringPreview, true);
  assert.equal(gate.transformInteraction.fileChangedAfterPointerUp, true);
  assert.equal(gate.transformInteraction.historyTransactions, 1);
  assert(gate.liveAdvance.advanced > gate.liveAdvance.started);
  assert(gate.liveInput.allocatedTick >= gate.liveInput.observedTick);
  assert(gate.liveInput.queueLatencyMs < 16);
  assert.equal(gate.pauseRetained.paused, gate.pauseRetained.retained);
  assert.equal(gate.stepped.after, gate.stepped.before + 1);
  assert(gate.inputSequence.after > gate.inputSequence.before);
  assert.equal(gate.sharedProjection, '3.0.0-preview.1');
  assert.equal(gate.failureIsolated, true);

  console.log(
    JSON.stringify(
      {
        gate: 'P23 Studio engine viewport and live session',
        ...gate,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
