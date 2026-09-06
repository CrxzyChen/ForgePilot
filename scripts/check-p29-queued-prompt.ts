import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';
import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';

const root = resolve(import.meta.dirname, '..');
const fixture = mkdtempSync(join(tmpdir(), 'aigame-queued-prompt-'));
const projectRoot = join(fixture, 'project');
cpSync(join(root, 'examples/tank-arena'), projectRoot, {
  recursive: true,
  filter: (path) =>
    !['.git', '.aigame', 'out', 'dist'].includes(
      path.split(/[\\/]/u).at(-1) ?? '',
    ),
});
const registry = new StudioCommandRegistry({
  projectRoot,
  kernelCliPath: join(root, 'target/debug/kernelctl.exe'),
});
try {
  const broker = new StudioAssetJobBroker({ projectRoot, registry });
  const job = broker.submit({
    kind: 'soundEffect',
    providerId: 'elevenlabs',
    modelId: 'eleven_text_to_sound_v2',
    prompt: 'a'.repeat(450),
    outputName: 'queued-sfx.mp3',
  });
  const storePath = join(projectRoot, '.aigame/local/asset-jobs/jobs.json');
  const store = JSON.parse(readFileSync(storePath, 'utf8'));
  const legacy = store.jobs.find((item: { id: string }) => item.id === job.id);
  legacy.prompt = 'a'.repeat(451);
  writeFileSync(storePath, JSON.stringify(store));
  let credentialReads = 0;
  let providerCalls = 0;
  const resumed = new StudioAssetJobBroker({
    projectRoot,
    registry,
    getCredentialRef: () => 'credential:test-only',
    resolveCredential: () => {
      credentialReads++;
      return 'test-only';
    },
    fetchImpl: async () => {
      providerCalls++;
      throw new Error('Preflight must prevent all outbound calls');
    },
  });
  const result = await resumed.approveAndRun(job.id);
  assert.equal(result.status, 'failed');
  assert.equal(result.failure?.code, 'ASSET_JOB_PROMPT_TOO_LONG');
  assert.equal(result.failure?.category, 'invalid-parameter');
  assert.equal(result.failure?.retryable, false);
  assert.equal(result.attempts, 0);
  assert.equal(result.attemptHistory.length, 0);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.prompt.length, 451);
  assert.equal(result.idempotencyKey, job.idempotencyKey);
  assert.equal(credentialReads, 0);
  assert.equal(providerCalls, 0);
  console.log(
    JSON.stringify(
      {
        gate: 'P29 queued prompt preflight',
        fixture,
        preservedPromptAndIdentity: true,
        credentialReads,
        providerCalls,
        attempts: result.attempts,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  registry.dispose();
}
