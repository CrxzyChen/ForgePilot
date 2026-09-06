import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import electronPath from 'electron';
import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { inspectAudioCandidate } from '../studio/workspace/audio-candidate-inspection.ts';

const root = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p31-candidate-audio-'));
const projectRoot = join(temporary, 'project');
const player = join(root, 'target/debug/ai-game-player.exe');
const kernelCliPath = join(root, 'target/debug/kernelctl.exe');
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
function authorityDigest(directory: string): string {
  const digest = createHash('sha256');
  function visit(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (['.aigame', '.git', 'out', 'dist'].includes(entry.name)) continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else
        digest.update(relative(directory, child)).update(readFileSync(child));
    }
  }
  visit(directory);
  return digest.digest('hex');
}

cpSync(join(root, 'examples/tank-arena'), projectRoot, {
  recursive: true,
  filter: (source) =>
    !['.git', '.aigame', 'out', 'dist'].includes(
      source.split(/[\\/]/u).at(-1) ?? '',
    ),
});
const registry = new StudioCommandRegistry({ projectRoot, kernelCliPath });
try {
  const changes = new StudioChangeSetService({
    projectRoot,
    kernelCliPath,
    registry,
  });
  const broker = new StudioAssetJobBroker({
    projectRoot,
    registry,
    changes,
    audioInspectorPath: player,
  });
  for (const name of ['audio-preview-wav', 'audio-preview-mp3']) {
    const job = broker.submit({
      kind: 'soundEffect',
      providerId: 'local-placeholder',
      prompt: 'TEST ONLY local candidate playback fixture',
      outputName: name,
      variants: 1,
    });
    const generated = broker.run(job.id);
    assert.equal(
      generated.status,
      'awaitingReview',
      JSON.stringify(generated.failure),
    );
  }
  // The fixture store is isolated. No external request or original Tank write occurs.
  const storePath = join(projectRoot, '.aigame/local/asset-jobs/jobs.json');
  const store = JSON.parse(readFileSync(storePath, 'utf8')) as {
    jobs: Array<{
      candidates: Array<{
        path: string;
        mime: string;
        sha256: string;
        bytes: number;
        media: unknown;
      }>;
    }>;
  };
  const candidate = store.jobs[1]!.candidates[0]!;
  const mp3 = Buffer.from(
    readFileSync(
      join(root, 'crates/player/tests/fixtures/tone.mp3.hex'),
      'utf8',
    ).replace(/\s/gu, ''),
    'hex',
  );
  candidate.path = candidate.path.replace(/\.wav$/u, '.mp3');
  candidate.mime = 'audio/mpeg';
  candidate.sha256 = hash(mp3);
  candidate.bytes = mp3.byteLength;
  candidate.media = inspectAudioCandidate(mp3, candidate.mime, player);
  writeFileSync(join(projectRoot, candidate.path), mp3);
  writeFileSync(storePath, JSON.stringify(store, null, 2) + '\n');
  const reopened = new StudioAssetJobBroker({
    projectRoot,
    registry,
    changes,
    audioInspectorPath: player,
  });
  console.log(
    JSON.stringify({
      fixtureJobs: reopened.list().map((job) => ({
        status: job.status,
        candidates: job.candidates.map((value) => ({
          path: value.path,
          mime: value.mime,
        })),
      })),
    }),
  );
  const before = authorityDigest(projectRoot);
  const beforeJobs = readFileSync(storePath, 'utf8');
  // Pin only this isolated fixture's initial panel. An asynchronous workspace
  // restore can otherwise overwrite the gate's early Resource-button click.
  // The gate still exercises the real button, candidate cards and media APIs.
  registry.setWorkspaceState({
    ...registry.getWorkspaceState(),
    activity: 'assets',
  });
  const installedExecutable = process.argv[2];
  const run = spawnSync(
    installedExecutable ?? (electronPath as unknown as string),
    installedExecutable ? [] : [join(root, 'dist/electron/main/main.js')],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 90_000,
      env: {
        ...process.env,
        ELECTRON_NO_ATTACH_CONSOLE: '1',
        AIGAME_STUDIO_ROOT: installedExecutable ? undefined : root,
        AIGAME_STUDIO_USER_DATA: join(temporary, 'user-data'),
        AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_PROJECT: projectRoot,
        AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_PATH_FILTER: 'audio-preview-',
        AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_EXPECTED_COUNT: '2',
        AIGAME_STUDIO_CANDIDATE_REVIEW_GATE_MEDIA: 'audio',
      },
    },
  );
  const line = run.stdout
    ?.split(/\r?\n/u)
    .find((value) => value.startsWith('[candidate-review-gate] '));
  assert(line, `${run.stdout}\n${run.stderr}\n${run.error?.message ?? ''}`);
  const gate = JSON.parse(line.slice('[candidate-review-gate] '.length));
  console.log(
    JSON.stringify({ gate: 'P31 real candidate audio playback', ...gate }),
  );
  assert.equal(run.status, 0, JSON.stringify(gate));
  assert.equal(gate.ok, true);
  assert.equal(gate.presentation.loadedAudioCount, 2);
  assert.equal(gate.presentation.dataUrlCount, 2);
  assert.equal(gate.presentation.geometryContained, true);
  assert.equal(gate.audioPlayback.externalMediaBlocked, true);
  assert.match(gate.audioPlayback.policy, /media-src 'self' data:/u);
  assert.match(gate.audioPlayback.policy, /connect-src 'none'/u);
  assert(!/media-src[^;]*(?:https?:|\*)/u.test(gate.audioPlayback.policy));
  assert.equal(authorityDigest(projectRoot), before);
  assert.equal(
    readFileSync(storePath, 'utf8'),
    beforeJobs,
    'playback must not select/import/update jobs',
  );
} finally {
  registry.dispose();
  rmSync(temporary, { recursive: true, force: true });
}
