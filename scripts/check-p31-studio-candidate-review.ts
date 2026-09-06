import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import electronPath from 'electron';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p31-review-ui-'));
const projectRoot = join(temporary, 'tank-arena');
const expectedCandidateNames = [
  'player-tank-v1.png',
  'enemy-tank-v1.png',
  'player-shell-v1.png',
  'solid-wall-v1.png',
  'destructible-wall-v1.png',
  'ground-v1.png',
  'command-base-v1.png',
  'explosion-v1.png',
  'ui-panel-v1.png',
].toSorted();

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    })
    .sort((left, right) => left.localeCompare(right));
}

function authoritativeDigest(root: string): string {
  const ignored = new Set(['.git', '.aigame', 'out', 'dist']);
  const hash = createHash('sha256');
  for (const path of filesBelow(root)) {
    const parts = relative(root, path).split(/[\\/]/u);
    if (parts.some((part) => ignored.has(part))) continue;
    hash.update(parts.join('/'));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', 'out', 'dist'].includes(source.split(/[\\/]/u).at(-1) ?? ''),
  });
  const before = authoritativeDigest(projectRoot);
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
        AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_PROJECT: projectRoot,
        AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_PATH_FILTER: 'p31-neon-bastion',
        AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_EXPECTED_COUNT: String(
          expectedCandidateNames.length,
        ),
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
    .find((candidate) => candidate.startsWith('[candidate-review-gate] '));
  assert(line, result.stdout);
  const gate = JSON.parse(line.slice('[candidate-review-gate] '.length)) as {
    ok: boolean;
    ready: boolean;
    presentation: {
      jobCount: number;
      candidateCount: number;
      filterBar: boolean;
      filterButtonCount: number;
      selectedFilterAria: string;
      allFilterAria: string;
      filterFontSize: number;
      filterBackground: string;
      filterBorderStyle: string;
      loadedImageCount: number;
      dataUrlCount: number;
      metadataComplete: boolean;
      actionsComplete: boolean;
      geometryContained: boolean;
      darkSurface: boolean;
      rootOverflowX: boolean;
    };
    candidateNames: string[];
    durableReviewState: Array<{
      jobId: string;
      status: string;
      candidateId: string | null;
      selectedCandidateId: string | null;
      importChangeSetId: string | null;
    }>;
  };
  assert.equal(gate.ok, true, JSON.stringify(gate, null, 2));
  assert.equal(gate.ready, true);
  assert.equal(gate.presentation.jobCount, 9);
  assert.equal(gate.presentation.candidateCount, 9);
  assert.equal(gate.presentation.filterBar, true);
  assert.equal(gate.presentation.filterButtonCount, 5);
  assert.match(gate.presentation.selectedFilterAria, /待审核任务 9 个/u);
  assert.match(gate.presentation.allFilterAria, /全部任务 13 个/u);
  assert(gate.presentation.filterFontSize <= 10);
  assert.notEqual(gate.presentation.filterBackground, 'rgb(255, 255, 255)');
  assert.equal(gate.presentation.filterBorderStyle, 'solid');
  assert.equal(gate.presentation.loadedImageCount, 9);
  assert.equal(gate.presentation.dataUrlCount, 9);
  assert.equal(gate.presentation.metadataComplete, true);
  assert.equal(gate.presentation.actionsComplete, true);
  assert.equal(gate.presentation.geometryContained, true);
  assert.equal(gate.presentation.darkSurface, true);
  assert.equal(gate.presentation.rootOverflowX, false);
  assert.deepEqual(gate.candidateNames, expectedCandidateNames);
  assert.equal(authoritativeDigest(projectRoot), before);
  assert.equal(
    gate.durableReviewState.every(
      (job) =>
        job.status === 'awaitingReview' &&
        job.candidateId?.startsWith('candidate:') &&
        job.selectedCandidateId === null &&
        job.importChangeSetId === null,
    ),
    true,
  );
  console.log(
    JSON.stringify(
      {
        gate: 'P31 real Electron candidate review panel',
        visualJobs: gate.presentation.jobCount,
        inspectablePreviews: gate.presentation.loadedImageCount,
        statusFilter: '待审核 9 / 全部 13',
        reviewActionsVisible: true,
        projectAuthorityUnchanged: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
