import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repository = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), 'aigame-agent-asset-bridge-'));
const projectRoot = join(temporary, 'project');
const token = 'p26-ephemeral-bridge-token';
let received: {
  projectRoot?: string;
  name?: string;
  arguments?: Record<string, unknown>;
} | null = null;

try {
  cpSync(join(repository, 'examples', 'tank-arena'), projectRoot, {
    recursive: true,
  });
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received = JSON.parse(
      Buffer.concat(chunks).toString('utf8'),
    ) as typeof received;
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    const body = JSON.stringify({
      ok: true,
      value: {
        id: 'assetjob:main-process-bridge',
        providerId: 'openai',
        modelId: 'gpt-image-2',
        status: 'awaitingReview',
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
  const responsePromise = new Promise<Record<string, unknown>>(
    (resolveResponse, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`MCP bridge timed out: ${stderr}`)),
        10_000,
      );
      let stdout = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        const line = stdout.split(/\r?\n/u).find((item) => item.trim());
        if (!line) return;
        clearTimeout(timer);
        resolveResponse(JSON.parse(line) as Record<string, unknown>);
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code && code !== 0)
          reject(new Error(`MCP exited ${code}: ${stderr}`));
      });
    },
  );
  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'asset.generate',
        arguments: {
          kind: 'image',
          prompt: 'top-down blue tank sprite',
          outputName: 'agent-tank.png',
        },
      },
    })}\n`,
  );
  const response = await responsePromise;
  const forwarded = received as {
    projectRoot?: string;
    name?: string;
    arguments?: Record<string, unknown>;
  } | null;
  assert.equal(forwarded?.name, 'asset.generate');
  assert.equal(resolve(forwarded?.projectRoot ?? ''), resolve(projectRoot));
  assert.equal(forwarded?.arguments?.providerId, undefined);
  assert.equal(forwarded?.arguments?.modelId, undefined);
  assert.equal(
    (
      response.result as {
        structuredContent?: { modelId?: string; status?: string };
      }
    ).structuredContent?.modelId,
    'gpt-image-2',
  );
  child.kill();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  console.log(
    '[p26-agent-asset-bridge] capability-only MCP request reached the secure main-process broker',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
