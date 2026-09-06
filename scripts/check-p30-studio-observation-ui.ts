import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import electronPath from 'electron';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p30-studio-ui-'));
const projectRoot = join(temporary, 'tank-arena');

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
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
        AIGAME_STUDIO_P30_GATE_PROJECT: projectRoot,
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
    .find((candidate) => candidate.startsWith('[p30-observation-gate] '));
  assert(line, result.stdout);
  const gate = JSON.parse(line.slice('[p30-observation-gate] '.length)) as {
    ok: boolean;
    captureActivated: boolean;
    observation: {
      card: boolean;
      imageDataUrl: boolean;
      imageWidth: number;
      imageHeight: number;
      checkpointVisible: boolean;
      drawableVisible: boolean;
      audioVisible: boolean;
      diagnosticsVisible: boolean;
      geometryContained: boolean;
      background: string;
      border: string;
      rootOverflowX: boolean;
    };
    observationId: string;
    artifactPath: string;
    stableDiagnosticTargets: boolean;
  };
  assert.equal(gate.ok, true, JSON.stringify(gate, null, 2));
  assert.equal(gate.captureActivated, true);
  assert.equal(gate.observation.card, true);
  assert.equal(gate.observation.imageDataUrl, true);
  assert(gate.observation.imageWidth > 0);
  assert(gate.observation.imageHeight > 0);
  assert.equal(gate.observation.geometryContained, true);
  assert.equal(gate.observation.rootOverflowX, false);
  assert.notEqual(gate.observation.background, 'rgb(255, 255, 255)');
  assert.match(gate.observationId, /^observation:[a-f0-9]{24}$/u);
  assert.match(
    gate.artifactPath,
    /^\.aigame\/local\/runtime-observations\/[a-f0-9]{24}\.png$/u,
  );
  assert.equal(gate.stableDiagnosticTargets, true);
  console.log(
    JSON.stringify(
      {
        gate: 'P30 real Electron observation panel',
        observationId: gate.observationId,
        inspectableFrame: true,
        midnightWorkshopStyle: true,
        geometryContained: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
