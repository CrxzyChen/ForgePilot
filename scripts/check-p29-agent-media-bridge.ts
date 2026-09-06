import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readElevenLabsProviderFailure } from '../studio/workspace/elevenlabs-provider-error.ts';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-p29-agent-media-'));
const projectRoot = join(temporary, 'project');
const token = 'p29-ephemeral-bridge-token';
const received: Array<{
  projectRoot?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}> = [];

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
  });
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const call = JSON.parse(
      Buffer.concat(chunks).toString('utf8'),
    ) as (typeof received)[number];
    received.push(call);
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    const failure =
      call.arguments?.prompt === 'P29 safe provider diagnostic'
        ? await readElevenLabsProviderFailure(
            Response.json(
              {
                detail: {
                  status: 'quota_exceeded',
                  message: token,
                  request_id: token,
                },
              },
              { status: 400 },
            ),
          )
        : null;
    const body = JSON.stringify({
      ok: true,
      value: {
        id: `asset-job:bridge-${received.length}`,
        kind: call.arguments?.kind,
        providerId:
          call.arguments?.kind === 'soundEffect' ? 'elevenlabs' : 'openai',
        modelId:
          call.arguments?.kind === 'soundEffect'
            ? 'eleven_text_to_sound_v2'
            : 'gpt-image-2',
        status: failure ? 'failed' : 'awaitingApproval',
        ...(failure
          ? {
              failure,
              error: `${failure.code}: ${failure.message}`,
              attempts: 1,
              candidates: [],
            }
          : {}),
      },
    });
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    });
    response.end(body);
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
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
        AIGAME_STUDIO_ASSET_BROKER_URL: `http://127.0.0.1:${address.port}/v1/asset-tools`,
        AIGAME_STUDIO_ASSET_BROKER_TOKEN: token,
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
        () => reject(new Error(`MCP bridge timed out: ${stderr}`)),
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

  const toolsResponse = await rpc(1, 'tools/list', {});
  const tools = (
    toolsResponse.result as { tools?: Array<{ name?: string }> }
  ).tools?.map((tool) => tool.name);
  assert(tools?.includes('asset.generate'));
  assert.match(
    (
      toolsResponse.result as {
        tools: Array<{ name: string; description: string }>;
      }
    ).tools.find((tool) => tool.name === 'asset.generate')?.description ?? '',
    /450/u,
  );
  assert(tools?.includes('asset.recommend'));
  assert(tools?.includes('asset.regenerate'));
  assert(tools?.includes('asset.master_audio'));
  assert(tools?.includes('asset.inspect_candidate'));
  assert.equal(tools?.includes('asset.select'), false);

  for (const [id, kind, outputName] of [
    [2, 'image', 'agent-tank.png'],
    [3, 'soundEffect', 'agent-cannon.mp3'],
  ] as const) {
    const response = await rpc(id, 'tools/call', {
      name: 'asset.generate',
      arguments: {
        kind,
        prompt: `P29 capability-only ${kind} request`,
        outputName,
      },
    });
    assert.equal(
      (
        response.result as {
          structuredContent?: { kind?: string; status?: string };
        }
      ).structuredContent?.kind,
      kind,
    );
  }
  assert.equal(received.length, 2);
  for (const call of received) {
    assert.equal(resolve(call.projectRoot ?? ''), resolve(projectRoot));
    assert.equal(call.name, 'asset.generate');
    assert.equal(call.arguments?.providerId, undefined);
    assert.equal(call.arguments?.modelId, undefined);
    assert.equal(call.arguments?.credentialRef, undefined);
  }
  assert.deepEqual(
    received.map((call) => call.arguments?.kind),
    ['image', 'soundEffect'],
  );
  await rpc(20, 'tools/call', {
    name: 'asset.resume',
    arguments: { id: 'asset-job:bridge-1' },
  });
  assert.equal(received.at(-1)?.name, 'asset.resume');
  assert.deepEqual(received.at(-1)?.arguments, { id: 'asset-job:bridge-1' });
  await rpc(21, 'tools/call', {
    name: 'asset.master_audio',
    arguments: {
      id: 'asset-job:bridge-1',
      candidateId: 'candidate:original',
      expectedSha256: 'a'.repeat(64),
      spec: { startMs: 0, endMs: 200, fadeInMs: 2, fadeOutMs: 8, gainDb: -3 },
    },
  });
  assert.equal(received.at(-1)?.name, 'asset.master_audio');
  assert.equal(received.at(-1)?.arguments?.candidateId, 'candidate:original');
  await rpc(22, 'tools/call', {
    name: 'asset.inspect_candidate',
    arguments: { id: 'asset-job:bridge-1', candidateId: 'candidate:original' },
  });
  assert.equal(received.at(-1)?.name, 'asset.inspect_candidate');

  const failedResponse = await rpc(23, 'tools/call', {
    name: 'asset.generate',
    arguments: {
      kind: 'soundEffect',
      prompt: 'P29 safe provider diagnostic',
      outputName: 'diagnostic.mp3',
    },
  });
  const failedJob = (
    failedResponse.result as {
      structuredContent?: {
        status?: string;
        failure?: { category?: string; retryable?: boolean; message?: string };
      };
    }
  ).structuredContent;
  assert.equal(failedJob?.status, 'failed');
  assert.equal(failedJob?.failure?.category, 'quota');
  assert.equal(failedJob?.failure?.retryable, false);
  assert.match(failedJob?.failure?.message ?? '', /quota_exceeded/u);
  assert.equal(JSON.stringify(failedResponse).includes(token), false);
  assert.equal(stderr.includes(token), false);

  child.kill();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  console.log(
    JSON.stringify(
      {
        gate: 'P29 project Codex media bridge',
        capabilityOnlyRequests: ['image', 'soundEffect'],
        providerFieldsOmittedByAgent: true,
        humanSelectionNotAgentCallable: true,
        safeProviderFailureVisibleToAgent: true,
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
