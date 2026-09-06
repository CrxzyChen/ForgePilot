import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import type { ChangeSet } from '../examples/tank-legacy-regression/studio-server/kernel-control-service.ts';

const repository = process.cwd();
const version = JSON.parse(readFileSync('package.json', 'utf8'))
  .version as string;
const releaseName = `AI-Game-Kernel-MVP-${version}`;
const bundleRoot = join(repository, 'artifacts', 'windows', releaseName);
const zipPath = `${bundleRoot}.zip`;

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function packageWindows(): string {
  const result = spawnSync('node', ['scripts/package-windows.mjs'], {
    cwd: repository,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const report = JSON.parse(
    result.stdout.trim().split(/\r?\n/u).at(-1) ?? '{}',
  ) as {
    ok: boolean;
  };
  assert.equal(report.ok, true);
  return readFileSync(join(bundleRoot, 'BUILD-MANIFEST.json'), 'utf8');
}

const firstManifest = packageWindows();
const secondManifest = packageWindows();
const manifest = JSON.parse(secondManifest) as {
  cargoLocked: boolean;
  files: Record<string, string>;
  node: string;
  reproducibleCoreHash: string;
  rustc: string;
  studioBuildId: string;
};
const first = JSON.parse(firstManifest) as typeof manifest;
assert.equal(
  manifest.reproducibleCoreHash,
  first.reproducibleCoreHash,
  'two locked builds must reproduce the native, protocol, and source payload',
);
assert.equal(
  manifest.studioBuildId,
  first.studioBuildId,
  'two locked Studio builds must keep the configured application build ID',
);
assert.equal(manifest.cargoLocked, true);
assert.equal(manifest.node, 'v24.11.1');
assert.match(manifest.rustc, /^rustc 1\.91\.1/u);
for (const [path, expected] of Object.entries(manifest.files)) {
  assert.equal(sha256(join(bundleRoot, ...path.split('/'))), expected, path);
}
assert(existsSync(zipPath));
const zipSidecar = readFileSync(`${zipPath}.sha256`, 'utf8')
  .trim()
  .split(/\s+/u)[0];
assert.equal(sha256(zipPath), zipSidecar);

const packagedLockCheck = spawnSync(
  process.execPath,
  [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    'ci',
    '--dry-run',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ],
  {
    cwd: bundleRoot,
    encoding: 'utf8',
    timeout: 120_000,
  },
);
assert.equal(
  packagedLockCheck.status,
  0,
  packagedLockCheck.stderr || packagedLockCheck.error?.message,
);

const cli = join(bundleRoot, 'bin', 'kernelctl.exe');
const runtime = join(bundleRoot, 'bin', 'ai-game-kernel-runtime.exe');
const project = join(bundleRoot, 'examples', 'frontier.game.json');
const input = join(bundleRoot, 'fixtures', 'replay', 'frontier.input.json');
const golden = readFileSync(
  join(bundleRoot, 'fixtures', 'replay', 'frontier.golden.sha256'),
  'utf8',
).trim();

function packagedCli(...args: string[]): Record<string, unknown> {
  const result = spawnSync(cli, args, {
    cwd: bundleRoot,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

assert.equal(packagedCli('validate', project).ok, true);
assert.equal(packagedCli('verify', project, input, golden).stateHash, golden);
const batchStarted = performance.now();
const batch = packagedCli('batch', project, input, '1000').batch as Record<
  string,
  unknown
>;
const batchMs = performance.now() - batchStarted;
assert.equal(batch.wins, 1000);
assert.equal(batch.losses, 0);
assert(
  batchMs < 10_000,
  `packaged 1000-run balance batch took ${batchMs.toFixed(1)} ms`,
);

const runtimeSmoke = spawnSync(runtime, ['--smoke', '3'], {
  cwd: bundleRoot,
  encoding: 'utf8',
  timeout: 120_000,
});
assert.equal(
  runtimeSmoke.status,
  0,
  runtimeSmoke.stderr || runtimeSmoke.error?.message,
);
const smoke = JSON.parse(
  runtimeSmoke.stdout.trim().split(/\r?\n/u).at(-1) ?? '{}',
) as { framesPresented: number; averageFrameMs: number };
assert.equal(smoke.framesPresented, 3);
assert(smoke.averageFrameMs < 50);

process.env.AI_GAME_KERNEL_CLI = cli;
const controlModule = (await import(
  `${pathToFileURL(join(bundleRoot, 'examples', 'tank-legacy-regression', 'studio-server', 'kernel-control-service.ts')).href}?p7`
)) as typeof import('../examples/tank-legacy-regression/studio-server/kernel-control-service.ts');

const temporary = mkdtempSync(join(tmpdir(), 'ai-game-kernel-p7-'));
try {
  const temporaryProject = join(temporary, 'frontier.game.json');
  const temporaryInput = join(temporary, 'frontier.input.json');
  cpSync(project, temporaryProject);
  cpSync(input, temporaryInput);
  const original = readFileSync(temporaryProject, 'utf8');
  const candidateDocument = JSON.parse(original) as {
    worlds: Array<{
      entities: Array<{ components: Array<Record<string, unknown>> }>;
    }>;
  };
  candidateDocument.worlds[0]!.entities[6]!.components[3]!.amountPerCycle = 3;
  const candidate = `${JSON.stringify(candidateDocument, null, 2)}\n`;
  writeFileSync(temporaryProject, candidate, 'utf8');
  writeFileSync(
    join(temporary, '.ai-game-kernel-write-interrupted.tmp'),
    candidate,
    'utf8',
  );
  const transactionDirectory = join(
    temporary,
    '.ai-game-kernel',
    'transactions',
  );
  mkdirSync(transactionDirectory, { recursive: true });
  writeFileSync(
    join(transactionDirectory, 'interrupted.json'),
    `${JSON.stringify({
      version: 1,
      id: 'interrupted',
      target: 'frontier.game.json',
      temporary: '.ai-game-kernel-write-interrupted.tmp',
      previousSource: original,
      candidateHash: createHash('sha256').update(candidate).digest('hex'),
    })}\n`,
    'utf8',
  );

  const control = new controlModule.KernelControlService({
    workspaceRoot: temporary,
    kernelRoot: bundleRoot,
    persistAudit: false,
  });
  assert.equal(
    readFileSync(temporaryProject, 'utf8'),
    original,
    'startup recovery must restore exact pre-crash bytes',
  );
  const audit = (await control.dispatch('audit.list')) as {
    events: Array<{ action: string }>;
  };
  assert(audit.events.some((event) => event.action === 'recovery.restore'));

  const change = (await control.dispatch('change.plan', {
    projectPath: 'frontier.game.json',
    summary: '首位开发者任务：把工厂每周期产出从 2 调整为 3',
    operations: [
      {
        op: 'replace',
        path: '/worlds/0/entities/6/components/3/amountPerCycle',
        value: 3,
      },
    ],
  })) as ChangeSet;
  assert.equal(change.status, 'planned');
  assert.equal(readFileSync(temporaryProject, 'utf8'), original);
  const grant = (await control.dispatch('change.approve', {
    changeId: change.id,
  })) as { token: string };
  await control.dispatch('change.apply', {
    changeId: change.id,
    approvalToken: grant.token,
  });
  const simulation = (await control.dispatch('simulation.run', {
    projectPath: 'frontier.game.json',
    inputPath: 'frontier.input.json',
  })) as Record<string, unknown>;
  const result = simulation.result as {
    snapshot: { outcome: { status: string } };
  };
  assert.equal(result.snapshot.outcome.status, 'won');
  await control.dispatch('change.rollback', { changeId: change.id });
  assert.equal(readFileSync(temporaryProject, 'utf8'), original);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

const bridgeModule = (await import(
  `${pathToFileURL(join(bundleRoot, 'examples', 'tank-legacy-regression', 'studio-server', 'http-control-server.ts')).href}?p7`
)) as typeof import('../examples/tank-legacy-regression/studio-server/http-control-server.ts');
const bridge = bridgeModule.createStudioBridge({
  workspaceRoot: bundleRoot,
  kernelRoot: bundleRoot,
});
await new Promise<void>((resolve, reject) => {
  bridge.server.once('error', reject);
  bridge.server.listen(0, '127.0.0.1', resolve);
});
try {
  const address = bridge.server.address();
  assert(address && typeof address === 'object');
  const health = (await fetch(`http://127.0.0.1:${address.port}/health`).then(
    (response) => response.json(),
  )) as { ok: boolean };
  assert.equal(health.ok, true);
} finally {
  await bridge.close();
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

const studioPort = await unusedPort();
const wrangler = join(
  repository,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);
const studioServer = spawn(
  process.execPath,
  [
    wrangler,
    'dev',
    '--config',
    join(bundleRoot, 'dist', 'server', 'wrangler.json'),
    '--ip',
    '127.0.0.1',
    '--port',
    String(studioPort),
  ],
  { cwd: bundleRoot, windowsHide: true },
);
let studioReady = false;
try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch(`http://127.0.0.1:${studioPort}/studio`);
      if (response.ok && (await response.text()).includes('AI Game Kernel')) {
        studioReady = true;
        break;
      }
    } catch {
      // Wrangler is still starting.
    }
    if (studioServer.exitCode !== null) break;
  }
  assert(
    studioReady,
    'packaged Studio did not serve /studio within 30 seconds',
  );
} finally {
  studioServer.kill();
}

for (const required of [
  'Start-Game.cmd',
  'Start-Studio.cmd',
  'docs/QUICKSTART.md',
  'docs/ARCHITECTURE.md',
  'docs/CONTROL_PROTOCOL.md',
  'docs/testing/FIRST_DEVELOPER_TASK.md',
]) {
  assert(existsSync(join(bundleRoot, ...required.split('/'))), required);
}

console.log(
  `[P7] reproducible ${Object.keys(manifest.files).length + 1}-file Windows bundle, crash recovery, packaged Runtime/Studio, first-developer workflow, and 1000-run batch passed (${batchMs.toFixed(1)} ms)`,
);
