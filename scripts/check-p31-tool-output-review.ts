import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p31-tool-output-'));
const projectRoot = join(temporary, 'project');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
    filter: (source) =>
      !['.git', '.aigame', 'out', 'dist'].includes(
        source.split(/[\\/]/u).at(-1) ?? '',
      ),
  });
  const authorityBefore = createHash('sha256')
    .update(readFileSync(join(projectRoot, 'assets', 'asset-manifest.json')))
    .digest('hex');
  const candidateRoot = join(
    projectRoot,
    '.aigame',
    'local',
    'asset-candidates',
    'p31-contract',
  );
  mkdirSync(candidateRoot, { recursive: true });
  const candidatePath = join(candidateRoot, 'contract-tank.png');
  writeFileSync(candidatePath, png);
  const expectedSha256 = createHash('sha256').update(png).digest('hex');
  const child = spawn(
    process.execPath,
    [
      join(repository, 'dist', 'electron', 'engine-mcp', 'server.js'),
      '--project',
      projectRoot,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        AIGAME_STUDIO_KERNEL_CLI: join(
          repository,
          'target',
          'debug',
          'kernelctl.exe',
        ),
        AIGAME_STUDIO_SCRIPT_HOST: join(
          repository,
          'target',
          'debug',
          'project-script-host.exe',
        ),
        AIGAME_STUDIO_GAME_RUNTIME: join(
          repository,
          'target',
          'debug',
          'ai-game-player.exe',
        ),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (stderr += String(chunk)));
  let stdout = '';
  const pending = new Map<number, (value: Record<string, unknown>) => void>();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    const lines = stdout.split(/\r?\n/u);
    stdout = lines.pop() ?? '';
    for (const line of lines.filter((item) => item.trim())) {
      const message = JSON.parse(line) as { id?: number } & Record<
        string,
        unknown
      >;
      if (typeof message.id === 'number') {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
    }
  });
  const rpc = (
    id: number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> =>
    new Promise((resolveResponse, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`MCP tool-output gate timed out: ${stderr}`)),
        10_000,
      );
      pending.set(id, (value) => {
        clearTimeout(timer);
        resolveResponse(value);
      });
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
      );
    });
  const structured = <T>(response: Record<string, unknown>): T =>
    (response.result as { structuredContent: T }).structuredContent;

  const listed = await rpc(1, 'tools/list', {});
  const toolNames = (
    listed.result as { tools?: Array<{ name?: string }> }
  ).tools?.map((tool) => tool.name);
  assert(toolNames?.includes('asset.register_tool_output'));
  assert(toolNames?.includes('asset.recommend'));
  assert.equal(toolNames?.includes('asset.select'), false);

  const registrationArguments = {
    kind: 'image',
    providerId: 'openai',
    modelId: 'gpt-image-2',
    prompt: 'P31 one-pixel contract fixture; not a release asset',
    outputName: 'contract-tank.png',
    sourcePath: candidatePath,
    expectedSha256,
    toolCallId: 'tool-call:p31/contract-output',
    idempotencyKey: 'idem:p31_contract_output',
    parameters: { purpose: 'contract-check' },
  };
  const firstResponse = await rpc(2, 'tools/call', {
    name: 'asset.register_tool_output',
    arguments: registrationArguments,
  });
  const first = structured<{
    id: string;
    executionSource: string;
    status: string;
    providerOperationId: null;
    toolCallId: string;
    candidates: Array<{
      id: string;
      artifactId: string;
      sha256: string;
      reviewState: string;
      recommendation: unknown;
    }>;
    approval: unknown;
  }>(firstResponse);
  assert.match(first.id, /^asset-job:/u);
  assert.equal(first.executionSource, 'codex-media-tool');
  assert.equal(first.status, 'awaitingReview');
  assert.equal(first.providerOperationId, null);
  assert.equal(first.toolCallId, registrationArguments.toolCallId);
  assert.equal(first.approval, null);
  assert.equal(first.candidates.length, 1);
  assert.equal(first.candidates[0]?.sha256, expectedSha256);
  assert.equal(first.candidates[0]?.reviewState, 'awaitingReview');

  const duplicate = structured<{ id: string }>(
    await rpc(3, 'tools/call', {
      name: 'asset.register_tool_output',
      arguments: registrationArguments,
    }),
  );
  assert.equal(duplicate.id, first.id);

  const recommendation = structured<{
    candidates: Array<{
      id: string;
      recommendation: null | {
        recommended: boolean;
        reasons: string[];
        evidenceIds: string[];
      };
    }>;
  }>(
    await rpc(4, 'tools/call', {
      name: 'asset.recommend',
      arguments: {
        id: first.id,
        candidateId: first.candidates[0]?.id,
        reasons: ['Hash-bound artifact is visible in the Studio review queue.'],
        evidenceIds: [first.candidates[0]?.artifactId],
      },
    }),
  );
  assert.equal(recommendation.candidates[0]?.recommendation?.recommended, true);

  const jobList = structured<{
    jobs: Array<{ id: string; status: string; selectedCandidateId: null }>;
  }>(
    await rpc(5, 'tools/call', {
      name: 'asset.job_list',
      arguments: {},
    }),
  );
  assert.equal(jobList.jobs.filter((job) => job.id === first.id).length, 1);
  assert.equal(
    jobList.jobs.find((job) => job.id === first.id)?.selectedCandidateId,
    null,
  );

  const outsidePath = join(temporary, 'outside.png');
  writeFileSync(outsidePath, png);
  const outside = structured<{ code: string }>(
    await rpc(6, 'tools/call', {
      name: 'asset.register_tool_output',
      arguments: {
        ...registrationArguments,
        sourcePath: outsidePath,
        toolCallId: 'tool-call:p31/outside-output',
        idempotencyKey: 'idem:p31_outside_output',
      },
    }),
  );
  assert.equal(outside.code, 'ASSET_TOOL_OUTPUT_SOURCE_REJECTED');

  const missing = structured<{ code: string }>(
    await rpc(7, 'tools/call', {
      name: 'asset.register_tool_output',
      arguments: {
        ...registrationArguments,
        sourcePath: join(candidateRoot, 'missing.png'),
        toolCallId: 'tool-call:p31/missing-output',
        idempotencyKey: 'idem:p31_missing_output',
      },
    }),
  );
  assert.equal(missing.code, 'ASSET_TOOL_OUTPUT_SOURCE_MISSING');

  const mismatch = structured<{ code: string }>(
    await rpc(8, 'tools/call', {
      name: 'asset.register_tool_output',
      arguments: {
        ...registrationArguments,
        expectedSha256: '0'.repeat(64),
        toolCallId: 'tool-call:p31/hash-output',
        idempotencyKey: 'idem:p31_hash_output',
      },
    }),
  );
  assert.equal(mismatch.code, 'ASSET_TOOL_OUTPUT_HASH_MISMATCH');

  const authorityAfter = createHash('sha256')
    .update(readFileSync(join(projectRoot, 'assets', 'asset-manifest.json')))
    .digest('hex');
  assert.equal(authorityAfter, authorityBefore);

  child.kill();
  console.log(
    JSON.stringify(
      {
        gate: 'P31 Codex media-tool candidate review bridge',
        toolOutputRegistered: true,
        duplicateSideEffectPrevented: true,
        controlledCandidateBoundary: true,
        hashBound: true,
        humanSelectionNotAgentCallable: true,
        projectAuthorityMutated: false,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
