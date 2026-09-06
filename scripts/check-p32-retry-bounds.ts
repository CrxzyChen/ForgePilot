import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectError } from '../studio/project/project-types.ts';
import { StudioAssetJobBroker } from '../studio/workspace/studio-asset-job-broker.ts';
import { StudioCommandRegistry } from '../studio/workspace/studio-command-registry.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p32-retry-'));
const projectRoot = join(temporary, 'project');

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  const registry = new StudioCommandRegistry({
    projectRoot,
    kernelCliPath: join(repository, 'target', 'debug', 'kernelctl.exe'),
  });
  const broker = new StudioAssetJobBroker({
    projectRoot,
    registry,
    getCredentialRef: () => 'credential:p32-fixture',
    getProviderConnection: (_providerId, credentialRef) => ({
      credentialRef: credentialRef ?? 'credential:p32-fixture',
      region: 'us',
      workspaceId: null,
      apiHost: 'http://127.0.0.1:43932/v1',
    }),
    resolveCredential: () => 'P32_REDACTED_FIXTURE',
    fetchImpl: async (_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      if (body.includes('terminal-quota'))
        return new Response('', { status: 402 });
      return new Response('', {
        status: 429,
        headers: { 'retry-after': '2' },
      });
    },
  });

  const limited = broker.submit({
    kind: 'soundEffect',
    prompt: 'bounded-rate-limit',
    outputName: 'bounded.mp3',
    variants: 1,
  });
  const firstFailure = await broker.approveAndRun(limited.id);
  assert.equal(firstFailure.failure?.category, 'rate-limit');
  assert.equal(firstFailure.attempts, 1);
  assert.equal(firstFailure.retryPolicy.maxAttempts, 3);
  assert.equal(firstFailure.retryPolicy.backoffBaseMs, 1_000);
  assert.equal(firstFailure.retryPolicy.backoffCapMs, 30_000);
  assert.ok(
    Date.parse(firstFailure.retryPolicy.nextRetryAt ?? '') > Date.now(),
  );
  await assert.rejects(
    () => broker.retryWithPolicy(limited.id),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_JOB_BACKOFF_ACTIVE',
  );

  const secondFailure = await broker.approveAndRetry(limited.id);
  assert.equal(secondFailure.attempts, 2);
  const thirdFailure = await broker.approveAndRetry(limited.id);
  assert.equal(thirdFailure.attempts, 3);
  await assert.rejects(
    () => broker.approveAndRetry(limited.id),
    (error: unknown) =>
      error instanceof ProjectError &&
      error.code === 'ASSET_JOB_RETRY_LIMIT_REACHED',
  );

  const terminal = broker.submit({
    kind: 'soundEffect',
    prompt: 'terminal-quota',
    outputName: 'terminal.mp3',
    variants: 1,
  });
  const terminalFailure = await broker.approveAndRun(terminal.id);
  assert.equal(terminalFailure.failure?.category, 'quota');
  assert.equal(terminalFailure.failure?.retryable, false);
  await assert.rejects(
    () => broker.approveAndRetry(terminal.id),
    (error: unknown) =>
      error instanceof ProjectError && error.code === 'ASSET_JOB_NOT_RETRYABLE',
  );
  registry.dispose();

  console.log(
    JSON.stringify(
      {
        gate: 'P32 media retry and backoff bounds',
        maxAttempts: 3,
        backoffBaseMs: 1_000,
        backoffCapMs: 30_000,
        providerRetryAfterHonored: true,
        agentBackoffEnforced: true,
        terminalFailureRejected: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
