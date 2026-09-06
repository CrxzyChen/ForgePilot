import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  audioMasterSpec,
  masterAudioCandidate,
} from '../studio/workspace/audio-candidate-master.ts';
import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioChangeSetService } from '../studio/workspace/studio-change-set-service.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const root = resolve(import.meta.dirname, '..');
const player = resolve(
  process.argv[2] ?? join(root, 'target/debug/ai-game-player.exe'),
);
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p31-audio-master-'));
const projectRoot = join(temporary, 'project');
cpSync(join(root, 'examples/tank-arena'), projectRoot, {
  recursive: true,
  filter: (source) =>
    !['.git', '.aigame', 'out', 'dist'].includes(
      source.split(/[\\/]/u).at(-1) ?? '',
    ),
});
const kernelCliPath = resolve(
  process.argv[5] ?? join(root, 'target/debug/kernelctl.exe'),
);
const registry = new StudioCommandRegistry({ projectRoot, kernelCliPath });
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
const before = readFileSync(
  join(projectRoot, 'assets/asset-manifest.json'),
  'utf8',
);
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const input = broker.submit({
  kind: 'soundEffect',
  providerId: 'local-placeholder',
  prompt: 'TEST ONLY fixture audio',
  outputName: 'master-fixture.wav',
  variants: 1,
});
const job = broker.run(input.id);
const source = job.candidates[0]!;
const original = readFileSync(join(projectRoot, source.path));
const spec = { startMs: 0, endMs: 200, fadeInMs: 2, fadeOutMs: 8, gainDb: -3 };
const result = broker.masterCandidate(job.id, source.id, source.sha256, spec);
const mcpServer =
  process.argv[3] ?? join(root, 'dist/electron/engine-mcp/server.js');
const mcpNode = process.argv[4] ?? process.execPath;
const mcp = spawnSync(mcpNode, [mcpServer, '--project', projectRoot], {
  cwd: projectRoot,
  windowsHide: true,
  encoding: 'utf8',
  timeout: 30_000,
  maxBuffer: 1024 * 1024,
  env: {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    NODE_ENV: 'production',
    ELECTRON_RUN_AS_NODE: '1',
    AIGAME_STUDIO_KERNEL_CLI: kernelCliPath,
    AIGAME_STUDIO_GAME_RUNTIME: player,
  },
  input:
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'asset.master_audio',
        arguments: {
          id: job.id,
          candidateId: source.id,
          expectedSha256: source.sha256,
          spec,
        },
      },
    }) + '\n',
});
assert.equal(mcp.status, 0, mcp.error?.message ?? mcp.stderr);
const mcpResult = JSON.parse(mcp.stdout.trim()).result;
assert.equal(mcpResult.isError, false, JSON.stringify(mcpResult));
assert.deepEqual(mcpResult.structuredContent, result);
assert.equal(result.attempts, job.attempts);
assert.equal(result.candidates.length, 2);
assert.equal(result.status, 'awaitingReview');
assert.equal(result.selectedCandidateId, null);
assert.equal(result.importChangeSetId, null);
assert.equal(result.actualCostCny, job.actualCostCny);
const master = result.candidates[1]!;
assert.equal(master.parentCandidateId, source.id);
assert.equal(master.reviewState, 'awaitingReview');
assert.deepEqual(master.media, {
  kind: 'audio',
  codec: 'pcm_s16le',
  durationMs: 200,
  sampleRateHz: 48000,
  channels: 1,
});
assert.equal(master.audioMaster?.sourceSha256, source.sha256);
assert.deepEqual(master.audioMaster?.spec, spec);
assert.equal(
  hash(readFileSync(join(projectRoot, source.path))),
  hash(original),
);
assert.equal(
  readFileSync(join(projectRoot, 'assets/asset-manifest.json'), 'utf8'),
  before,
);
assert.equal(
  broker.masterCandidate(job.id, source.id, source.sha256, spec).candidates
    .length,
  2,
);
const resumed = new StudioAssetJobBroker({
  projectRoot,
  registry,
  changes,
  audioInspectorPath: player,
});
assert.equal(
  resumed.masterCandidate(job.id, source.id, source.sha256, spec).candidates[1]
    ?.id,
  master.id,
);
assert.throws(() =>
  resumed.masterCandidate(job.id, source.id, '0'.repeat(64), spec),
);
assert.throws(() =>
  resumed.masterCandidate(job.id, master.id, master.sha256, spec),
);
for (const invalid of [
  null,
  {},
  { ...spec, startMs: -1 },
  { ...spec, endMs: 0 },
  { ...spec, endMs: 60011 },
  { ...spec, gainDb: 49 },
  { ...spec, fadeOutMs: 201 },
  { ...spec, script: 'shell' },
  { ...spec, gainDb: NaN },
])
  assert.throws(() => audioMasterSpec(invalid));
assert.throws(() =>
  masterAudioCandidate(original, { ...spec, endMs: 60000 }, player),
);
assert.throws(() =>
  masterAudioCandidate(Buffer.from('fake mp3'), spec, player),
);
writeFileSync(join(projectRoot, source.path), Buffer.from('tampered fixture'));
assert.throws(() =>
  resumed.masterCandidate(job.id, source.id, source.sha256, spec),
);
writeFileSync(join(projectRoot, source.path), original);
const preview = resumed.previewCandidate(job.id, master.id);
const measured = resumed.inspectCandidate(job.id, master.id);
assert.equal(measured.subjectiveListening, false);
assert(measured.audio!.peak > 0 && measured.audio!.peak < 1);
assert(measured.audio!.rms > 0);
assert.match(preview.dataUrl, /^data:audio\/wav;base64,/u);
const selected = resumed.select(job.id, master.id, 'human', {
  reason: 'TEST FIXTURE ONLY: technical acceptance, not subjective listening',
  license: 'test-fixture',
});
const proposal = changes.read(selected.importChangeSetId!);
assert.equal(proposal.status, 'awaitingApproval');
assert.throws(() => changes.apply(proposal.id));
assert.equal(
  readFileSync(join(projectRoot, 'assets/asset-manifest.json'), 'utf8'),
  before,
);
changes.approve(proposal.id);
changes.apply(proposal.id);
const imported = join(projectRoot, 'assets/imported/master-fixture.wav');
assert.equal(hash(readFileSync(imported)), master.sha256);
const provenance = JSON.parse(
  readFileSync(
    join(projectRoot, 'assets/provenance/master-fixture.json'),
    'utf8',
  ),
);
assert(provenance.sourceHashes.includes(source.sha256));
assert(provenance.derivedContentHashes.includes(master.sha256));
assert.deepEqual(provenance.transformations[0], master.audioMaster);
changes.rollback(proposal.id);
assert.equal(existsSync(imported), false);
assert.equal(
  readFileSync(join(projectRoot, 'assets/asset-manifest.json'), 'utf8'),
  before,
);
assert.equal(hash(readFileSync(join(projectRoot, source.path))), source.sha256);
assert.equal(hash(readFileSync(join(projectRoot, master.path))), master.sha256);
console.log(
  JSON.stringify(
    {
      gate: 'P31 bounded audio master and reviewed import',
      temporary,
      master,
      originalPreserved: true,
      providerCallsAdded: 0,
      importApprovalAndRollback: true,
      result: 'passed',
    },
    null,
    2,
  ),
);
